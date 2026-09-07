import { describe, expect, it } from 'vitest';

import { SCORE_EXPORT_CONFIG } from '@/domains/score/constants';
import { getCharColumnWidth, wrapScoreLines } from '@/domains/score/preview/workers/scoreExportWorker';

import type { ExportLineItem } from '@/domains/score/preview/workers/scoreExportWorker';

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
    expect(englishWidth).toBe(Math.round(SCORE_EXPORT_CONFIG.REGULAR_CHAR_WIDTH * 0.58));
    expect(barWidth).toBe(Math.round(SCORE_EXPORT_CONFIG.REGULAR_CHAR_WIDTH * 0.58));
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
      expect(firstChar).not.toBe('，');
      expect(firstChar).not.toBe('。');
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
});
