/**
 * 斜杠低音一致性校验、调弦空弦基准。
 *
 * 从 theory.ts 抽出（原 938~956、1236、1242~1271 行）。
 * getColorNoteCountAndPitches / getComplexityRank 属 chordSort 模块（被 buildSortMeta 使用）。
 * 和弦指纹（computeChordFingerprint）已迁至 chordIdentity 模块 —— 它与本模块的「低音一致性」
 * 无关，是「两条记录是否同一个和弦」的身份判定，和归一化名称键属同一件事。
 */

import { getChordName, parseChordName } from './chordName';
import { collectChordNotes } from './chordSearch';
import { DEFAULT_TUNING_MAPPING, getBaseStringsFor, Tuning, TUNING_PRESETS } from './tuning';

import type { ChordNameSegments } from '@/domains/chord/types';
import type { GuitarStringEntity } from '@/domains/fretboard/types';

/**
 * 斜杠低音一致性校验：和弦名为 C/E 时，名字里的低音（E）应与指板物理最低音一致。
 * 返回 null 表示无需校验（无斜杠/无法解析）；否则返回描述不一致的文案。
 */
export const validateBassConsistency = (
  strings: GuitarStringEntity[],
  fretOffset: number = 0,
  tuning: Tuning | string = Tuning.STANDARD,
  chordOrName?: string | { nameSegments?: ChordNameSegments | null; chordName?: string }
): string | null => {
  if (!chordOrName) return null;
  const chordName = typeof chordOrName === 'string' ? chordOrName : getChordName(chordOrName);
  const parsed = parseChordName(chordName);
  if (!parsed.hasBass || parsed.bassPitch === 99) return null;
  const baseStrings = getBaseStringsFor(tuning, strings.length);
  const { bassPitch } = collectChordNotes(strings, fretOffset, baseStrings);
  if (bassPitch === -1) return null;
  // 音高模 12 比较（忽略八度）
  if (bassPitch % 12 !== parsed.bassPitch)
    return `和弦名标注的低音 ${parsed.bassLabel} 与指板最低音不一致，可能导致转位判定/排序失真`;

  return null;
};

/** 取指定调弦预设的空弦基准音高数组；未知调弦回退标准调弦。
 *  stringCount 缺省取预设自身弦数（保持既有调用语义）；传入实际弦数时按弦数延伸/截取。 */
export const getActiveBaseStrings = (tuning: Tuning, stringCount?: number) => {
  const presetCount = TUNING_PRESETS[tuning]?.stringCount;
  return getBaseStringsFor(tuning, stringCount ?? presetCount ?? DEFAULT_TUNING_MAPPING.length);
};
