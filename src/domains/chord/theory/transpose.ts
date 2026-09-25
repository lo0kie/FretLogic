/**
 * 和弦移调：整体移调、根音分片移调、分片结构移调、实体移调。
 *
 * 从 theory.ts 抽出（原 1214~1234、1274~1367 行）。
 * 共享符号 NOTES_SHARP / NOTES_FLAT 来自 theory.shared；解析依赖来自 chordName；
 * 升降号取法（`getDefaultPreferFlatForPitch`）来自 pitch，避免本文件再抄一份「哪些音级用降号」。
 */

import { getChordRootPitch, parseChordName, parsePitchSegment, ROOT_PITCH_MAP } from './chordName';
import { getDefaultPreferFlatForPitch } from './pitch';
import { NOTES_FLAT, NOTES_SHARP } from './theory.shared';

import type { Chord, ChordId, ChordNameSegments, ExtensionSegment, GroupId, RootSegment } from '@/domains/chord/types';
import type { BarreEntity } from '@/domains/fretboard/types';

/**
 * 目标音级的音名拼写：优先沿用原写法的升降号（`Eb` 移调后仍在降号侧、`F#` 仍在升号侧），
 * 原写法不带升降号时按 `getDefaultPreferFlatForPitch` 的记谱习惯定（3 / 8 / 10 用降号）。
 *
 * 原先这里恒用 `NOTES_SHARP`，于是「原样移调 0 个半音」也会改写音名：`Eb` → `D#`、`Ab` → `G#`。
 * 调名（`computeSongKey`）与歌内和弦名都走这条路径，变形会直接露在界面上。
 */
const spellPitch = (pitch: number, sourceLabel: string): string => {
  const useFlat = sourceLabel.includes('b') || (!sourceLabel.includes('#') && getDefaultPreferFlatForPitch(pitch));
  return (useFlat ? NOTES_FLAT : NOTES_SHARP)[pitch] ?? 'C';
};

/** 将和弦名整体移调：根音与斜杠低音按半音数移位，后缀保持不变；无法解析时原样返回。 */
export const transposeChordName = (chordName: string, semitones: number): string => {
  const parsed = parseChordName(chordName);
  if (parsed.rootPitch === 99) return chordName;
  const shiftedRoot = spellPitch((parsed.rootPitch + semitones + 120) % 12, parsed.rootLabel);
  if (parsed.hasBass && parsed.bassPitch !== 99) {
    const shiftedBass = spellPitch((parsed.bassPitch + semitones + 120) % 12, parsed.bassLabel);
    return `${shiftedRoot}${parsed.suffix}/${shiftedBass}`;
  }
  return `${shiftedRoot}${parsed.suffix}`;
};

/** 计算两个调名之间的半音差，结果收敛到 [-5, 6] 区间（取最短移调路径）；无法解析时返回 0。 */
export const getKeySemitones = (key1: string, key2: string): number => {
  const p1 = getChordRootPitch(key1);
  const p2 = getChordRootPitch(key2);
  if (p1 === 99 || p2 === 99) return 0;
  let diff = p2 - p1;
  if (diff > 6) diff -= 12;
  if (diff < -5) diff += 12;
  return diff;
};

/** 音高半音移调运算：保证结果收敛在 [0, 11] */
export const transposePitch = (pitch: number, semitones: number): number => (((pitch + semitones) % 12) + 12) % 12;

/**
 * 结构化根音分片（[NaturalPitchLetter, AccidentalType]）按半音数移调
 * @param root 原始根音分片
 * @param semitones 移调半音数（正数为升，负数为降）
 * @param preferFlat 是否偏好降号（缺省时根据原始变音记号与目标音名智能判定）
 */
export const transposeRootSegment = (root: RootSegment, semitones: number, preferFlat?: boolean): RootSegment => {
  const [letter, acc] = root;
  const basePitch = ROOT_PITCH_MAP[letter] ?? 0;
  const currentPitch = (basePitch + acc + 12) % 12;
  const newPitch = transposePitch(currentPitch, semitones);

  // 升降号取法：原写法带降号即续用降号；不带升降号时按记谱习惯（3 / 8 / 10 用降号）——
  // 与 `getDefaultPreferFlatForPitch` 同源，不再在本处另写一份 3/8/10 裸值判断
  const useFlat = preferFlat ?? (acc < 0 || (acc === 0 && getDefaultPreferFlatForPitch(newPitch)));
  const noteName = useFlat ? NOTES_FLAT[newPitch] : NOTES_SHARP[newPitch];
  const parsed = parsePitchSegment(noteName ?? 'C');
  return parsed ?? ['C', 0];
};

/**
 * 将和弦名分片结构整体移调（根音与斜杠低音同步移位，其余性质/扩展分片深度复制保留）
 */
export const transposeChordSegments = (
  segments: ChordNameSegments,
  semitones: number,
  preferFlat?: boolean
): ChordNameSegments => {
  const newRoot = transposeRootSegment(segments.root, semitones, preferFlat);
  const newBass = segments.bass ? transposeRootSegment(segments.bass, semitones, preferFlat) : undefined;
  return {
    root: newRoot,
    ...(segments.quality ? { quality: segments.quality } : {}),
    ...(segments.unknownQuality ? { unknownQuality: segments.unknownQuality } : {}),
    // ExtensionSegment 是元组 [degree, accidental?]，必须逐位按元组复制。
    // 曾误用 { ...e } 做「深拷贝」—— 数组摊成 {0, 1} 普通对象后不再是元组，
    // 下游所有 ([deg, acc]) => 解构（segmentsToString / vChordName / areChordsEnharmonicallyEquivalent）
    // 一律抛 "is not iterable"，且实体已入库，后续取名/指纹/渲染会连续崩。
    ...(segments.extensions ? { extensions: segments.extensions.map(e => [e[0], e[1]] as ExtensionSegment) } : {}),
    ...(newBass ? { bass: newBass } : {}),
  };
};

/**
 * 和弦实体移调
 * 模式 'update_name'（默认）：指法品位不变，更新和弦名与根音音高（适合吉他夹变调夹或保持把位分析）
 * 模式 'shift_frets'：非空弦品位整体平移 N 品（横按同步平移），适合封闭和弦把位推移
 */
export const transposeChordEntity = (
  chord: Chord,
  semitones: number,
  options?: {
    mode?: 'shift_frets' | 'update_name';
    preferFlat?: boolean;
    newId?: ChordId;
    newGroupId?: GroupId;
  }
): Chord => {
  const mode = options?.mode ?? 'update_name';
  const newSegments = chord.nameSegments
    ? transposeChordSegments(chord.nameSegments, semitones, options?.preferFlat)
    : null;

  let newStrings = chord.strings.map(s => ({ ...s }));
  let newBarres = chord.barres ? chord.barres.map(b => ({ ...b })) : undefined;

  if (mode === 'shift_frets' && semitones !== 0) {
    newStrings = newStrings.map(s => {
      if (s.fret <= 0) return s;
      const shifted = s.fret + semitones;
      // 越界一律静音，**不钳制到 fretCount**：`strings[].fret` 是窗口内相对品位，绝对品位由
      // `fretOffset + fret` 给出（见 fretWindow 的契约）。钳回 fretCount 只压住了相对品号，
      // 绝对品位并没有跟着变 —— 结果是「和弦名已按 N 个半音升了、实际音高却没升」的自相矛盾，
      // 且多根弦一起越界时会**全部塌到同一品**（两个不同的音变成一个）。
      // 与清洗层的口径一致：越界品位统一静音（见 chordRepository 的 boundFret 说明）。
      return { fret: shifted > 0 && shifted <= chord.fretCount ? shifted : -1, preferFlat: s.preferFlat };
    });
    if (newBarres)
      newBarres = newBarres
        // 与弦同口径：越出窗口的横按梁直接丢弃，不再钳到 fretCount（钳完会横在错误的品上）
        .map(b => ({ ...b, fret: (b.fret + semitones) as BarreEntity['fret'] }))
        .filter(b => b.fret > 0 && b.fret <= chord.fretCount);
  }

  const now = Date.now();
  return {
    ...chord,
    id: options?.newId ?? chord.id,
    groupId: options?.newGroupId ?? chord.groupId,
    nameSegments: newSegments,
    strings: newStrings,
    barres: newBarres,
    createdAt: now,
    updatedAt: now,
  };
};
