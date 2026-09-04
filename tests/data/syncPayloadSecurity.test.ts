// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { buildBackupPayload } from '@/app/services/backup/buildBackupPayload';
import { FULL_BACKUP_SELECTION } from '@/app/services/backup/useImportExportService';
import { useSettingsStore } from '@/platform/store/settingsStore';

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

  it('存在单条脏和弦数据时不拖垮整体备份与同步（宽容式清洗）', async () => {
    const { useChordStore } = await import('@/domains/chord/store/chordStore');
    const { buildBackupPayloadResult } = await import('@/app/services/backup/buildBackupPayload');
    const { GroupSortRule } = await import('@/domains/chord/types');
    const { Tuning } = await import('@/domains/chord/theory/theory');
    type ChordItem = import('@/domains/chord/types').Chord;
    const chordStore = useChordStore();

    chordStore.groups = [{ id: 'g1', name: 'C', sortRule: GroupSortRule.ROOT_PITCH }];
    // 一条正常和弦，一条琴弦数据损坏的和弦
    chordStore.savedChordsList = [
      {
        id: 'valid_c',
        chordName: 'C',
        strings: [
          [-1, false],
          [3, false],
          [2, false],
          [0, false],
          [1, false],
          [0, false],
        ],
        fretCount: 3,
        fretOffset: 0,
        groupId: 'g1',
        tuning: Tuning.STANDARD,
        rootStringIndex: null,
      },
      {
        id: 'corrupt_c',
        chordName: 'Dm',
        strings: 'corrupted-not-array',
        fretCount: 3,
        fretOffset: 0,
        groupId: 'g1',
        tuning: Tuning.STANDARD,
      } as unknown as ChordItem,
    ];

    const result = buildBackupPayloadResult();
    expect(result.payload).not.toBeNull();
    expect(result.payload?.chords).toHaveLength(1);
    expect(result.payload?.chords[0]?.id).toBe('valid_c');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.issues).toHaveLength(0);
  });
});
