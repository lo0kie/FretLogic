import { describe, expect, it } from 'vitest';

import { createChord } from '@/domains/chord/theory/entityFactories';
import { nameToSegments, Tuning } from '@/domains/chord/theory/theory';
import { parseChordFromText, serializeChordToText } from '@/domains/chord/transfer/chordTextCodec';
import type { Chord } from '@/domains/chord/types';
import type { BarreEntity } from '@/domains/fretboard/types';
import { TEXT_FORMAT } from '@/platform/utils/constants';

/** 构造测试和弦：默认标准调弦 6 弦、3 品、根音 5 弦 */
const makeChord = (name: string, strings: Array<[number, boolean]>, barres?: BarreEntity[]): Chord =>
  createChord({
    nameSegments: nameToSegments(name),
    strings: strings as Chord['strings'],
    fretCount: 3,
    groupId: 'g_test',
    tuning: Tuning.STANDARD,
    rootStringIndex: 5,
    ...(barres ? { barres } : {}),
  });

describe('chordTextCodec 和弦文字编解码（chord 域单一来源）', () => {
  it('序列化 → 解析往返保真（含升降号偏好与横按）', () => {
    const chord = makeChord(
      'F#m7b5',
      [
        [-1, false],
        [1, true],
        [3, false],
        [2, false],
        [2, false],
        [0, false],
      ],
      [{ fret: 2, fromString: 2, toString: 4, finger: 2 }]
    );
    const text = serializeChordToText(chord);
    const result = parseChordFromText(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.name).toBe('F#m7b5');
    expect(result.data.tuning).toBe(Tuning.STANDARD);
    expect(result.data.fretOffset).toBe(0);
    expect(result.data.rootStringIndex).toBe(5);
    expect(result.data.strings).toEqual([
      [-1, false],
      [1, true],
      [3, false],
      [2, false],
      [2, false],
      [0, false],
    ]);
    expect(result.data.barres).toEqual([{ fret: 2, fromString: 2, toString: 4, finger: 2 }]);
  });

  it('乐谱文本误贴到和弦解析时返回 WRONG_TYPE', () => {
    const songText = `${TEXT_FORMAT.SONG} ${TEXT_FORMAT.VERSION}\nTITLE:x\nLYRICS:\n`;
    expect(parseChordFromText(songText)).toEqual({ ok: false, reason: 'WRONG_TYPE' });
  });

  it('非本应用格式返回 UNKNOWN_FORMAT；只有魔数头时返回 INVALID_NAME', () => {
    expect(parseChordFromText('随便什么歌词文本')).toEqual({ ok: false, reason: 'UNKNOWN_FORMAT' });
    const headerOnly = `${TEXT_FORMAT.CHORD} ${TEXT_FORMAT.VERSION}`;
    expect(parseChordFromText(headerOnly)).toEqual({ ok: false, reason: 'INVALID_NAME' });
  });
});
