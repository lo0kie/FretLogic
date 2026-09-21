import { describe, expect, it } from 'vitest';

import { SCORE_EXPORT_CONFIG } from '@/domains/score/constants';
import { getCharColumnWidth, wrapScoreLines } from '@/domains/score/preview/workers/scoreExportWorker';

import type {
  ExportCharItem,
  ExportChordData,
  ExportLineItem,
  RenderSegment,
} from '@/domains/score/preview/workers/scoreExportWorker';

/** 按「续行缩进 + 段首和弦组 + 逐字符列宽 + 段尾和弦组」独立重算段宽（渲染侧宽度定义） */
const recomputeSegmentWidth = (seg: RenderSegment): number => {
  const groupW = (chords?: ExportChordData[]): number =>
    chords && chords.length > 0
      ? chords.length * SCORE_EXPORT_CONFIG.FRETBOARD_WIDTH +
        (chords.length - 1) * SCORE_EXPORT_CONFIG.INLINE_CHORD_GAP +
        SCORE_EXPORT_CONFIG.EDGE_CHORD_SECTION_GAP
      : 0;
  return (
    (seg.isContinuation ? SCORE_EXPORT_CONFIG.WRAPPED_LINE_INDENT : 0) +
    groupW(seg.startChords) +
    seg.chars.reduce((sum, item) => sum + getCharColumnWidth(item), 0) +
    groupW(seg.endChords)
  );
};

const makeChord = (chordName: string): ExportChordData => ({
  chordName,
  strings: [[0, true]],
  fretCount: 4,
  rootStringIndex: 0,
});

const toChars = (text: string): ExportCharItem[] => text.split('').map(char => ({ char }));

describe('乐谱排版与折行引擎算法测试', () => {
  it('半角字符与全角汉字列宽区分准确', () => {
    const hanziWidth = getCharColumnWidth({ char: '我' });
    const englishWidth = getCharColumnWidth({ char: 'a' });
    const numberWidth = getCharColumnWidth({ char: '1' });
    const barWidth = getCharColumnWidth({ char: '|' });
    const fullBarWidth = getCharColumnWidth({ char: '｜' });
    const spaceWidth = getCharColumnWidth({ char: ' ' });

    expect(hanziWidth).toBe(SCORE_EXPORT_CONFIG.REGULAR_CHAR_WIDTH);
    expect(fullBarWidth).toBe(SCORE_EXPORT_CONFIG.REGULAR_CHAR_WIDTH);
    expect(spaceWidth).toBe(SCORE_EXPORT_CONFIG.SPACE_CHAR_WIDTH);
    // 半角英文、数字与小节竖线宽度严格小于全角汉字宽度
    expect(englishWidth).toBeLessThan(hanziWidth);
    expect(numberWidth).toBeLessThan(hanziWidth);
    expect(barWidth).toBeLessThan(hanziWidth);
    // 半角 ASCII 共用同一列宽（实现按 code <= 127 判定），且约为全角的六成——
    // 只钉「半角互等 + 比例落在带宽内」，不把实现里的 0.58 抄进断言
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
});
