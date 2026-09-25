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
import type { BarreEntity, BarreFret } from '@/domains/fretboard/types';

/** 构造测试和弦：默认标准调弦 6 弦、3 品、根音 5 弦 */
const makeChord = (name: string, strings: Chord['strings'], barres?: BarreEntity[]): Chord =>
  createChord({
    nameSegments: nameToSegments(name),
    strings,
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
        { fret: -1, preferFlat: false },
        { fret: 1, preferFlat: true },
        { fret: 3, preferFlat: false },
        { fret: 2, preferFlat: false },
        { fret: 2, preferFlat: false },
        { fret: 0, preferFlat: false },
      ],
      [{ fret: 2 as BarreFret, fromString: 2, toString: 4, finger: 2 }]
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
      { fret: -1, preferFlat: false },
      { fret: 1, preferFlat: true },
      { fret: 3, preferFlat: false },
      { fret: 2, preferFlat: false },
      { fret: 2, preferFlat: false },
      { fret: 0, preferFlat: false },
    ]);
    expect(result.data.barres).toEqual([{ fret: 2, fromString: 2, toString: 4, finger: 2 }]);
  });
});

describe('chordTextCodec 分组文字编解码', () => {
  it('分组序列化 → 解析往返保真（名称/排序规则/组内和弦保序）', () => {
    const chords = [
      makeChord('Am7', [
        { fret: -1, preferFlat: false },
        { fret: 0, preferFlat: false },
        { fret: 0, preferFlat: false },
        { fret: 0, preferFlat: false },
        { fret: 0, preferFlat: false },
        { fret: 0, preferFlat: false },
      ]),
      makeChord('C', [
        { fret: -1, preferFlat: false },
        { fret: 3, preferFlat: false },
        { fret: 2, preferFlat: false },
        { fret: 0, preferFlat: false },
        { fret: 1, preferFlat: false },
        { fret: 0, preferFlat: false },
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
});

describe('chordTextCodec 解析失败错误码（和弦 / 分组两个入口）', () => {
  /** 一条用例一行：入口解析器 + 输入文本 → 期望错误码 */
  const failCases = [
    {
      label: '乐谱文本误贴到和弦解析 → WRONG_TYPE',
      parse: parseChordFromText,
      text: `${TEXT_FORMAT.SONG} ${TEXT_FORMAT.VERSION}\nTITLE:x\nLYRICS:\n`,
      reason: 'WRONG_TYPE',
    },
    {
      label: '非本应用格式文本误贴到和弦解析 → UNKNOWN_FORMAT',
      parse: parseChordFromText,
      text: '随便什么歌词文本',
      reason: 'UNKNOWN_FORMAT',
    },
    // 只有魔数头 → INVALID_NAME：该错误码在本仓库仅此一处覆盖，勿并入 UNKNOWN_FORMAT 行
    {
      label: '只有魔数头的和弦文本 → INVALID_NAME',
      parse: parseChordFromText,
      text: `${TEXT_FORMAT.CHORD} ${TEXT_FORMAT.VERSION}`,
      reason: 'INVALID_NAME',
    },
    {
      label: '和弦文本误贴到分组解析 → WRONG_TYPE',
      parse: parseGroupFromText,
      text: `${TEXT_FORMAT.CHORD} ${TEXT_FORMAT.VERSION}\nNAME:C\n`,
      reason: 'WRONG_TYPE',
    },
    {
      label: '非本应用格式文本误贴到分组解析 → UNKNOWN_FORMAT',
      parse: parseGroupFromText,
      text: '随便什么歌词文本',
      reason: 'UNKNOWN_FORMAT',
    },
    // KEY_DEGREE 必须有 sortKey：本仓库仅此一处覆盖（SORT:KEY_DEGREE 无 SORTKEY 行）
    {
      label: 'KEY_DEGREE 缺 sortKey → INVALID_FIELD',
      parse: parseGroupFromText,
      text: `${TEXT_FORMAT.GROUP} ${TEXT_FORMAT.VERSION}\nNAME:组\nSORT:KEY_DEGREE\nCHORDS:\n`,
      reason: 'INVALID_FIELD',
    },
    {
      label: '缺 CHORDS 段 → INVALID_FIELD',
      parse: parseGroupFromText,
      text: `${TEXT_FORMAT.GROUP} ${TEXT_FORMAT.VERSION}\nNAME:组\nSORT:NAME_ASC\n`,
      reason: 'INVALID_FIELD',
    },
  ];

  it.each(failCases)('$label', ({ parse, text, reason }) => {
    expect(parse(text)).toEqual({ ok: false, reason });
  });
});
