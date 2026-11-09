import { describe, expect, it } from 'vitest';

import { collectChordNotes, matchChordSearch } from '@/domains/chord/theory/chordSearch';
import { createChord } from '@/domains/chord/theory/entityFactories';
import { nameToSegments, Tuning } from '@/domains/chord/theory/theory';

import type { Chord } from '@/domains/chord/types';

/** 夹具：六根空弦按真实 GuitarStringEntity 形状构造（matchChordSearch 只读 nameSegments，弦模型仅占位） */
const openStrings = (): Chord['strings'] => [0, 0, 0, 0, 0, 0].map(fret => ({ fret, preferFlat: false }));

const createMockChord = (chordName: string): Chord =>
  createChord({
    id: `chord-${chordName}`,
    nameSegments: nameToSegments(chordName),
    strings: openStrings(),
    fretCount: 4,
    groupId: 'group-1',
    tuning: Tuning.STANDARD,
    rootStringIndex: null,
  });

describe('matchChordSearch - 智能和弦缩写与模糊匹配', () => {
  it('matches standard and shorthand major 7th chord names', () => {
    const cmaj7 = createMockChord('Cmaj7');

    // 全称搜索
    expect(matchChordSearch(cmaj7, 'Cmaj7')).toBe(true);
    expect(matchChordSearch(cmaj7, 'cmaj7')).toBe(true);

    // 缩写搜索 (CM7, CΔ7, Cδ7)
    expect(matchChordSearch(cmaj7, 'CM7')).toBe(true);
    // 小写根音 + 大写 M 仍按「大」解（首字母之外不折叠）
    expect(matchChordSearch(cmaj7, 'cM7')).toBe(true);
    expect(matchChordSearch(cmaj7, 'CΔ7')).toBe(true);
    expect(matchChordSearch(cmaj7, 'cδ7')).toBe(true);
  });

  it('大小写承载语义：小七与大七互不误命中', () => {
    const cmaj7 = createMockChord('Cmaj7');
    const cm7 = createMockChord('Cm7');

    // `m7` 是 Cm7 自己的写法，不该被当成大七的别名（曾把 maj→m 当别名，搜 Cm7 命中全库大七）
    expect(matchChordSearch(cmaj7, 'Cm7')).toBe(false);
    expect(matchChordSearch(cmaj7, 'cm7')).toBe(false);
    expect(matchChordSearch(cm7, 'Cm7')).toBe(true);
    expect(matchChordSearch(cm7, 'cm7')).toBe(true);
  });

  // 同一条「查询别名归一化」规则：全称与各类缩写 / unicode 变体记号都指向同一和弦。
  // 表列：和弦名 × 查询串 → 是否命中
  const aliasCases: { label: string; chordName: string; query: string; expected: boolean }[] = [
    { label: '+ 缩写匹配增三：Caug 全称', chordName: 'Caug', query: 'Caug', expected: true },
    { label: '+ 缩写匹配增三：C+', chordName: 'Caug', query: 'C+', expected: true },
    { label: '+ 缩写匹配增三：小写根音 c+', chordName: 'Caug', query: 'c+', expected: true },

    { label: '° 缩写匹配减三：Cdim 全称', chordName: 'Cdim', query: 'Cdim', expected: true },
    { label: '° 缩写匹配减三：C°', chordName: 'Cdim', query: 'C°', expected: true },
    { label: '° 缩写匹配减三：小写根音 c°', chordName: 'Cdim', query: 'c°', expected: true },

    { label: 'ø7 缩写匹配半减七：Cm7b5 全称', chordName: 'Cm7b5', query: 'Cm7b5', expected: true },
    { label: 'ø7 缩写匹配半减七：Cø7', chordName: 'Cm7b5', query: 'Cø7', expected: true },
    { label: 'ø7 缩写匹配半减七：Cø', chordName: 'Cm7b5', query: 'Cø', expected: true },

    { label: 'unicode 变体记号：# 匹配 F#m7', chordName: 'F#m7', query: 'F#m7', expected: true },
    { label: 'unicode 变体记号：♯ 匹配 F#m7', chordName: 'F#m7', query: 'F♯m7', expected: true },

    { label: 'unicode 变体记号：b 匹配 Bbmaj7', chordName: 'Bbmaj7', query: 'Bbmaj7', expected: true },
    { label: 'unicode 变体记号：♭ 匹配 Bbmaj7', chordName: 'Bbmaj7', query: 'B♭maj7', expected: true },
    { label: 'unicode 变体记号：♭ + 大七缩写 M7 匹配 Bbmaj7', chordName: 'Bbmaj7', query: 'B♭M7', expected: true },
  ];

  it.each(aliasCases)('$label', ({ chordName, query, expected }) => {
    expect(matchChordSearch(createMockChord(chordName), query)).toBe(expected);
  });

  // 规范化是「两侧过同一个映射」，因此**同一个和弦的两种写法必然折到同一个串** —— 这几条钉的是
  // 规范化本身的性质，而不是某一条映射的取值：
  //  - `-` 是 `m` 的等价记号，此前没有任何一条替换链认它（`C-7` 搜不到 `Cm7`）
  //  - `ø` 带不带 `7` 都折成 `m7b5`：旧实现写成 `ø|ø7` 就会让 `cø7` 变成 `cm7b57`（顺序敏感）
  //  - `M` 折成 `maj` 之后与 `m` 天然不同键，故不再需要按大小写分两档比对
  it('两侧同一规范化器：等价记号互通，且不依赖替换顺序', () => {
    const cm7 = createMockChord('Cm7');
    expect(matchChordSearch(cm7, 'C-7')).toBe(true);
    expect(matchChordSearch(cm7, 'Cmin7')).toBe(true);

    const cm7b5 = createMockChord('Cm7b5');
    // 带 7 与不带 7 是同一批音，两条都必须命中；旧链的先后顺序一改就会漏掉带 7 的那条
    expect(matchChordSearch(cm7b5, 'Cø7')).toBe(true);
    expect(matchChordSearch(cm7b5, 'Cø')).toBe(true);

    const cmMaj7 = createMockChord('CmMaj7');
    expect(matchChordSearch(cmMaj7, 'CmM7')).toBe(true);
    expect(matchChordSearch(cmMaj7, 'Cmmaj7')).toBe(true);
    // 小大七（`mM7` → `mmaj7`）不能被大七（`M7` → `maj7`）的写法命中
    expect(matchChordSearch(cmMaj7, 'Cmaj7')).toBe(false);
  });

  it('子串匹配支持「边打边搜」：半截输入也能命中', () => {
    // 这条同时钉住「不能改成 AST 等价比较」的理由 —— 半截输入解析不出 AST
    expect(matchChordSearch(createMockChord('Cmaj7'), 'cmaj')).toBe(true);
    expect(matchChordSearch(createMockChord('Cmaj7'), 'c')).toBe(true);
    expect(matchChordSearch(createMockChord('Cm7b5'), 'cø')).toBe(true);
    expect(matchChordSearch(createMockChord('Caug'), 'c+')).toBe(true);
  });
});

describe('collectChordNotes - 物理最低音必须按完整 MIDI 取（不是音级取 min）', () => {
  /** 六弦指法：弦序 0 = 低 E，-1 = 静音 */
  const fingering = (...frets: number[]): Chord['strings'] => frets.map(fret => ({ fret, preferFlat: false }));

  it('G（320003）的最低音是低 E 弦 3 品的 G，而不是音级最小的 D', () => {
    // 各弦音级为 G7 B11 D2 G7 B11 G7，音级取 min 会得 D2 —— 但物理最低音是低 E 弦 3 品的 G2（MIDI 43）。
    // 这个错误结论会一路传下去：computeIsInverted 把 G 判成转位、低音一致性校验报假警告、
    // 指纹里的 isInverted 位随之失真。故必须按完整 MIDI 取最小、最后再归一成音级返回。
    expect(collectChordNotes(fingering(3, 2, 0, 0, 0, 3)).bassPitch).toBe(7);
  });

  it('真正以 D 为最低音的和弦仍返回 D（不是把「最低音」一律算成根音）', () => {
    // 反面对照：D（xx0232）的最低音就是 D 弦空弦 D3 ⇒ 音级 2
    expect(collectChordNotes(fingering(-1, -1, 0, 2, 3, 2)).bassPitch).toBe(2);
  });

  it('全部静音时返回 -1（无音）', () => {
    expect(collectChordNotes(fingering(-1, -1, -1, -1, -1, -1)).bassPitch).toBe(-1);
  });
});
