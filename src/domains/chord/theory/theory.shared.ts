/**
 * theory.ts 的跨模块私有 helper 枢纽。
 *
 * 仅被各主题模块（pitch / transpose / chordSort / chordDegree）内部引用，
 * 不通过 theory.ts 的 barrel 对外公开（theory.ts 不会 `export *` 本文件），
 * 因此这些符号不构成 theory 的公开 API。
 */

import { chordQualityAstOfName } from './chordName';
import { qualityKindOfAst } from './chordQualityAst';

// 半音音名表（升号 / 降号）：pitch 与 transpose 共用
export const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// 调内音级位掩码与度数映射：chordSort 与 chordDegree 共用
export const DIATONIC_INTERVALS_MASK = (1 << 0) | (1 << 2) | (1 << 4) | (1 << 5) | (1 << 7) | (1 << 9) | (1 << 11);
export const DIATONIC_DEGREE_MAP = Object.freeze([1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6, 7]);

/**
 * 性质口味判定：读 AST 字段，取代旧实现对「拼接出来的 suffix 字符串」跑正则
 * （`/^(maj|M|Δ)/`、`/^(dim|°|ø|m7b5)/` …），与解析器是两套独立事实源容易漂移。
 * chordSort（buildSortMeta 的 qualityRank）与 chordDegree（isMinorChord / isDim 判定）共用。
 */
export const isMinorFlavoredQuality = (quality?: string): boolean => {
  if (!quality) return false;
  const ast = chordQualityAstOfName(quality);
  if (!ast) return false;
  return ast.third === 'min3' || ast.fifth === 'dim5' || ast.seventh === 'dim7';
};

export const isDimFlavoredQuality = (quality?: string): boolean => {
  if (!quality) return false;
  const ast = chordQualityAstOfName(quality);
  if (!ast) return false;
  return ast.fifth === 'dim5' || ast.seventh === 'dim7';
};

/** 调内性质归类：减/半减 → dim，小调类 → min，其余 → maj。与识别层共用同一份 AST 判据。 */
export const qualityKindOf = (quality?: string): 'maj' | 'min' | 'dim' => {
  if (!quality) return 'maj';
  const ast = chordQualityAstOfName(quality);
  if (!ast) return 'maj';
  return qualityKindOfAst(ast);
};
