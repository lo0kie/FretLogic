// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { importPortableSong } from '@/domains/score/transfer/textTransferActions';
import { idb } from '@/platform/services/storage';
import { hydrateIdbKv } from '@/platform/services/storage/idbKv';

import type { PortableSong } from '@/domains/score/transfer/textCodec';

/**
 * 乐谱落地的调名收窄：`importPortableSong` 是**分享链接**与粘贴共用的落地入口，而分享链接解码出的
 * 载荷是不受信的 —— 脏调名一旦落进 `Song.playKey`，会被 `computeSongKey` 送进移调链
 *（`transposeChordName` 只认非空字符串），从展示层一路脏到和弦名。
 */
describe('乐谱落地：调名按 isKeyName 收窄', () => {
  beforeEach(async () => {
    // 重置 kv 镜像（IDB kv 库 + 内存 Map），保证用例间小状态隔离
    await idb.clear('kv');
    await hydrateIdbKv();
    setActivePinia(createPinia());
  });

  /** 落地一份最小载荷（无槽位），返回落地后的当前乐谱。
   *  overrides 刻意放宽成 unknown：本用例要模拟「分享链接解码出的不可信载荷」，
   *  脏调名在类型层就不该是合法输入 —— 写成 Partial<PortableSong> 反而会把它挡在用例之外 */
  const land = (overrides: Partial<Record<keyof PortableSong, unknown>>) => {
    const payload = {
      title: '调名收窄',
      singer: '',
      originalKey: '',
      timeSignature: '',
      playKey: 'C',
      capo: 0,
      lyrics: '第一行\n第二行',
      slots: [],
      ...overrides,
    } as unknown as PortableSong;
    importPortableSong(payload);
    return useScoreEditorStore().activeSong;
  };

  it('脏调名（小写 / 非法拼写）不得落库，回退到默认调与未设置原调', () => {
    // 三种都通得过此前那句 `/^[A-Ga-g][#b]?$/` 自写复核：小写 g、非法拼写 a#（应为 A# 或 Bb）
    const song = land({ playKey: 'g', originalKey: 'a#' });

    expect(song?.playKey).toBe('C');
    expect(song?.originalKey).toBe('');
  });

  it('合法调名原样保留（含等音异名与升降号）', () => {
    const song = land({ playKey: 'F#', originalKey: 'Db' });

    expect(song?.playKey).toBe('F#');
    expect(song?.originalKey).toBe('Db');
  });
});
