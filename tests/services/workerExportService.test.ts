import { describe, expect, it } from 'vitest';

import { charKey } from '@/domains/score/model/scoreModel';
import { prepareWorkerExportPayload } from '@/domains/score/preview/services/workerExportService';

import type { Chord } from '@/domains/chord/types';
import type { LineId, Song, SongId } from '@/domains/score/types';

describe('workerExportService', () => {
  it('正确将 Song 数据转换为 Worker 渲染所需的轻量 Payload（含指板图数据）', () => {
    const mockChord: Chord = {
      id: 'chord_c',
      nameSegments: { root: ['C', 0] },
      strings: [
        [-1, false],
        [3, false],
        [2, false],
        [0, false],
        [1, false],
        [0, false],
      ],
      rootStringIndex: 1,
      fretCount: 4,
      fretOffset: 0,
      groupId: 'g1',
      tuning: 'standard',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const chordsLookupMap = new Map<string, Chord>([['chord_c', mockChord]]);

    const chordMap = new Map<string, string>();
    chordMap.set(charKey('line_0', 0), 'chord_c');

    const song: Song = {
      id: 'song_1' as SongId,
      title: '晴天',
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

    expect(payload.title).toBe('晴天');
    expect(payload.mode).toBe('a4');
    expect(payload.lines.length).toBe(2);
    expect(payload.lines[0]?.chars[0]?.char).toBe('故');
    expect(payload.lines[0]?.chars[0]?.chord?.chordName).toBe('C');
    expect(payload.lines[0]?.chars[0]?.chord?.strings[1]?.[0]).toBe(3);
  });

  it('开启 shorthand 时能正确将和弦转为简写符号（如 maj7 -> M7）', () => {
    const mockMaj7Chord: Chord = {
      id: 'chord_cmaj7',
      nameSegments: { root: ['C', 0], quality: 'maj7' },
      strings: [
        [-1, false],
        [3, false],
        [2, false],
        [0, false],
        [0, false],
        [0, false],
      ],
      rootStringIndex: 1,
      fretCount: 4,
      fretOffset: 0,
      groupId: 'g1',
      tuning: 'standard',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const chordsLookupMap = new Map<string, Chord>([['chord_cmaj7', mockMaj7Chord]]);
    const chordMap = new Map<string, string>();
    chordMap.set(charKey('line_0', 0), 'chord_cmaj7');

    const song: Song = {
      id: 'song_1' as SongId,
      title: '晴天',
      lyrics: '故事的小黄花',
      lineIds: ['line_0' as LineId],
      playKey: 'G',
      capo: 0,
      chordMap,
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const base = { song, selectedIndices: [0], chordsLookupMap, mode: 'a4' } as const;

    const fullPayload = prepareWorkerExportPayload({ ...base, shorthand: false });
    expect(fullPayload.lines[0]?.chars[0]?.chord?.chordName).toBe('Cmaj7');

    const shortPayload = prepareWorkerExportPayload({ ...base, shorthand: true });
    expect(shortPayload.lines[0]?.chars[0]?.chord?.chordName).toBe('CM7');

    const defaultAlignPayload = prepareWorkerExportPayload({ ...base });
    expect(defaultAlignPayload.layoutAlign).toBe('start');

    const centerAlignPayload = prepareWorkerExportPayload({ ...base, layoutAlign: 'center' });
    expect(centerAlignPayload.layoutAlign).toBe('center');
  });
});
