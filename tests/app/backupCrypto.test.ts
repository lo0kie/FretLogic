import { describe, expect, it, vi } from 'vitest';

import {
  decryptSyncSettingsSecrets,
  describeSecretDecryptFailure,
  encryptSyncSettingsSecrets,
  isValidEncryptedSecrets,
} from '@/app/services/backup/backupCrypto';
import { logger } from '@/platform/utils/logger';

import type { EncryptedSecrets, SyncSettingsBackup } from '@/platform/types';

vi.mock('@/platform/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/** 加密侧写死 600k 迭代，往返一次要做两遍派生，故本文件的用例都放宽超时 */
const CRYPTO_TIMEOUT_MS = 30_000;

const githubSettings: SyncSettingsBackup = {
  kind: 'github',
  token: 'ghp_plaintext_token',
  owner: 'owner',
  repo: 'repo',
  branch: 'main',
  path: 'backup.json',
};

const webdavSettings: SyncSettingsBackup = {
  kind: 'webdav',
  serverUrl: 'https://dav.example.com/dav',
  username: 'user',
  password: 'plaintext-password',
};

const toB64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

/** 手工造一个 v1 信封（无 iter）：锁定「历史包固定按 150k 派生」这条兼容契约 */
const buildV1Blob = async (passphrase: string, secrets: Record<string, string>): Promise<EncryptedSecrets> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 150_000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(secrets))
  );
  return { v: 1, salt: toB64(salt), iv: toB64(iv), data: toB64(new Uint8Array(cipher)) };
};

describe('备份包凭据加解密', () => {
  it('无敏感字段时原样返回，不带 secrets 块', async () => {
    const settings: SyncSettingsBackup = { kind: 'server', serverUrl: 'https://api.example.com' };
    const encrypted = await encryptSyncSettingsSecrets(settings, 'pw');
    expect(encrypted).toEqual(settings);
    expect(encrypted.secrets).toBeUndefined();
  });

  it('空串凭据视同未填写，不生成 secrets 块', async () => {
    const encrypted = await encryptSyncSettingsSecrets({ ...githubSettings, token: '' }, 'pw');
    expect(encrypted.secrets).toBeUndefined();
  });

  it(
    '加密后明文区不再含凭据，且非敏感元数据保持可读',
    async () => {
      const encrypted = await encryptSyncSettingsSecrets(githubSettings, 'pw');
      const plain = JSON.stringify(encrypted);
      expect(plain).not.toContain(githubSettings.token);
      // 加密不改变分支，但返回类型是宽联合（各分支字段集不同）：取分支特有字段前先按 kind 收窄。
      // 这一步本身也是断言 —— kind 真被改了就不该静默跳过
      if (encrypted.kind !== 'github') throw new Error(`github 配置加密后 kind 变成了 ${encrypted.kind}`);
      expect(encrypted.owner).toBe(githubSettings.owner);
      expect(encrypted.repo).toBe(githubSettings.repo);
      expect(isValidEncryptedSecrets(encrypted.secrets)).toBe(true);
    },
    CRYPTO_TIMEOUT_MS
  );

  it(
    '往返：同一密码可还原出原凭据（github 的 token 与 webdav 的 password 落点不同）',
    async () => {
      for (const settings of [githubSettings, webdavSettings]) {
        const encrypted = await encryptSyncSettingsSecrets(settings, 'pw');
        const restored = await decryptSyncSettingsSecrets(encrypted.secrets as EncryptedSecrets, 'pw');
        expect(Object.values(restored)).toEqual([
          settings.kind === 'github' ? githubSettings.token : webdavSettings.password,
        ]);
      }
    },
    CRYPTO_TIMEOUT_MS
  );

  it(
    '密码错误统一表现为解密失败（不给攻击者区分「密码错」与「包损坏」的信息）',
    async () => {
      const encrypted = await encryptSyncSettingsSecrets(githubSettings, 'right');
      await expect(decryptSyncSettingsSecrets(encrypted.secrets as EncryptedSecrets, 'wrong')).rejects.toThrow();
      expect(describeSecretDecryptFailure(new Error('boom'))).toBe('凭据解密失败：导出密码错误或备份已损坏');
      expect(logger.warn).toHaveBeenCalled();
    },
    CRYPTO_TIMEOUT_MS
  );

  it(
    'v1 信封（无 iter）按历史常量 150k 解密：调高当前迭代数不得波及历史备份',
    async () => {
      const blob = await buildV1Blob('pw', { githubToken: githubSettings.token as string });
      expect(isValidEncryptedSecrets(blob)).toBe(true);
      await expect(decryptSyncSettingsSecrets(blob, 'pw')).resolves.toEqual({ githubToken: githubSettings.token });
    },
    CRYPTO_TIMEOUT_MS
  );

  it('secrets 块结构校验：版本、迭代数与各字段类型/长度都要过', () => {
    const valid: EncryptedSecrets = { v: 2, iter: 600_000, salt: 'AAAA', iv: 'BBBB', data: 'CCCC' };
    expect(isValidEncryptedSecrets(valid)).toBe(true);

    expect(isValidEncryptedSecrets(null)).toBe(false);
    expect(isValidEncryptedSecrets([])).toBe(false);
    expect(isValidEncryptedSecrets({ ...valid, v: 3 })).toBe(false);
    // v2 起必须携带合法 iter：缺省 / 越界 / 非整数一律视为结构不完整
    expect(isValidEncryptedSecrets({ ...valid, iter: undefined })).toBe(false);
    expect(isValidEncryptedSecrets({ ...valid, iter: 10 })).toBe(false);
    expect(isValidEncryptedSecrets({ ...valid, iter: 10_000_000 })).toBe(false);
    expect(isValidEncryptedSecrets({ ...valid, iter: 1000.5 })).toBe(false);
    // 字段类型
    expect(isValidEncryptedSecrets({ ...valid, salt: 123 })).toBe(false);
    // 超长 data 会在 atob + TypedArray 双份分配时 OOM，必须挡在解密之前
    expect(isValidEncryptedSecrets({ ...valid, data: 'x'.repeat(5_000_001) })).toBe(false);
  });
});
