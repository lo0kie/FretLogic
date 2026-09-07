import { describe, expect, it } from 'vitest';

import { toChordId, toGroupId } from '@/domains/chord/theory/entityFactories';
import { Tuning } from '@/domains/chord/theory/theory';
import { extractSongChordSequence } from '@/domains/score/model/chordSlots';
import { toSongId } from '@/domains/score/model/scoreModel';

import type { Chord, ChordId } from '@/domains/chord/types';
import type { LineId, SlotKey, Song } from '@/domains/score/types';

describe('乐谱时间序列和弦提取 (extractSongChordSequence)', () => {
  const mockChordC: Chord = {
    id: toChordId('c_c'),
    groupId: toGroupId('g1'),
    nameSegments: null,
    strings: [
      [-1, false],
      [3, false],
      [2, false],
      [0, false],
      [1, false],
      [0, false],
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

    const chordMap = new Map<SlotKey, ChordId>([
      ['line_l1_end_0' as SlotKey, mockChordAm.id],
      ['line_l1_char_2' as SlotKey, mockChordG.id],
      ['line_l1_start_0' as SlotKey, mockChordC.id],
      ['line_l2_start_0' as SlotKey, mockChordF.id],
    ]);

    const mockSong: Song = {
      id: toSongId('s_test'),
      title: '测试乐谱',
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
    const chordMap = new Map<SlotKey, ChordId>([
      ['line_l1_start_0' as SlotKey, toChordId('c_non_existent')],
      ['line_l1_char_0' as SlotKey, mockChordC.id],
    ]);

    const mockSong: Song = {
      id: toSongId('s_test2'),
      title: '测试乐谱2',
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
});
