// @vitest-environment jsdom
/**
 * 同步动作的**就绪门禁**：两个 store 未水合时，推送不得上传、拉取不得返回载荷。
 *
 * 两个方向都会丢数据，且都发生在「用户点了按钮、看起来一切正常」的时候：
 * 未水合时上传会把内存里的空初值当成真值推上云端；拉取返回的包会被
 * `applyOverwriteWithCloud` 当成唯一真值覆盖本地，而本地那份真实数据根本没进内存。
 *
 * 门禁先等一次 `hydrate`（幂等、可重试），**等完仍不就绪**才放弃 —— 故这里把 hydrate 桩成
 * 一直抛错（模拟 IDB 读失败），覆盖的正是「等过、还是没就绪」那条分支。
 * 断言不止「返回值」，还钉住「provider 一次都没被调用」与「载荷压根没构建」：
 * 只钉返回值的话，把上传改成「先传再报失败」也能过。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { pullFromRemote, syncToRemote } from '@/app/services/sync/syncActions';

import type { ImportExportPayload } from '@/app/types';

const localPayload = { version: 7, groups: [], chords: [], songs: [] } as unknown as ImportExportPayload;

const { uiStoreMock, providerMock, buildMock, hydration, storeStub } = vi.hoisted(() => {
  /** 门禁读的「是否已水合」与 hydrate 行为：fail=true 时 hydrate 抛错，模拟 IDB 读失败 */
  const hydration = { chord: false, song: false, fail: false };
  const storeStub = (key: 'chord' | 'song') => () => ({
    isHydrated: () => hydration[key],
    hydrate: async () => {
      if (hydration.fail) throw new Error('IDB 读失败');
      hydration[key] = true;
    },
  });
  return {
    hydration,
    storeStub,
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
  };
});

// 本模块在加载时就取一次 store 引用（懒加载模块的既定写法），故必须在 import 前替换掉
vi.mock('@/domains/chord/store/chordStore', () => ({ useChordStore: storeStub('chord') }));
vi.mock('@/domains/score/library/store/songStore', () => ({ useSongStore: storeStub('song') }));
vi.mock('@/domains/chord/store/chordEditorStore', () => ({ useChordEditorStore: () => ({ resetEditor: vi.fn() }) }));
vi.mock('@/platform/store/settingsStore', () => ({ useSettingsStore: () => ({ syncTarget: 'gitee' }) }));
vi.mock('@/platform/store/uiStore', () => ({ useUiStore: () => uiStoreMock }));
vi.mock('@/platform/services/storage/deletionWatermark', () => ({ markDataDeleted: vi.fn() }));
vi.mock('@/app/services/backup/buildBackupPayload', () => ({ buildBackupPayloadResult: buildMock }));
vi.mock('@/app/services/sync/useSyncService', () => ({ resolvePushCredentialIssue: () => null }));
vi.mock('@/app/services/sync/registry', () => ({
  syncProviderRegistry: {
    gitee: {
      resolveConfig: () => ({ config: { kind: 'gitee' } }),
      create: () => providerMock,
      resolveTestConfig: () => ({ config: { kind: 'gitee' } }),
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  hydration.chord = false;
  hydration.song = false;
  hydration.fail = false;
  buildMock.mockResolvedValue({ payload: localPayload, issues: [], warnings: [] });
  // 与本地不同号，确保「就绪时不拦截」的正对照能走到上传那一步
  providerMock.fetchMeta.mockResolvedValue({ md5: 'deadbeef', updatedAt: 0 });
  providerMock.pull.mockResolvedValue({ ...localPayload } as ImportExportPayload);
  providerMock.push.mockResolvedValue({ sha: 'sha' });
  providerMock.pushMeta.mockResolvedValue(undefined);
});

describe('同步就绪门禁：等过一次水合后仍不就绪', () => {
  it('推送放弃：不构建载荷、不发起上传，并明确告知用户稍后重试', async () => {
    hydration.fail = true;

    expect(await syncToRemote('gitee')).toBe(false);

    expect(buildMock).not.toHaveBeenCalled();
    expect(providerMock.push).not.toHaveBeenCalled();
    expect(uiStoreMock.message.warning).toHaveBeenCalledWith('本地数据尚未加载完成，请稍后重试');
  });

  it('拉取放弃：不向云端取数据（调用方据此不会进入覆盖写回）', async () => {
    hydration.fail = true;

    expect(await pullFromRemote('gitee')).toBeNull();

    expect(providerMock.pull).not.toHaveBeenCalled();
    expect(uiStoreMock.message.warning).toHaveBeenCalledWith('本地数据尚未加载完成，请稍后重试');
  });

  it('正对照：门禁先等一次水合，等到了就照常走完上传', async () => {
    expect(await syncToRemote('gitee')).toBe(true);

    expect(providerMock.push).toHaveBeenCalledTimes(1);
    expect(uiStoreMock.message.warning).not.toHaveBeenCalled();
  });
});
