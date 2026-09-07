import { describe, expect, it } from 'vitest';

import { createChord } from '@/domains/chord/theory/entityFactories';
import { nameToSegments, Tuning } from '@/domains/chord/theory/theory';
import {
  parseChordFromText,
  parseGroupFromText,
  serializeChordToText,
  serializeGroupToText,
} from '@/domains/chord/transfer/chordTextCodec';
import { GroupSortRule } from '@/domains/chord/types';
import { TEXT_FORMAT } from '@/platform/utils/constants';

import type { Chord } from '@/domains/chord/types';
import type { BarreEntity } from '@/domains/fretboard/types';

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

describe('chordTextCodec 分组文字编解码', () => {
  it('分组序列化 → 解析往返保真（名称/排序规则/组内和弦保序）', () => {
    const chords = [
      makeChord('Am7', [
        [-1, false],
        [0, false],
        [0, false],
        [0, false],
        [0, false],
        [0, false],
      ]),
      makeChord('C', [
        [-1, false],
        [3, false],
        [2, false],
        [0, false],
        [1, false],
        [0, false],
      ]),
    ];
    const text = serializeGroupToText({ name: '测试分组', sortRule: GroupSortRule.KEY_DEGREE, sortKey: 'G' }, chords);
    const result = parseGroupFromText(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.name).toBe('测试分组');
    expect(result.data.sortRule).toBe(GroupSortRule.KEY_DEGREE);
    expect(result.data.sortKey).toBe('G');
    expect(result.data.chords.map(c => c.name)).toEqual(['Am7', 'C']);
  });

  it('和弦文本误贴到分组解析时返回 WRONG_TYPE；非本应用格式返回 UNKNOWN_FORMAT', () => {
    const chordText = `${TEXT_FORMAT.CHORD} ${TEXT_FORMAT.VERSION}\nNAME:C\n`;
    expect(parseGroupFromText(chordText)).toEqual({ ok: false, reason: 'WRONG_TYPE' });
    expect(parseGroupFromText('随便什么歌词文本')).toEqual({ ok: false, reason: 'UNKNOWN_FORMAT' });
  });

  it('KEY_DEGREE 缺 sortKey 或缺 CHORDS 段返回 INVALID_FIELD', () => {
    const noKey = `${TEXT_FORMAT.GROUP} ${TEXT_FORMAT.VERSION}\nNAME:组\nSORT:KEY_DEGREE\nCHORDS:\n`;
    expect(parseGroupFromText(noKey)).toEqual({ ok: false, reason: 'INVALID_FIELD' });
    const noChords = `${TEXT_FORMAT.GROUP} ${TEXT_FORMAT.VERSION}\nNAME:组\nSORT:NAME_ASC\n`;
    expect(parseGroupFromText(noChords)).toEqual({ ok: false, reason: 'INVALID_FIELD' });
  });
});
