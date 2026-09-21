import { describe, expect, it } from 'vitest';

import { createChord } from '@/domains/chord/theory/entityFactories';
import { Tuning } from '@/domains/chord/theory/theory';
import { prepareWorkerExportPayload } from '@/domains/score/preview/services/workerExportService';

import type { Chord } from '@/domains/chord/types';
import type { WorkerExportPayloadInput } from '@/domains/score/preview/services/workerExportService';
import type { ChordLineSlots, LineId, Song, SongId } from '@/domains/score/types';

describe('workerExportService', () => {
  it('正确将 Song 数据转换为 Worker 渲染所需的轻量 Payload（含指板图数据）', () => {
    const mockChord: Chord = createChord({
      id: 'chord_c',
      nameSegments: { root: ['C', 0] },
      strings: [
        { fret: -1, preferFlat: false },
        { fret: 3, preferFlat: false },
        { fret: 2, preferFlat: false },
        { fret: 0, preferFlat: false },
        { fret: 1, preferFlat: false },
        { fret: 0, preferFlat: false },
      ],
      rootStringIndex: 1,
      fretCount: 4,
      fretOffset: 0,
      groupId: 'g1',
      tuning: Tuning.STANDARD,
    });

    const chordsLookupMap = new Map<string, Chord>([[mockChord.id, mockChord]]);

    const chordMap = new Map<LineId, ChordLineSlots>();
    chordMap.set('line_0' as LineId, { char: new Map([[0, mockChord.id]]), start: [], end: [] });

    const song: Song = {
      id: 'song_1' as SongId,
      title: '晴天',
      singer: '',
      originalKey: '',
      timeSignature: '',
      lyrics: '故事的小黄花\n从出生那年就飘着',
      lineIds: ['line_0' as LineId, 'line_1' as LineId],
      playKey: 'G',
      capo: 2,
      chordMap,
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const payload = prepareWorkerExportPayload({ song, selectedIndices: [0, 1], chordsLookupMap, mode: 'a4' });

    // 注：原先此处还有 title / mode / lines.length 三条「透传回声」断言——输出即输入的字段，
    // 删掉实现里的赋值也照样为绿；实质覆盖在下方 chars / chord 的结构断言
    expect(payload.lines[0]?.chars[0]?.char).toBe('故');
    expect(payload.lines[0]?.chars[0]?.chord?.chordName).toBe('C');
    expect(payload.lines[0]?.chars[0]?.chord?.strings[1]?.[0]).toBe(3);
  });

  it('开启 shorthand 时能正确将和弦转为简写符号（如 maj7 -> M7）', () => {
    const mockMaj7Chord: Chord = createChord({
      id: 'chord_cmaj7',
      nameSegments: { root: ['C', 0], quality: 'maj7' },
      strings: [
        { fret: -1, preferFlat: false },
        { fret: 3, preferFlat: false },
        { fret: 2, preferFlat: false },
        { fret: 0, preferFlat: false },
        { fret: 0, preferFlat: false },
        { fret: 0, preferFlat: false },
      ],
      rootStringIndex: 1,
      fretCount: 4,
      fretOffset: 0,
      groupId: 'g1',
      tuning: Tuning.STANDARD,
    });

    const chordsLookupMap = new Map<string, Chord>([[mockMaj7Chord.id, mockMaj7Chord]]);
    const chordMap = new Map<LineId, ChordLineSlots>();
    chordMap.set('line_0' as LineId, { char: new Map([[0, mockMaj7Chord.id]]), start: [], end: [] });

    const song: Song = {
      id: 'song_1' as SongId,
      title: '晴天',
      singer: '',
      originalKey: '',
      timeSignature: '',
      lyrics: '故事的小黄花',
      lineIds: ['line_0' as LineId],
      playKey: 'G',
      capo: 0,
      chordMap,
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const base: WorkerExportPayloadInput = { song, selectedIndices: [0], chordsLookupMap, mode: 'a4' };

    const fullPayload = prepareWorkerExportPayload({ ...base, shorthand: false });
    expect(fullPayload.lines[0]?.chars[0]?.chord?.chordName).toBe('Cmaj7');

    const shortPayload = prepareWorkerExportPayload({ ...base, shorthand: true });
    expect(shortPayload.lines[0]?.chars[0]?.chord?.chordName).toBe('CM7');

    // 只保留缺省值断言（未传 layoutAlign 时回落到 'start' 是真实分支，有区分度）；
    // 原先紧随其后的 layoutAlign:'center' → 'center' 属透传回声，已删
    const defaultAlignPayload = prepareWorkerExportPayload({ ...base });
    expect(defaultAlignPayload.layoutAlign).toBe('start');
  });
});
