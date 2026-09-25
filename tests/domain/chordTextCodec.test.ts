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

  it('分组名里的换行 / 回车 / 反斜杠转义后原样往返，且不能注入伪造的段标记', () => {
    // 名字是**行内嵌入值**：不转义时换行会把一行拆成两行 —— 轻则回读失败，
    // 重则被解析成伪造的段（`SORT:` / `CHORDS:`）。反斜杠必须一起转义，否则名字里本来就有的
    // `\n` 这两个字符回读时会被当成换行（往返不再保真）。
    const names = ['含换行的\n名字', '含回车的\r名字', '含反斜杠\\的名字', '字面\\n两个字符', 'A\\', '尾部反斜杠\\'];
    for (const name of names) {
      const text = serializeGroupToText({ name, sortRule: GroupSortRule.ROOT_PITCH }, []);
      // 转义后必须仍是**单行**：这是「一行一个字段」这条协议的硬要求
      expect(text.split('\n')).toHaveLength(4); // HEADER / NAME / SORT / CHORDS
      const result = parseGroupFromText(text);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      // 原样往返。注意首尾空白仍会被 trim 掉（那是改动前就有的口径），故这里只用不含首尾空白的名字
      expect(result.data.name).toBe(name);
    }

    // 注入形态：名字里塞一个假段，回读时必须仍是一个名字、且没有多出和弦段
    const injected = serializeGroupToText(
      { name: '真名\nCHORDS:\nX=C;STANDARD;', sortRule: GroupSortRule.ROOT_PITCH },
      []
    );
    expect(injected.split('\n')).toHaveLength(4);
    const injectedResult = parseGroupFromText(injected);
    expect(injectedResult.ok).toBe(true);
    if (!injectedResult.ok) return;
    expect(injectedResult.data.name).toBe('真名\nCHORDS:\nX=C;STANDARD;');
    expect(injectedResult.data.chords).toEqual([]);
  });

  it('本应用格式但版本不符判 INVALID_HEADER，与「陌生格式」的 UNKNOWN_FORMAT 区分开', () => {
    // classifyHeader 的口径：头部**以自家魔数开头**但不是完整头部 ⇒ INVALID_HEADER（自家旧版本 /
    // 版本号写错），否则 UNKNOWN_FORMAT（别人的文本）。两者给用户的提示完全不同，
    // 而这条判据此前没有用例覆盖。
    const group = parseGroupFromText(`${TEXT_FORMAT.GROUP} 999\nNAME:甲\nSORT:ROOT_PITCH\nCHORDS:`);
    expect(group.ok).toBe(false);
    if (!group.ok) expect(group.reason).toBe('INVALID_HEADER');

    const chord = parseChordFromText(`${TEXT_FORMAT.CHORD} 999\nC;STANDARD;`);
    expect(chord.ok).toBe(false);
    if (!chord.ok) expect(chord.reason).toBe('INVALID_HEADER');
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
