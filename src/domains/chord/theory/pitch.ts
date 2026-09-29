/**
 * 音高 / 音名层：空弦基准音、MIDI 音高、音级索引、音名（含升降号）标签与格式化。
 *
 * 从 theory.ts 抽出（原 32~153 行，剔除仅 chordSort 使用的 `isChordToneRelative`）。
 * 私有常量本文件自持（原先从 theory.shared 取的 NOTES_SHARP / NOTES_FLAT 只被已删除的
 * 死码 calcNoteLabel 使用，已随之一并移除；这两个符号在 transpose.ts 中仍在使用）。
 */

import { MUTED_FRET } from '@/domains/fretboard/constants';

import { DEFAULT_TUNING_MAPPING } from './tuning';

import type { GuitarStringEntity } from '@/domains/fretboard/types';

/** 调性键名选项（升号调/降号调按常见记谱习惯混合）。`as const` 让下游拿到真实联合而非 `string` */
export const KEY_OPTIONS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

/** 下拉里可选的一个调名 */
export type KeyOption = (typeof KEY_OPTIONS)[number];

/**
 * 调名**值域**：`KEY_OPTIONS` 的 12 个之外，还含移调会实际产出的等音异名。
 *
 * 为什么不是 12 个：`transpose.ts` 的 `spellPitch` 优先沿用原写法的升降号方向 ——
 * 源调名含 `b` 时走降号表，于是 `Bb` 升 3 个半音得 `Db`（而不是 `C#`）、降 2 个得 `Ab`；
 * 源调名含 `#` 时走升号表，于是 `C#` 升 2 个半音得 `D#`、`F#` 升 2 个得 `G#`。
 * 两个表各 12 名、去重后共 17 名。把调名收窄到 `KEY_OPTIONS` 那 12 个，会让应用自身的移调
 * 结果落在类型域外（存不回去、或必须强转），所以值域必须是这 17 个。
 *
 * 顺序即 `NOTES_SHARP` 与 `NOTES_FLAT` 的并集顺序，便于与那两张表对照。
 */
export const KEY_NAMES = [
  'C',
  'C#',
  'Db',
  'D',
  'D#',
  'Eb',
  'E',
  'F',
  'F#',
  'Gb',
  'G',
  'G#',
  'Ab',
  'A',
  'A#',
  'Bb',
  'B',
] as const;

/** 调名（含等音异名，共 17 个） */
export type KeyName = (typeof KEY_NAMES)[number];

/** 调名守卫：清洗层 / 文本导入 / 移调回写等「外部输入或派生结果落回类型域」的场合用 */
export const isKeyName = (value: unknown): value is KeyName =>
  typeof value === 'string' && (KEY_NAMES as readonly string[]).includes(value);

const ACCIDENTAL_PITCH = Object.freeze([false, true, false, true, false, false, true, false, true, false, true, false]);
// 自然字母（不含升降号），按 preferFlat 选择拼写对应的基础字母
const NATURAL_LETTER_SHARP = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
const NATURAL_LETTER_FLAT = ['C', 'D', 'D', 'E', 'E', 'F', 'G', 'G', 'A', 'A', 'B', 'B'];

/** 判断弦是否为静音态（品位为 MUTED_FRET）。 */
export const isMuted = (s: GuitarStringEntity) => s.fret === MUTED_FRET;
/** 判断弦是否为空弦态（品位 0）。 */
export const isOpen = (s: GuitarStringEntity) => s.fret === 0;
/** 创建默认琴弦实体：{ fret: MUTED_FRET（静音）, preferFlat: false（升号偏好） } */
export const createString = (): GuitarStringEntity => ({ fret: MUTED_FRET, preferFlat: false });

/** 标准调性乐理与五度圈中各半音音级的默认降号偏好（3: Eb, 8: Ab, 10: Bb 默认降号；1: C#, 6: F# 默认升号）。
 *
 *  拼写方向必须与另外三处一致，否则同一音级在不同入口显示成不同音名：
 *  - `KEY_OPTIONS`（本文件）用 `Ab`；
 *  - `chordEngine.getPreferredRootLabel` 在非小调根音上给 `Ab`；
 *  - `transposeRootSegment` 的升降号规则也把音级 8 归到降号侧。
 *  音级 8 此前是本表唯一的例外（标为 `G#`），已按上述三处收敛为 `Ab`。 */
export const DEFAULT_PITCH_PREFER_FLAT = Object.freeze([
  false, // 0: C
  false, // 1: C#
  false, // 2: D
  true, // 3: Eb
  false, // 4: E
  false, // 5: F
  false, // 6: F#
  false, // 7: G
  true, // 8: Ab
  false, // 9: A
  true, // 10: Bb
  false, // 11: B
] as const);

/** 根据音级索引（0~11）获取默认升降号偏好（true 为降号，false 为升号） */
export const getDefaultPreferFlatForPitch = (pitchIndex: number): boolean =>
  DEFAULT_PITCH_PREFER_FLAT[((pitchIndex % 12) + 12) % 12] ?? false;

/** 计算某弦的音名（自然字母，不含升降号）与是否为变化音级（黑键）。由 pitch + preferFlat 派生。 */
export const computeStringLabelAccidental = (
  sIdx: number,
  fretVal: number,
  fretOffset: number = 0,
  preferFlat: boolean = false,
  baseStrings: readonly number[] = DEFAULT_TUNING_MAPPING
): { label: string; isAccidental: boolean } => {
  if (fretVal < 0) return { label: '', isAccidental: false };
  const pitchIndex = calcPitchIndex(sIdx, fretVal, fretOffset, baseStrings);
  const isAccidental = isAccidentalNote(pitchIndex);
  const label = (preferFlat ? NATURAL_LETTER_FLAT : NATURAL_LETTER_SHARP)[pitchIndex] ?? '';
  return { label, isAccidental };
};

/** 格式化某弦的完整音名（如 "C#" / "Bb"）。fret < 0 时返回 ✕。由 pitch 实时派生，不依赖存储字段 */
export const formatStringLabel = (
  sIdx: number,
  fretVal: number,
  preferFlat: boolean = false,
  fretOffset: number = 0,
  baseStrings: readonly number[] = DEFAULT_TUNING_MAPPING
): string => {
  if (fretVal < 0) return '✕';
  const { label, isAccidental } = computeStringLabelAccidental(sIdx, fretVal, fretOffset, preferFlat, baseStrings);
  return composeNoteLabel(label, isAccidental, preferFlat);
};

/** 组装显示用音名：label + isAccidental + preferFlat 拼装（使用 #/b） */
export const composeNoteLabel = (label: string, isAccidental: boolean, preferFlat: boolean): string =>
  isAccidental ? label + (preferFlat ? 'b' : '#') : label;

/** 计算某弦某品的 MIDI 音高（空弦基准音 + 品位 + 把位偏移）。 */
export const calcNoteMidi = (
  sIdx: number,
  fretVal: number,
  fretOffset: number = 0,
  baseStrings: readonly number[] = DEFAULT_TUNING_MAPPING
): number => {
  const base = baseStrings[sIdx] ?? 0;
  const actualOffset = fretVal > 0 && fretOffset > 0 ? fretOffset : 0;
  return base + fretVal + actualOffset;
};

/** 由 MIDI 音高取模得到 0~11 的音级索引（八度无关）。 */
export const calcPitchIndex = (
  sIdx: number,
  fretVal: number,
  fretOffset: number = 0,
  baseStrings: readonly number[] = DEFAULT_TUNING_MAPPING
): number => calcNoteMidi(sIdx, fretVal, fretOffset, baseStrings) % 12;

/** 判断音级是否为变化音（黑键，存在升降号拼写）。 */
export const isAccidentalNote = (pitchIndex: number): boolean =>
  ACCIDENTAL_PITCH[((pitchIndex % 12) + 12) % 12] ?? false;

/** 判断某弦某品是否可切换升降号拼写（仅变化音级可切换，静音弦除外）。 */
export const canTogglePitchAccidental = (
  sIdx: number,
  fretVal: number,
  fretOffset: number = 0,
  baseStrings: readonly number[] = DEFAULT_TUNING_MAPPING
): boolean => {
  if (fretVal < 0) return false;
  const pitchIndex = calcPitchIndex(sIdx, fretVal, fretOffset, baseStrings);
  return isAccidentalNote(pitchIndex);
};
