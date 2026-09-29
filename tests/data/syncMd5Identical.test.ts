// @vitest-environment jsdom
/**
 * 拉取 / 同步时的 MD5 判等（取代原先的启动期自动比对）。
 *
 * 两侧一字不差时不该白跑一趟：上传虽幂等却毫无意义，拉取还要多开一次导入面板让用户勾一遍。
 * 故判等命中就弹一条提示、按「已是最新」收场。
 *
 * 判等靠「同一条构建路径」（见 isSameAsLocal 的说明），所以这里用**真的** computePayloadMd5
 * 算两侧校验和、只把 provider 与载荷构建换成桩 —— 实现若改去比别的字段，本文件会红。
 * 两条正对照（不同号）同样必要：只钉「相同则不动作」的话，把判等写成恒真也能过。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { computePayloadMd5 } from '@/app/services/sync/payloadChecksum';
import { pullFromRemote, syncToRemote } from '@/app/services/sync/syncActions';

import type { ImportExportPayload } from '@/app/types';

const localPayload = { version: 7, groups: [], chords: [], songs: [] } as unknown as ImportExportPayload;

const { uiStoreMock, providerMock, buildMock } = vi.hoisted(() => ({
  uiStoreMock: {
    message: { loading: vi.fn(() => 1), success: vi.fn(), info: vi.fn(), error: vi.fn(), warning: vi.fn() },
    removeMessage: vi.fn(),
    notice: { warning: vi.fn() },
  },
  providerMock: {
    pull: vi.fn(),
    push: vi.fn(),
    exists: vi.fn(),
    testConnection: vi.fn(),
    fetchMeta: vi.fn(),
    pushMeta: vi.fn(),
  },
  buildMock: vi.fn(),
}));

// 本模块在加载时就取一次 store 引用（懒加载模块的既定写法），故必须在 import 前替换掉
vi.mock('@/domains/chord/store/chordStore', () => ({
  useChordStore: () => ({ isHydrated: () => true, hydrate: vi.fn() }),
}));
vi.mock('@/domains/score/library/store/songStore', () => ({
  useSongStore: () => ({ isHydrated: () => true, hydrate: vi.fn() }),
}));
vi.mock('@/domains/chord/store/chordEditorStore', () => ({ useChordEditorStore: () => ({ resetEditor: vi.fn() }) }));
vi.mock('@/platform/store/settingsStore', () => ({ useSettingsStore: () => ({ syncTarget: 'gitee' }) }));
vi.mock('@/platform/store/uiStore', () => ({ useUiStore: () => uiStoreMock }));
vi.mock('@/platform/services/storage/deletionWatermark', () => ({ markDataDeleted: vi.fn() }));
vi.mock('@/app/services/backup/buildBackupPayload', () => ({ buildBackupPayloadResult: buildMock }));
vi.mock('@/app/services/sync/useSyncService', () => ({ resolvePushCredentialIssue: () => null }));
// provider 工厂换成桩：本文件测的是「判等结果如何影响动作」，不是某家 provider 的协议细节
vi.mock('@/app/services/sync/registry', () => ({
  syncProviderRegistry: {
    gitee: {
      resolveConfig: () => ({ config: { kind: 'gitee' } }),
      create: () => providerMock,
      resolveTestConfig: () => ({ config: { kind: 'gitee' } }),
    },
  },
}));

/** 云端 meta 与本次待推的包同号，且 updatedAt 不高于本地（不触发冲突分支） */
const identicalMeta = { md5: computePayloadMd5(localPayload), updatedAt: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  buildMock.mockResolvedValue({ payload: localPayload, issues: [], warnings: [] });
  providerMock.fetchMeta.mockResolvedValue(null);
  providerMock.pull.mockResolvedValue({ ...localPayload } as ImportExportPayload);
  providerMock.push.mockResolvedValue({ sha: 'sha' });
  providerMock.pushMeta.mockResolvedValue(undefined);
});

describe('同步（推送）：云端 meta 与本包同号', () => {
  it('不发起上传，改弹「无需上传」，也不再报「成功上传」', async () => {
    providerMock.fetchMeta.mockResolvedValue(identicalMeta);

    expect(await syncToRemote('gitee')).toBe(true);

    expect(providerMock.push).not.toHaveBeenCalled();
    expect(uiStoreMock.message.info).toHaveBeenCalledWith('云端数据与本地一致，无需上传');
    expect(uiStoreMock.message.success).not.toHaveBeenCalledWith('成功上传至云端');
  });

  it('正对照：不同号时照常上传并报成功', async () => {
    providerMock.fetchMeta.mockResolvedValue({ md5: 'deadbeef', updatedAt: 0 });

    expect(await syncToRemote('gitee')).toBe(true);

    expect(providerMock.push).toHaveBeenCalledTimes(1);
    expect(uiStoreMock.message.success).toHaveBeenCalledWith('成功上传至云端');
    expect(uiStoreMock.message.info).not.toHaveBeenCalled();
  });
});

describe('拉取：云端包与本地同号', () => {
  it('不返回载荷（调用方据此不开导入面板），改弹「无需拉取」', async () => {
    expect(await pullFromRemote('gitee')).toBeNull();

    expect(uiStoreMock.message.info).toHaveBeenCalledWith('云端数据与本地一致，无需拉取');
  });

  it('正对照：不同号时原样返回该包', async () => {
    const cloud = { ...localPayload, chords: [{ id: 'c1' }] } as unknown as ImportExportPayload;
    providerMock.pull.mockResolvedValue(cloud);

    expect(await pullFromRemote('gitee')).toBe(cloud);
    expect(uiStoreMock.message.info).not.toHaveBeenCalled();
  });
});
