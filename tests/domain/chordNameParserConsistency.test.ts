import { describe, expect, it } from 'vitest';

import { validateImportExportPayload } from '@/app/services/validation/payload';
import { GRAMMAR_TEMPLATES } from '@/domains/chord/theory/grammar';
import { isValidChordName, nameToSegments } from '@/domains/chord/theory/theory';

describe('和弦识别引擎与解析器语法一致性保证', () => {
  it('GRAMMAR_TEMPLATES 识别引擎能输出的所有和弦后缀均能被 isValidChordName 成功通过', () => {
    const failedCases: { suffix: string; chordName: string }[] = [];

    for (const template of GRAMMAR_TEMPLATES) {
      const chordName = `C${template.suffix}`;
      if (!isValidChordName(chordName)) {
        failedCases.push({ suffix: template.suffix, chordName });
      }
    }

    // 严禁存在"识别引擎能生成、解析器却判定非法"的和弦
    expect(failedCases).toEqual([]);
  });

  it('针对性验证复杂复合和弦（mMaj9, 13sus4, 7sus 等）的解析与性质识别', () => {
    const testChords = ['CmMaj9', 'C13sus4', 'C7sus', 'C11sus4', 'Cadd13'];
    for (const name of testChords) {
      expect(isValidChordName(name)).toBe(true);
      const segs = nameToSegments(name);
      expect(segs?.root).toEqual(['C', 0]);
      expect(segs?.unknownQuality).toBeUndefined();
    }
  });

  it('支持全角括号容错解析（如 C7（#9））且命中缓存', () => {
    const fullWidth = 'C7（#9）';
    expect(isValidChordName(fullWidth)).toBe(true);
    const first = nameToSegments(fullWidth);
    expect(first?.root).toEqual(['C', 0]);
    expect(first?.quality).toBe('7');
    expect(first?.extensions).toEqual([[9, 1]]);

    const second = nameToSegments(fullWidth);
    expect(second).toBe(first);
  });

  it('当导入/迁移数据中和弦名彻底损坏时，在 issues/warnings 中显式记录告警而不是静默覆盖', () => {
    const payloadWithCorruptChord = {
      version: 2,
      groups: [{ id: 'g1', name: '常用' }],
      chords: [
        {
          id: 'chord-corrupted-1',
          groupId: 'g1',
          chordName: 'InvalidUnknownChordX999',
          strings: [
            [-1, false],
            [3, false],
            [2, false],
            [0, false],
            [1, false],
            [0, false],
          ],
        },
      ],
    };

    const res = validateImportExportPayload(payloadWithCorruptChord);
    expect(res.isValid).toBe(true);
    // 必须有明确 issues/warnings 提示已记录并重置
    const allMsgs = [...(res.issues || []), ...(res.warnings || [])];
    const hasWarning = allMsgs.some(msg => msg.includes('InvalidUnknownChordX999') && msg.includes('重置'));
    expect(hasWarning).toBe(true);
  });
});
