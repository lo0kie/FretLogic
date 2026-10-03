/**
 * 音高 / 音名层：空弦基准音、MIDI 音高、音级索引、音名（含升降号）标签与格式化。
 *
 * 从 theory.ts 抽出（原 32~153 行，剔除仅 chordSort 使用的 `isChordToneRelative`）。
 * 另承接三份跨模块单源：12 半音音名表 NOTES_SHARP / NOTES_FLAT（原在 theory.shared，
 * transpose 经此取用）、升降号格式化 formatAccidental（原在 chordName）、
 * MIDI→频率换算（原在 app/services/audio）。
 */

import { MUTED_FRET } from '@/platform/types/instrument';

import { DEFAULT_TUNING_MAPPING } from './tuning';

import type { AccidentalType } from '@/domains/chord/types';
import type { GuitarStringEntity } from '@/platform/types/instrument';

/** 调性键名选项（升号调/降号调按常见记谱习惯混合）。`as const` 让下游拿到真实联合而非 `string` */
export const KEY_OPTIONS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

/**
 * 12 半音音名表（升号 / 降号拼写）：pitch 与 transpose 共用的唯一一份。
 *
 * 原先住在 theory.shared（跨模块私有枢纽），现归位本模块 —— 音名拼写本就是「音高 / 音名层」
 * 的内容，且 ChordPickerPanel 等展示侧也要按它取根音分区表。`as const` 让下游（如 dev 种子数据
 * 的调名字段）拿到字面量联合而不是 `string`。
 */
export const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

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
 *  这张表服务的是**弦上的音名标签**（`computeStringLabelAccidental` / `formatStringLabel`）。
 *  它与另外两处的对应关系：
 *  - `transposeRootSegment`：直接走 `getDefaultPreferFlatForPitch`，与本表同源（不再另写 3/8/10 裸值）。
 *  - `KEY_OPTIONS`（本文件）与 `chordEngine.getPreferredRootLabel`：音级 3 / 8 / 10 三处同侧
 *    （`Eb` / `Ab` / `Bb`）。音级 1 **刻意不同** —— 本表与 `KEY_OPTIONS` 标 `C#`，
 *    而 `getPreferredRootLabel` 的非小调根音取 `Db`（五度圈侧习惯）。同一个音级在
 *    「弦上标签」与「和弦根音名」两个语境下的习惯写法本就不同，**这不是漂移，不要去统一**。
 *  音级 8 此前是本表唯一的例外（标为 `G#`），已按上述几处收敛为 `Ab`。 */
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

/**
 * 格式化升降号：统一支持数字（1/-1）、字符（# / b / ♯ / ♭）输入。
 *
 * 升降号↔符号映射的唯一实现：chordName（分段渲染）、chordQualityAstParse（性质渲染）、
 * ChordPickerPanel（根音分区）此前各持一份等价拷贝，已全部收敛到此处。
 */
export const formatAccidental = (acc: AccidentalType | string | number | undefined, useUnicode = true): string => {
  if (acc === 1 || acc === '1' || acc === '#' || acc === '♯') return useUnicode ? '♯' : '#';
  if (acc === -1 || acc === '-1' || acc === 'b' || acc === '♭') return useUnicode ? '♭' : 'b';
  return '';
};

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
): number => {
  // 取模必须归一到 0~11：低音弦的基准音可能为负（贝斯预设向下补弦会得到负 MIDI），
  // 裸 `%` 会返回负音级（-4 % 12 === -4），下游按音级查表 / 判转位即整体错位。
  const midi = calcNoteMidi(sIdx, fretVal, fretOffset, baseStrings);
  return ((midi % 12) + 12) % 12;
};

/** 标准音 A4 频率（Hz）：MIDI→频率换算的基准（原 audio/constants.A4_FREQ 下沉至此） */
export const A4_FREQ = 440;
/** A4 的 MIDI 音符编号（原 audio/constants.A4_MIDI_NOTE 下沉至此） */
export const A4_MIDI_NOTE = 69;

/** MIDI 音符编号 → 频率（Hz）：十二平均律换算，以 A4 为基准（calcNoteMidi 的自然延伸） */
export const midiToFreq = (midiNote: number): number => A4_FREQ * 2 ** ((midiNote - A4_MIDI_NOTE) / 12);

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
