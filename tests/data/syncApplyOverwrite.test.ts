// @vitest-environment jsdom
/**
 * 云端覆盖本地的「缺分区」语义（applyOverwriteWithCloud）。
 *
 * 背景：这是不可逆丢失链的消费侧一半。校验层会把包里缺失的分区兜底成 [] 并留下 absentSections
 * 标记，本函数必须按标记区分「包里压根没有这个分区」（旧版本云端包没有 songs 字段）与
 * 「这个分区确实是空的」—— 前者保持本地原样，后者才按完全覆盖语义清空。
 * 判反的表现是：拉一次旧版云端包，本地乐谱全没了。
 *
 * 用假 store 驱动：applyOverwriteWithCloud 是纯动作（不碰 provider / 网络），断言点全在
 * 「哪些 store 被调用、被喂了什么」。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyOverwriteWithCloud } from '@/app/services/sync/syncActions';

import type { ImportExportPayload } from '@/app/types';

const { chordStoreMock, songStoreMock, uiStoreMock, settingsStoreMock, editorStoreMock, markDataDeletedMock } =
  vi.hoisted(() => ({
    chordStoreMock: { replaceAllData: vi.fn() },
    songStoreMock: { overwriteSongs: vi.fn() },
    uiStoreMock: { message: { success: vi.fn(), error: vi.fn() } },
    settingsStoreMock: { applyPreferencesBackup: vi.fn() },
    editorStoreMock: { resetEditor: vi.fn() },
    markDataDeletedMock: vi.fn(),
  }));

// 本模块在加载时就取一次 store 引用（懒加载模块的既定写法），故必须在 import 前替换掉
vi.mock('@/domains/chord/store/chordStore', () => ({ useChordStore: () => chordStoreMock }));
vi.mock('@/domains/score/library/store/songStore', () => ({ useSongStore: () => songStoreMock }));
vi.mock('@/domains/chord/store/chordEditorStore', () => ({ useChordEditorStore: () => editorStoreMock }));
vi.mock('@/platform/store/settingsStore', () => ({ useSettingsStore: () => settingsStoreMock }));
vi.mock('@/platform/store/uiStore', () => ({ useUiStore: () => uiStoreMock }));
vi.mock('@/platform/services/storage/deletionWatermark', () => ({ markDataDeleted: markDataDeletedMock }));

const payload = (extra: Partial<ImportExportPayload> = {}): ImportExportPayload =>
  ({ version: 7, groups: [], chords: [], songs: [], ...extra }) as ImportExportPayload;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('applyOverwriteWithCloud：缺分区不得被当成「云端为空」', () => {
  it('absentSections 含 songs 时保持本地乐谱原样，不调用 overwriteSongs', () => {
    applyOverwriteWithCloud(payload({ absentSections: ['songs'] }));

    // 核心断言：包里没有 songs 分区 ⇒ 一律不动本地乐谱（旧版本云端包正是这个形态）
    expect(songStoreMock.overwriteSongs).not.toHaveBeenCalled();
    // 另一半照常生效：chords 分区在包里，按覆盖语义整表替换
    expect(chordStoreMock.replaceAllData).toHaveBeenCalledTimes(1);
  });

  it('songs 显式为空数组时按覆盖语义清空本地乐谱', () => {
    applyOverwriteWithCloud(payload());

    // 与上一条互为正反面：显式空数组是「云端确实没有乐谱」，必须真的覆盖成空
    expect(songStoreMock.overwriteSongs).toHaveBeenCalledWith([]);
  });

  it('deletedAt 透传给删除水位线，保证 meta.updatedAt 单调不后退', () => {
    applyOverwriteWithCloud(payload({ deletedAt: 1_700_000_000_000 }));

    // 水位线只前进不后退：拉取后本地再上传时不得低于拉取源，否则「云端删过最新实体」的时间信息丢失
    expect(markDataDeletedMock).toHaveBeenCalledWith(1_700_000_000_000);
  });
});
