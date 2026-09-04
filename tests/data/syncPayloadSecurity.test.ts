// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { FULL_BACKUP_SELECTION } from '@/shared/composables/useImportExportService';
import { useSettingsStore } from '@/stores/settingsStore';
import { buildBackupPayload } from '@/utils/core/buildBackupPayload';

describe('云同步 Payload 凭据隔离与安全断言', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('云端推送使用的 payload 永远不包含 syncSettings 及其敏感凭据字段', () => {
    const settingsStore = useSettingsStore();

    // 模拟用户配置了所有可能的敏感凭据
    const SENSITIVE_TOKENS = {
      githubToken: 'ghp_TEST_SECRET_GITHUB_TOKEN_123456789',
      giteeToken: 'gitee_TEST_SECRET_GITEE_TOKEN_987654321',
      webdavPassword: 'SuperSecretWebDavPassword!@#$',
      serverToken: 'Bearer_SERVER_SECRET_API_TOKEN_XYZ',
    };

    settingsStore.githubToken = SENSITIVE_TOKENS.githubToken;
    settingsStore.giteeToken = SENSITIVE_TOKENS.giteeToken;
    settingsStore.webdavPassword = SENSITIVE_TOKENS.webdavPassword;
    settingsStore.serverToken = SENSITIVE_TOKENS.serverToken;

    // 构建云端同步专属 payload（显式传入 syncSettings: false）
    const syncPayload = buildBackupPayload({
      selection: { ...FULL_BACKUP_SELECTION, syncSettings: false },
    });

    expect(syncPayload).not.toBeNull();
    // 1. 结构断言：syncSettings 必须为 undefined
    expect(syncPayload?.syncSettings).toBeUndefined();

    // 2. 全文防泄露断言：序列化后的 JSON 字符串中严禁出现任何 Token 明文或凭据键名
    const serialized = JSON.stringify(syncPayload);

    for (const [key, secretValue] of Object.entries(SENSITIVE_TOKENS)) {
      expect(serialized).not.toContain(secretValue);
      expect(serialized).not.toContain(`"${key}"`);
    }

    // 3. 确保普通偏好设置（如和弦简写）不受影响且正常保留
    expect(syncPayload?.preferences).toBeDefined();
  });
});
