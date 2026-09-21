import { describe, expect, it } from 'vitest';

import { validateImportExportPayload } from '@/app/services/validation/payload';
import { QUALITY_TOKENS } from '@/domains/chord/theory/chordQualityAst';
import { isValidChordName, nameToSegments } from '@/domains/chord/theory/theory';

/**
 * 识别引擎能输出的性质写法集合。
 *
 * 原实现遍历 `GRAMMAR_TEMPLATES`（47 条手写模板的 `suffix`，即引擎的输出词表）。
 * 引擎的候选来源已换成 `QUALITY_TOKENS`，故这里改为取每个 token 的**首选写法**
 * （`spellings[0]`）—— 同样是「引擎会输出的写法」，且覆盖从 47 条扩大到 63 条。
 */
const ENGINE_OUTPUT_SUFFIXES: string[] = QUALITY_TOKENS.map(t => t.spellings[0]!);

describe('和弦识别引擎与解析器语法一致性保证', () => {
  it('识别引擎能输出的所有和弦后缀均能被 isValidChordName 成功通过', () => {
    const failedCases: { suffix: string; chordName: string }[] = [];

    for (const suffix of ENGINE_OUTPUT_SUFFIXES) {
      const chordName = `C${suffix}`;
      if (!isValidChordName(chordName)) {
        failedCases.push({ suffix, chordName });
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
    // 全角括号被归一为半角，且与 `C7#9` 同构。
    //
    // 性质取记的是**整词** `7#9`，张力音不再散落在 `extensions` 里 ——
    // 这是重构的核心变化（`7#9` 在 token 表里是一条完整配方，而非「性质 7 + 张力音 #9」）。
    // 旧持久化形态（`quality: '7'` + `extensions: [[9, 1]]`）由 `normalizeChord` 一次性迁移。
    expect(first?.quality).toBe('7#9');
    expect(first?.unknownQuality).toBeUndefined();

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
            { fret: -1, preferFlat: false },
            { fret: 3, preferFlat: false },
            { fret: 2, preferFlat: false },
            { fret: 0, preferFlat: false },
            { fret: 1, preferFlat: false },
            { fret: 0, preferFlat: false },
          ],
        },
      ],
    };

    const res = validateImportExportPayload(payloadWithCorruptChord);
    expect(res.isValid).toBe(true);
    // 「不静默」是可观测契约：损坏名必须出现在告警里（用户能看到是哪一条），
    // 且该和弦的名称确实被重置为默认根音 C —— 只断言行为，不绑实现里的中文文案
    const allMsgs = [...(res.issues || []), ...(res.warnings || [])];
    expect(allMsgs.some(msg => msg.includes('InvalidUnknownChordX999'))).toBe(true);
    expect(res.payload?.chords[0]?.nameSegments?.root).toEqual(['C', 0]);
  });
});
