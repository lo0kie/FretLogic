import { describe, expect, it } from 'vitest';

import { toChordId, toGroupId } from '@/domains/chord/theory/entityFactories';
import { Tuning } from '@/domains/chord/theory/theory';
import { extractSongChordSequence } from '@/domains/score/model/chordSlots';
import { toSongId } from '@/domains/score/model/scoreModel';

import type { Chord } from '@/domains/chord/types';
import type { ChordLineSlots, LineId, Song } from '@/domains/score/types';

describe('乐谱时间序列和弦提取 (extractSongChordSequence)', () => {
  const mockChordC: Chord = {
    id: toChordId('c_c'),
    groupId: toGroupId('g1'),
    nameSegments: null,
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
    createdAt: 100,
    updatedAt: 100,
  };

  const mockChordG: Chord = {
    ...mockChordC,
    id: toChordId('c_g'),
  };

  const mockChordAm: Chord = {
    ...mockChordC,
    id: toChordId('c_am'),
  };

  const mockChordF: Chord = {
    ...mockChordC,
    id: toChordId('c_f'),
  };

  const chordLibrary = new Map<string, Chord>([
    [mockChordC.id, mockChordC],
    [mockChordG.id, mockChordG],
    [mockChordAm.id, mockChordAm],
    [mockChordF.id, mockChordF],
  ]);

  it('按 行序 -> 行首 -> 逐字槽位 -> 行尾 的自然时间次序提取和弦', () => {
    const line1 = 'l1' as LineId;
    const line2 = 'l2' as LineId;

    const chordMap = new Map<LineId, ChordLineSlots>([
      [line1, { char: new Map([[2, mockChordG.id]]), start: [mockChordC.id], end: [mockChordAm.id] }],
      [line2, { char: new Map(), start: [mockChordF.id], end: [] }],
    ]);

    const mockSong: Song = {
      id: toSongId('s_test'),
      title: '测试乐谱',
      singer: '',
      originalKey: '',
      timeSignature: '',
      lyrics: '一二三四\n五六七八',
      lineIds: [line1, line2],
      playKey: 'C',
      capo: 0,
      chordMap,
      version: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    const seq = extractSongChordSequence(mockSong, id => chordLibrary.get(id));

    expect(seq.length).toBe(4);
    // 第一行 行首: C
    expect(seq[0]!.slotKey).toBe('line_l1_start_0');
    expect(seq[0]!.chordId).toBe(mockChordC.id);
    // 第一行 字符: G
    expect(seq[1]!.slotKey).toBe('line_l1_char_2');
    expect(seq[1]!.chordId).toBe(mockChordG.id);
    // 第一行 行尾: Am
    expect(seq[2]!.slotKey).toBe('line_l1_end_0');
    expect(seq[2]!.chordId).toBe(mockChordAm.id);
    // 第二行 行首: F
    expect(seq[3]!.slotKey).toBe('line_l2_start_0');
    expect(seq[3]!.chordId).toBe(mockChordF.id);
  });

  it('跳过不存在的和弦或无效槽位', () => {
    const line1 = 'l1' as LineId;
    const chordMap = new Map<LineId, ChordLineSlots>([
      [line1, { char: new Map([[0, mockChordC.id]]), start: [toChordId('c_non_existent')], end: [] }],
    ]);

    const mockSong: Song = {
      id: toSongId('s_test2'),
      title: '测试乐谱2',
      singer: '',
      originalKey: '',
      timeSignature: '',
      lyrics: '测试',
      lineIds: [line1],
      playKey: 'C',
      capo: 0,
      chordMap,
      version: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    const seq = extractSongChordSequence(mockSong, id => chordLibrary.get(id));
    expect(seq.length).toBe(1);
    expect(seq[0]!.chordId).toBe(mockChordC.id);
  });

  it('chordMap 是反序列化后的普通对象时走等价转换，不抛错也不丢槽位', () => {
    // 内存契约要求 chordMap 为嵌套 Map，但持久化 / 同步链路里它是 JSON 形态（扁平键的普通对象）。
    // 不做这层转换的话 `for...of` 直接抛，且 `.size` 恒为 undefined —— 连下面那句「空表早退」也失效，
    // 表现为试听/导出在拿到未还原的数据时整段崩掉。
    const line1 = 'l1' as LineId;
    const plainSong = {
      id: toSongId('s_plain'),
      title: '反序列化形态',
      singer: '',
      originalKey: '',
      timeSignature: '',
      lyrics: '一二',
      lineIds: [line1],
      playKey: 'C',
      capo: 0,
      // JSON.parse 之后的形态：普通对象 + 扁平槽位键（与 v6→v7 迁移前的落库形态一致）
      chordMap: { line_l1_start_0: mockChordG.id, line_l1_char_0: mockChordC.id },
      version: 1,
      createdAt: 1000,
      updatedAt: 1000,
    } as unknown as Song;

    const seq = extractSongChordSequence(plainSong, id => chordLibrary.get(id));

    // 与 Map 形态同解：行首在前、字符槽位在后
    expect(seq.map(s => s.chordId)).toEqual([mockChordG.id, mockChordC.id]);
    expect(seq.map(s => s.slotKey)).toEqual(['line_l1_start_0', 'line_l1_char_0']);
  });
});
