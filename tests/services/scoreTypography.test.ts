import { describe, expect, it } from 'vitest';

import { SCORE_EXPORT_CONFIG } from '@/domains/score/constants';
import { getGlyphAdvanceWidth, getWordKern, wrapScoreLines } from '@/domains/score/preview/workers/scoreExportWorker';
import {
  beginLyricFlow,
  fretboardBoxWidth,
  getChordsGroupWidth,
  lyricFlowWidth,
  placeLyricChar,
  reserveBeforeEndChords,
} from '@/domains/score/preview/workers/scoreExportWorker/scoreExportLayout';

import type {
  ExportCharItem,
  ExportChordData,
  ExportLineItem,
  RenderSegment,
} from '@/domains/score/preview/workers/scoreExportWorker';

/** 按「续行缩进 + 段首和弦组 + 逐字推进 + 段尾和弦组」独立重算段宽（渲染侧宽度定义）。
 *  逐字推进走 placeLyricChar，与折行端共用同一套原语 —— 这里独立的是「把段宽重新走一遍」，
 *  不是把规则抄第二遍。 */
const recomputeSegmentWidth = (seg: RenderSegment): number => {
  // 折减只发生在**段内相邻对**之间：跨段的两个字各在新行，不再相邻
  const flow = beginLyricFlow(seg.startChords);
  for (let i = 0; i < seg.chars.length; i++) {
    const item = seg.chars[i]!;
    const prev = seg.chars[i - 1];
    placeLyricChar(flow, item, prev ? getWordKern(prev, item) : 0);
  }
  const endChordsW = getChordsGroupWidth(seg.endChords);
  if (endChordsW > 0) reserveBeforeEndChords(flow);
  return (
    (seg.isContinuation ? SCORE_EXPORT_CONFIG.WRAPPED_LINE_INDENT : 0) +
    (endChordsW > 0 ? flow.x + endChordsW : lyricFlowWidth(flow))
  );
};

/** 量一段字符的**字形中心**（相对段首）：排版规则的可观测面，供「有和弦 / 无和弦」两种排法对照 */
const glyphCentersOf = (chars: ExportCharItem[]): number[] => {
  const flow = beginLyricFlow();
  const centers: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    const prev = chars[i - 1];
    centers.push(placeLyricChar(flow, chars[i]!, prev ? getWordKern(prev, chars[i]!) : 0));
  }
  return centers;
};

const makeChord = (chordName: string): ExportChordData => ({
  chordName,
  strings: [[0, true]],
  fretCount: 4,
  rootStringIndex: 0,
});

const toChars = (text: string): ExportCharItem[] => text.split('').map(char => ({ char }));

describe('乐谱排版与折行引擎算法测试', () => {
  it('半角字符与全角汉字字宽区分准确', () => {
    const hanziWidth = getGlyphAdvanceWidth({ char: '我' });
    const englishWidth = getGlyphAdvanceWidth({ char: 'a' });
    const numberWidth = getGlyphAdvanceWidth({ char: '1' });
    const barWidth = getGlyphAdvanceWidth({ char: '|' });
    const fullBarWidth = getGlyphAdvanceWidth({ char: '｜' });
    const spaceWidth = getGlyphAdvanceWidth({ char: ' ' });

    expect(hanziWidth).toBe(SCORE_EXPORT_CONFIG.REGULAR_CHAR_WIDTH);
    expect(fullBarWidth).toBe(SCORE_EXPORT_CONFIG.REGULAR_CHAR_WIDTH);
    expect(spaceWidth).toBe(SCORE_EXPORT_CONFIG.SPACE_CHAR_WIDTH);
    // 半角英文、数字与小节竖线宽度严格小于全角汉字宽度
    expect(englishWidth).toBeLessThan(hanziWidth);
    expect(numberWidth).toBeLessThan(hanziWidth);
    expect(barWidth).toBeLessThan(hanziWidth);
    // 半角 ASCII 共用同一字宽（实现按 code <= 127 判定），比例约三分之二
    // （字形典型推进宽 + 与全角汉字相同的字间隙）——
    // 只钉「半角互等 + 比例落在带宽内」，不把实现里的具体系数抄进断言
    expect(englishWidth).toBe(numberWidth);
    expect(englishWidth).toBe(barWidth);
    expect(englishWidth / hanziWidth).toBeGreaterThan(0.5);
    expect(englishWidth / hanziWidth).toBeLessThan(0.7);
  });

  it('中文避头尾规则生效：标点符号不得单独出现在新行开头', () => {
    // 构造刚好在逗号处超宽的歌词
    // 比如：一二三四五，六七八
    // 如果切在 "，"，避头尾机制应将 "五" 连同 "，" 一起借入新行，或者避免 "，" 孤立作为行首
    const chars = '一二三四五，六七八九十'.split('').map(char => ({ char }));
    const line: ExportLineItem = {
      lineIdx: 0,
      chars,
    };

    // 设置宽度刚好让 "一二三四五" 达到临界值
    const singleCharW = SCORE_EXPORT_CONFIG.REGULAR_CHAR_WIDTH;
    const testWidth = singleCharW * 5 + 5; // 只能容纳 5 个字

    const segments = wrapScoreLines([line], testWidth);
    expect(segments.length).toBeGreaterThan(1);

    // 严禁任何第二段或续行的第一个字符为逗号
    for (let i = 1; i < segments.length; i++) {
      const firstChar = segments[i]?.chars[0]?.char;
      // 注：原先此处还有 `expect(firstChar).not.toBe('。')`，已删——本用例输入是
      // '一二三四五，六七八九十'，整串不含句号，该断言不可能失败；若要覆盖句号需另造输入
      expect(firstChar).not.toBe('，');
    }
  });

  it('空行能够正确作为独立段落保留并标记为单段', () => {
    const emptyLine: ExportLineItem = {
      lineIdx: 0,
      chars: [],
    };
    const segments = wrapScoreLines([emptyLine], 500);
    expect(segments.length).toBe(1);
    expect(segments[0]?.isLastSubLine).toBe(true);
    expect(segments[0]?.chars.length).toBe(0);
  });

  it('预计算段宽与逐字符重算一致：覆盖软折行、避头尾回借、孤字回借与首尾边和弦', () => {
    const singleCharW = SCORE_EXPORT_CONFIG.REGULAR_CHAR_WIDTH;
    const narrowWidth = singleCharW * 5 + 5; // 每行只容得下 5 个字，逼出多段
    const startChords = [makeChord('C'), makeChord('G')];
    const endChords = [makeChord('Am')];

    const cases: ExportLineItem[] = [
      // 1) 常规软折行 + 段首 / 段尾边和弦
      { lineIdx: 0, chars: toChars('一二三四五六七八九十'), startChords, endChords },
      // 2) 避头尾回借：逗号不得成为行首，末字被回借给下一段
      { lineIdx: 1, chars: toChars('一二三四五，六七八九十'), endChords },
      // 3) 孤字回借：6 字行在 5 字可用宽下末段只剩 1 字，须从上一段（5 字 > 2）回借一字
      { lineIdx: 2, chars: toChars('一二三四五六'), endChords },
      // 4) 空行仅带边和弦：无字符也要把和弦组宽度计入
      { lineIdx: 3, chars: [], endChords },
    ];

    const segments = wrapScoreLines(cases, narrowWidth);
    expect(segments.length).toBeGreaterThan(cases.length);

    // 核心不变量：预计算宽度必须与逐字符重算一致（两处回借的扣减也在其中）
    for (const seg of segments) {
      expect(seg.width).toBe(recomputeSegmentWidth(seg));
    }

    // 回借分支的账要平：按原顺序拼回必须与原句完全一致，不丢字、不重复、不乱序
    for (const line of cases) {
      const rebuilt = segments
        .filter(seg => seg.lineIdx === line.lineIdx)
        .flatMap(seg => seg.chars.map(item => item.char))
        .join('');
      expect(rebuilt).toBe(line.chars.map(item => item.char).join(''));
    }

    // 避头尾回借生效：逗号所在句的每一段段首都不是禁止行首标点
    for (const seg of segments.filter(seg => seg.lineIdx === 1)) {
      expect(seg.chars[0]?.char).not.toBe('，');
    }

    // 孤字回借生效：末段由 1 字变为 2 字，前段相应让出一字
    expect(segments.filter(seg => seg.lineIdx === 2).map(seg => seg.chars.length)).toEqual([4, 2]);
  });

  it('词内折减：连续半角字符之间的间距收一半，词界与全角字不受影响', () => {
    const gap = SCORE_EXPORT_CONFIG.REGULAR_CHAR_WIDTH - SCORE_EXPORT_CONFIG.LYRICS_FONT_SIZE;
    const halfGap = gap / 2;
    const letterW = getGlyphAdvanceWidth({ char: 'a' });

    // 词内相邻两字：折减半个字间隙
    expect(getWordKern({ char: 'a' }, { char: 'b' })).toBe(halfGap);
    // 词界（空格）两侧都不折减：词与词之间的距离与改前逐像素相同
    expect(getWordKern({ char: 'a' }, { char: ' ' })).toBe(0);
    expect(getWordKern({ char: ' ' }, { char: 'b' })).toBe(0);
    // 词内标点 / 数字算词内：don't、capo 2、rock-'n'-roll 不该在标点两侧松开
    expect(getWordKern({ char: 'n' }, { char: "'" })).toBe(halfGap);
    expect(getWordKern({ char: '2' }, { char: '3' })).toBe(halfGap);
    // 歌词分隔符与全角汉字算词界
    expect(getWordKern({ char: 'a' }, { char: '|' })).toBe(0);
    expect(getWordKern({ char: '我' }, { char: 'a' })).toBe(0);
    // 挂和弦不豁免折减（2026-09-28 口径变更）：和弦图不再撑宽字符格，图与图的间隔另由推挤保证
    expect(getWordKern({ char: 'a', chord: makeChord('C') }, { char: 'b' })).toBe(halfGap);
    expect(getWordKern({ char: 'a' }, { char: 'b', chord: makeChord('C') })).toBe(halfGap);

    // 段宽 = Σ字宽 − Σ词内折减：3 个字母的词比逐字字宽之和少 2 个半字间隙
    const [seg] = wrapScoreLines([{ lineIdx: 0, chars: toChars('abc') }], 5000);
    expect(seg?.width).toBe(letterW * 3 - halfGap * 2);
    expect(seg?.width).toBe(recomputeSegmentWidth(seg!));

    // 汉字夹在词中间：汉字两侧仍是全间距，只有半角字之间收
    const [mixed] = wrapScoreLines([{ lineIdx: 0, chars: toChars('ab我cd') }], 5000);
    expect(mixed?.width).toBe(letterW * 4 - halfGap * 2 + SCORE_EXPORT_CONFIG.REGULAR_CHAR_WIDTH);
  });

  it('和弦图不撑宽字符格：连续字母的字距与有没有和弦无关', () => {
    const halfGap = (SCORE_EXPORT_CONFIG.REGULAR_CHAR_WIDTH - SCORE_EXPORT_CONFIG.LYRICS_FONT_SIZE) / 2;
    const letterW = getGlyphAdvanceWidth({ char: 'a' });

    const plain = glyphCentersOf(toChars('ab'));
    const chordOnFirst = glyphCentersOf([{ char: 'a', chord: makeChord('A6') }, { char: 'b' }]);

    // 词内间距只由字宽与折减决定 —— 这正是「连续字母是一个整体」的全部含义。
    // 旧口径下这里会变成「近一整个指板框宽」（字被居中到装得下整张图的宽格里）。
    expect(plain[1]! - plain[0]!).toBe(letterW - halfGap);
    expect(chordOnFirst[1]! - chordOnFirst[0]!).toBe(plain[1]! - plain[0]!);

    // 和弦图只把整段右推（图不越出段首），不把后一字推到图的右侧
    expect(chordOnFirst[0]!).toBeGreaterThan(plain[0]!);
    expect(chordOnFirst[1]! - chordOnFirst[0]!).toBeLessThan(fretboardBoxWidth() / 2);

    // 相邻两字都挂和弦：图与图之间恒留 CHORD_COLUMN_EXTRA_PAD（中心距 = 框宽 + pad），不叠不贴
    const bothChords = glyphCentersOf([
      { char: 'a', chord: makeChord('A') },
      { char: 'b', chord: makeChord('B') },
    ]);
    expect(bothChords[1]! - bothChords[0]!).toBe(fretboardBoxWidth() + SCORE_EXPORT_CONFIG.CHORD_COLUMN_EXTRA_PAD);

    // 段首那张图落在段首之后半个 pad 处（不贴边、不越界），段宽因此恰好是「框宽 + 半个 pad」
    const [single] = wrapScoreLines([{ lineIdx: 0, chars: [{ char: 'a', chord: makeChord('A') }] }], 5000);
    expect(single!.width).toBe(fretboardBoxWidth() + SCORE_EXPORT_CONFIG.CHORD_COLUMN_EXTRA_PAD / 2);
    expect(single!.width).toBe(recomputeSegmentWidth(single!));
  });

  it('段尾图与行尾边和弦组不叠：入列前把游标推过段尾那张图', () => {
    const chord = makeChord('C');
    const endChords = [makeChord('Am')];
    const endChordsW = getChordsGroupWidth(endChords);

    const [withEnd] = wrapScoreLines([{ lineIdx: 0, chars: [{ char: 'a', chord }], endChords }], 5000);
    // 段尾那张图：中心 = 字形中心，恒宽 = 框宽
    const figureRight = glyphCentersOf([{ char: 'a', chord }])[0]! + fretboardBoxWidth() / 2;
    // 边和弦组第一张图的左边缘 = 组起点 + 段间间隔（组起点 = 段宽 − 组宽，见 reserveBeforeEndChords）。
    // 刻意**不**再加半个框宽：`drawFretboard` 收的是**左边缘**（行内那一路传的就是 `centerX − 框宽/2`），
    // 边和弦组这一路直接传 `flow.x + EDGE_CHORD_SECTION_GAP`；多算半框宽会让下面那条「不叠」的
    // 断言凭空松掉半个框宽 —— 松掉的正是它要守的那段安全距离。
    const endChordLeft = withEnd!.width - endChordsW + SCORE_EXPORT_CONFIG.EDGE_CHORD_SECTION_GAP;

    expect(endChordLeft).toBeGreaterThanOrEqual(figureRight + SCORE_EXPORT_CONFIG.CHORD_COLUMN_EXTRA_PAD);
    expect(withEnd!.width).toBe(recomputeSegmentWidth(withEnd!));

    // 对照：段尾不挂和弦时边和弦组紧接游标，不被无谓推远
    const [plain] = wrapScoreLines([{ lineIdx: 0, chars: toChars('a'), endChords }], 5000);
    expect(plain!.width - endChordsW).toBe(getGlyphAdvanceWidth({ char: 'a' }));
    expect(plain!.width).toBe(recomputeSegmentWidth(plain!));
  });

  it('词内折减在两条回借路径上的账要平：避头尾回借与孤字回借', () => {
    // 40px 宽：'a','b' 之后 ','（禁则行首字符）放不下 ⇒ 触发避头尾回借，'b' 随 ',' 一起进下一段。
    // 回借会改掉两处相邻关系（本段少一对、下一段多一对），两段的折减都要跟着重算
    const punctuation = wrapScoreLines([{ lineIdx: 0, chars: toChars('ab,cdef') }], 40);
    expect(punctuation.length).toBeGreaterThan(1);
    for (const seg of punctuation) {
      expect(seg.width).toBe(recomputeSegmentWidth(seg));
      expect(seg.chars[0]?.char).not.toBe(',');
    }
    expect(punctuation.flatMap(seg => seg.chars.map(i => i.char)).join('')).toBe('ab,cdef');

    // 155px 宽：10 个字母先折成 9 + 1，末段孤字再从上一段回借一个 ⇒ 8 + 2
    const orphanWidth = SCORE_EXPORT_CONFIG.REGULAR_CHAR_WIDTH * 5 + 5;
    const orphan = wrapScoreLines([{ lineIdx: 0, chars: toChars('abcdefghij') }], orphanWidth);
    for (const seg of orphan) expect(seg.width).toBe(recomputeSegmentWidth(seg));
    expect(orphan.map(seg => seg.chars.length)).toEqual([8, 2]);
    expect(orphan.flatMap(seg => seg.chars.map(i => i.char)).join('')).toBe('abcdefghij');
  });

  it('忽略空格档：连续的无和弦空格压缩为一个，单格与挂和弦的空格不受影响', () => {
    const spaceW = SCORE_EXPORT_CONFIG.SPACE_CHAR_WIDTH;
    // 「我␣␣爱␣␣␣你␣(挂和弦)」：两段连续空格（2 格 / 3 格），末尾一个挂和弦的空格
    const chars: ExportCharItem[] = [
      { char: '我' },
      { char: ' ' },
      { char: ' ' },
      { char: '爱' },
      { char: ' ' },
      { char: ' ' },
      { char: ' ' },
      { char: '你' },
      { char: ' ', chord: makeChord('C') },
    ];
    const line: ExportLineItem = { lineIdx: 0, chars };

    const plain = wrapScoreLines([line], 5000);
    const compressed = wrapScoreLines([line], 5000, true);

    // 关档（默认）：一个字符一格，空格照旧占位
    expect(plain[0]?.chars).toHaveLength(chars.length);
    // 开档：两段连续空格各留一格，挂和弦的那格原样保留（压掉它等于丢掉和弦图）⇒ 9 − 3 = 6
    expect(compressed[0]?.chars.map(item => item.char)).toEqual(['我', ' ', '爱', ' ', '你', ' ']);
    expect(compressed[0]?.chars[5]?.chord).toEqual(makeChord('C'));
    // 段宽是压缩后的**实际占用**：差值恰为省下的三格空格宽，而不是把空壳字符留着让宽度虚高
    expect(plain[0]!.width - compressed[0]!.width).toBe(spaceW * 3);
    expect(compressed[0]?.width).toBe(recomputeSegmentWidth(compressed[0]!));
  });
});
