// @vitest-environment jsdom
/**
 * 「可撤销的删除」按**精确快照**还原（`scoreEditorStore` 的 restoreDeletedSlot / restoreDeletedLine）。
 *
 * 背景：排列区的删除通知（清槽位和弦 / 删行）是**常驻**的 —— 撤销入口随 toast 飘走就没了，用户必须
 * 能回看并补做。此前它的动作是「弹撤销历史栈顶」，于是「先做别的编辑、隔一会儿再点撤销」会撤掉那次
 * 编辑、而这次删除照旧（用户报的正是这个）。修法与「删指法 / 删分组 / 删乐谱」三处对齐：各记精确
 * 快照、按原位写回，删除与撤销之间夹着的其它改动一概不受影响。
 *
 * 本文件锁三条契约：
 * 1. 槽位还原按**原位写回**，夹着的其它编辑不受影响；
 * 2. 边和弦槽位是**插回**而不是覆盖 —— 清除会把列表摘短，覆盖会把原本排在后一位的和弦顶掉
 *    （这是 `restoreChordAtSlot` 存在的全部理由，`bindNewChordToSlot` 在这一档是错的）；
 * 3. 删行还原必须把歌词文本 / 行序 / 该行槽位表**一起**写回：只补文本的话这一行会拿到新 lineId，
 *    原来绑在它上面的和弦就回不来了。
 */
import { nextTick } from 'vue';

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { toChordId, toGroupId } from '@/domains/chord/theory/entityFactories';
import { nameToSegments, Tuning } from '@/domains/chord/theory/theory';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useSongStore } from '@/domains/score/library/store/songStore';
import { cloneChordMap } from '@/domains/score/model/chordSlots';
import { lineCharChord } from '@/domains/score/model/scoreModel';
import { idb } from '@/platform/services/storage';
import { hydrateIdbKv } from '@/platform/services/storage/idbKv';

import type { Chord, ChordId } from '@/domains/chord/types';
import type { ChordLineSlots, LineId, SlotKey } from '@/domains/score/types';

/** 最小可用和弦实体：这些用例只关心「槽位上绑的是哪个 id」，指法内容不参与断言 */
const chordOf = (id: string): Chord => ({
  id: toChordId(id),
  groupId: toGroupId('g_test'),
  nameSegments: nameToSegments('C'),
  strings: [
    { fret: -1, preferFlat: false },
    { fret: 3, preferFlat: false },
    { fret: 2, preferFlat: false },
    { fret: 0, preferFlat: false },
    { fret: 1, preferFlat: false },
    { fret: 0, preferFlat: false },
  ],
  fretCount: 4,
  fretOffset: 0,
  tuning: Tuning.STANDARD,
  rootStringIndex: 1,
  createdAt: 1,
  updatedAt: 1,
});

const slotsOf = (init: Partial<ChordLineSlots>): ChordLineSlots => ({
  char: init.char ?? new Map(),
  start: init.start ?? [],
  end: init.end ?? [],
});

const buildSong = (lyrics: string, lineIds: LineId[], chordMap: Map<LineId, ChordLineSlots>) => {
  const songStore = useSongStore();
  const scoreEditor = useScoreEditorStore();
  const song = songStore.createSong('可撤销删除测试');
  song.lyrics = lyrics;
  song.lineIds = lineIds;
  song.chordMap = chordMap;
  scoreEditor.setActiveSong(song.id);
  return scoreEditor;
};

beforeEach(async () => {
  // 重置 kv 镜像（IDB kv 库 + 内存 Map），保证用例间小状态隔离
  await idb.clear('kv');
  await hydrateIdbKv();
  setActivePinia(createPinia());
});

describe('可撤销的删除 · 按精确快照还原', () => {
  it('清槽位和弦后夹着别的编辑，还原仍只写回那一个槽位', async () => {
    const lineId = 'l1' as LineId;
    const chordA = toChordId('c_a');
    const scoreEditor = buildSong('歌词', [lineId], new Map([[lineId, slotsOf({ char: new Map([[0, chordA]]) })]]));
    await nextTick();

    const slotKey = 'line_l1_char_0' as SlotKey;
    const snapshot = { slotKey, chordId: chordA };
    scoreEditor.removeSlotChord(slotKey);
    expect(lineCharChord(scoreEditor.activeSong!.chordMap, 'l1', 0)).toBeNull();

    // 夹着一次别的编辑：用户清完之后又往同一个行的另一个字符上绑了和弦
    scoreEditor.setSlotChord('line_l1_char_1' as SlotKey, chordOf('c_b'));

    scoreEditor.restoreDeletedSlot(snapshot);

    // 被清的那个槽位回来了，夹着的那次编辑**也还在**（弹撤销栈顶的实现会把它一起撤掉）
    expect(lineCharChord(scoreEditor.activeSong!.chordMap, 'l1', 0)).toBe(chordA);
    expect(lineCharChord(scoreEditor.activeSong!.chordMap, 'l1', 1)).toBe(toChordId('c_b'));
  });

  it('清行首边和弦后按原位插回，不把原本排在后一位的和弦顶掉', async () => {
    const lineId = 'l1' as LineId;
    // 断言成元组：`noUncheckedIndexedAccess` 下从数组解构出来的是 `ChordId | undefined`，
    // 而这三个值就地写死、必然存在，逐个 `!` 只会把「确实有三个」这件事散成三处
    const [a, b, c] = ['c_a', 'c_b', 'c_c'].map(toChordId) as [ChordId, ChordId, ChordId];
    const scoreEditor = buildSong('歌词', [lineId], new Map([[lineId, slotsOf({ start: [a, b, c] })]]));
    await nextTick();

    const slotKey = 'line_l1_start_1' as SlotKey;
    scoreEditor.removeSlotChord(slotKey);
    expect(scoreEditor.activeSong!.chordMap.get(lineId)!.start).toEqual([a, c]);

    scoreEditor.restoreDeletedSlot({ slotKey, chordId: b });

    // 覆盖式还原会得到 [a, b]（c 被顶掉）—— 故这里必须断言完整列表
    expect(scoreEditor.activeSong!.chordMap.get(lineId)!.start).toEqual([a, b, c]);
  });

  it('删行后夹着别的编辑，还原仍把该行与它绑的和弦一起按原下标写回', async () => {
    // 同上：元组断言而非 `as LineId[]`，否则解构出来是 `LineId | undefined`
    const [l1, l2, l3] = ['l1', 'l2', 'l3'] as [LineId, LineId, LineId];
    const chordA = toChordId('c_a');
    const scoreEditor = buildSong(
      '行一\n行二\n行三',
      [l1, l2, l3],
      new Map([[l2, slotsOf({ char: new Map([[0, chordA]]) })]])
    );
    await nextTick();

    // 与排列区删行同款：先按精确快照记下这一行（槽位表取深克隆，删除会原地改写这些容器）
    const snapshot = {
      lineIdx: 1,
      lineId: l2,
      lineText: '行二',
      slots: cloneChordMap(scoreEditor.activeSong!.chordMap).get(l2),
    };
    scoreEditor.updateLyrics('行一\n行三');
    expect(scoreEditor.activeSong?.lyrics).toBe('行一\n行三');
    // 该行的槽位随行被回收：只按文本还原的话，这一步丢掉的和弦再也回不来
    expect(lineCharChord(scoreEditor.activeSong!.chordMap, 'l2', 0)).toBeNull();

    // 夹着一次别的编辑
    scoreEditor.setSlotChord('line_l1_char_0' as SlotKey, chordOf('c_b'));

    scoreEditor.restoreDeletedLine(snapshot);

    expect(scoreEditor.activeSong?.lyrics).toBe('行一\n行二\n行三');
    expect(scoreEditor.activeSong?.lineIds).toEqual([l1, l2, l3]);
    expect(lineCharChord(scoreEditor.activeSong!.chordMap, 'l2', 0)).toBe(chordA);
    // 夹着的那次编辑仍在
    expect(lineCharChord(scoreEditor.activeSong!.chordMap, 'l1', 0)).toBe(toChordId('c_b'));
  });
});
