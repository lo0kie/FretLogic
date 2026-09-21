/**
 * 和弦移调：整体移调、根音分片移调、分片结构移调、实体移调。
 *
 * 从 theory.ts 抽出（原 1214~1234、1274~1367 行）。
 * 共享符号 NOTES_SHARP / NOTES_FLAT 来自 theory.shared；解析依赖来自 chordName。
 */

import { getChordRootPitch, parseChordName, parsePitchSegment, ROOT_PITCH_MAP } from './chordName';
import { NOTES_FLAT, NOTES_SHARP } from './theory.shared';

import type { Chord, ChordId, ChordNameSegments, ExtensionSegment, GroupId, RootSegment } from '@/domains/chord/types';
import type { BarreEntity } from '@/domains/fretboard/types';

/** 将和弦名整体移调：根音与斜杠低音按半音数移位，后缀保持不变；无法解析时原样返回。 */
export const transposeChordName = (chordName: string, semitones: number): string => {
  const parsed = parseChordName(chordName);
  if (parsed.rootPitch === 99) return chordName;
  const shiftedRoot = NOTES_SHARP[(parsed.rootPitch + semitones + 120) % 12];
  if (parsed.hasBass && parsed.bassPitch !== 99) {
    const shiftedBass = NOTES_SHARP[(parsed.bassPitch + semitones + 120) % 12];
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

  const useFlat = preferFlat ?? (acc < 0 || (acc === 0 && (newPitch === 10 || newPitch === 3 || newPitch === 8)));
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
      // 上界钳制到 fretCount（越界不静音丢弦，保持可听）；下界仍按惯例静音
      return { fret: shifted > 0 ? Math.min(shifted, chord.fretCount) : -1, preferFlat: s.preferFlat };
    });
    if (newBarres)
      newBarres = newBarres
        // 与上方弦处理同口径：上界钳到 fretCount，避免移调后横按越出可视品位窗口
        .map(b => ({ ...b, fret: Math.min(b.fret + semitones, chord.fretCount) as BarreEntity['fret'] }))
        .filter(b => b.fret > 0);
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
