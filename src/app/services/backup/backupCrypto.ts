/**
 * 备份包敏感凭据加密（AES-256-GCM + PBKDF2-SHA256）。
 *
 * 背景：导出备份勾选「同步配置」时，历史实现将 Token / WebDAV 密码以明文 JSON 落地，
 * 备份文件一旦被分发即等于泄露全部云端凭据。现改为：导出时由用户输入一次性导出密码，
 * 四个敏感字段（githubToken / giteeToken / webdavPassword / serverToken）被剥离出明文区，
 * 加密为 secrets 块随包携带；导入时输入同一密码才能还原。非敏感字段（仓库地址、用户名等
 * 元数据）保持明文，便于在不解密的情况下识别配置归属。
 *
 * 算法：PBKDF2（SHA-256，150k 迭代，16B 随机盐）派生 AES-GCM 256 密钥；12B 随机 IV。
 * GCM 自带完整性校验：密码错误或密文被篡改在 decrypt 阶段统一表现为解密失败。
 */
import { logger } from '@/platform/utils/logger';

import type { EncryptedSecrets, SyncSettingsBackup } from '@/platform/types';

/** 参与加密的敏感字段：这些字段绝不再以明文出现在加密后的备份包里 */
export const SECRET_SYNC_FIELDS = ['githubToken', 'giteeToken', 'webdavPassword', 'serverToken'] as const;

const PBKDF2_ITERATIONS = 150_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

const toB64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

const fromB64 = (b64: string): Uint8Array => {
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
};

const deriveKey = async (passphrase: string, salt: Uint8Array): Promise<CryptoKey> => {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

/** 从同步配置中提取待加密的敏感字段；无任何非空敏感字段时返回 undefined */
const collectSecrets = (settings: SyncSettingsBackup): Record<string, string> | undefined => {
  const secrets: Record<string, string> = {};
  for (const field of SECRET_SYNC_FIELDS) {
    const value = settings[field];
    if (typeof value === 'string' && value.length > 0) secrets[field] = value;
  }
  return Object.keys(secrets).length > 0 ? secrets : undefined;
};

/**
 * 加密同步配置中的敏感字段：返回剥除明文敏感字段、附带 secrets 块的新配置对象。
 * 无敏感字段时原样返回（附一个 secrets 字段都没有）；加密失败抛错由调用方提示。
 */
export async function encryptSyncSettingsSecrets(
  settings: SyncSettingsBackup,
  passphrase: string
): Promise<SyncSettingsBackup> {
  const secrets = collectSecrets(settings);
  if (!secrets) return { ...settings };

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt);
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(JSON.stringify(secrets))
  );

  const { ...rest } = settings;
  for (const field of SECRET_SYNC_FIELDS) delete rest[field];
  return {
    ...rest,
    secrets: { v: 1, salt: toB64(salt), iv: toB64(iv), data: toB64(new Uint8Array(cipher)) },
  };
}

/**
 * 解密备份包中的 secrets 块，还原为敏感字段键值对。
 * 密码错误 / 密文损坏统一抛出 Error（GCM 校验失败），由调用方转为用户提示。
 */
export async function decryptSyncSettingsSecrets(
  blob: EncryptedSecrets,
  passphrase: string
): Promise<Record<string, string>> {
  const salt = fromB64(blob.salt);
  const iv = fromB64(blob.iv);
  const data = fromB64(blob.data);
  const key = await deriveKey(passphrase, salt);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, data as BufferSource);
  const parsed: unknown = JSON.parse(new TextDecoder().decode(plain));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('解密结果非对象');
  }
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v === 'string') result[k] = v;
  }
  return result;
}

/** 校验备份包携带的 secrets 块结构是否完整（用于清洗与导入前判断） */
export const isValidEncryptedSecrets = (value: unknown): value is EncryptedSecrets => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return v['v'] === 1 && typeof v['salt'] === 'string' && typeof v['iv'] === 'string' && typeof v['data'] === 'string';
};

/** 解密失败的统一用户提示语（不区分密码错与密文损坏，避免给攻击者探测信息） */
export const describeSecretDecryptFailure = (err: unknown): string => {
  logger.warn('backup', '凭据解密失败', err);
  return '凭据解密失败：导出密码错误或备份已损坏';
};
