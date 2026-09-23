/**
 * 斜杠低音一致性校验、调弦空弦基准、和弦指纹。
 *
 * 从 theory.ts 抽出（原 938~956、1236、1242~1271 行）。
 * getColorNoteCountAndPitches / getComplexityRank 属 chordSort 模块（被 buildSortMeta 使用）。
 */

import { getChordName, parseChordName } from './chordName';
import { collectChordNotes, computeIsInverted } from './chordSearch';
import { DEFAULT_TUNING_MAPPING, getBaseStringsFor, Tuning, TUNING_PRESETS } from './tuning';

import type { ChordNameSegments } from '@/domains/chord/types';
import type { GuitarStringEntity, GuitarStringsModel } from '@/domains/fretboard/types';

/**
 * 指纹缓存：键为对象引用，值额外存一份**廉价输入签名**。
 *
 * 为什么不能只按引用缓存：指纹按对象引用记忆时，任何「就地改写同一个和弦对象」的调用方
 * 都会读到被钉死的旧指纹。草稿正是这种对象——useChordDraftEditing（strings[i] / fretOffset /
 * nameSegments / rootStringIndex）、ChordAnalysisPanel（rootStringIndex / nameSegments）与
 * editorStore.setBarres 全部原地改同一个 draftChord；而 WorkbenchVariantsPanel 的
 * isActiveVariant 会在渲染期提前求值、把旧指纹钉住，随后 useWorkbenchRouteSync 的 isDraftDirty
 * 读到陈旧值 ⇒ 脏草稿被判成干净，URL 回灌直接覆盖未保存编辑。
 * 故读缓存前先用同一批输入重算一次签名核对：签名只覆盖「便宜可取」的那部分输入，
 * 真正昂贵的 computeIsInverted 仍然走缓存。
 */
interface ChordFingerprintCacheEntry {
  sig: string;
  fp: string;
}

const chordFingerprintCache = new WeakMap<object, ChordFingerprintCacheEntry>();

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

/**
 * 计算和弦指纹（名称:品位偏移:品位数:调弦:是否转位:根音标记:逐弦品位+升降偏好），
 * 用于重复和弦判定；结果按对象引用 WeakMap 缓存，读前用输入签名核对是否已被就地改写
 * （见 chordFingerprintCache 的说明）。
 */
export const computeChordFingerprint = (chord: {
  chordName?: string;
  nameSegments?: ChordNameSegments | null;
  fretOffset?: number;
  fretCount: number;
  tuning: Tuning | string;
  strings: GuitarStringsModel;
  rootStringIndex: number | null;
}): string => {
  const offset = chord.fretOffset ?? 0;
  const name = getChordName(chord).trim();
  const strSig = chord.strings.map(s => `${s.fret}_${s.preferFlat ? 1 : 0}`).join('|');
  // 签名覆盖 computeIsInverted 的全部入参（strings 逐弦 + fretOffset + tuning + 名称 +
  // rootStringIndex），故签名一致即可安全复用上次算出的 isInverted
  const sig = `${name}:${offset}:${chord.fretCount}:${chord.tuning}:${String(chord.rootStringIndex)}:${strSig}`;

  if (chord && typeof chord === 'object') {
    const cached = chordFingerprintCache.get(chord);
    if (cached !== undefined && cached.sig === sig) return cached.fp;
  }

  const isInverted = computeIsInverted(chord.strings, offset, chord.tuning, chord, chord.rootStringIndex);
  const fp = `${name}:${offset}:${chord.fretCount}:${chord.tuning}:${isInverted ? 1 : 0}:${String(chord.rootStringIndex)}:${strSig}`;
  if (chord && typeof chord === 'object') chordFingerprintCache.set(chord, { sig, fp });

  return fp;
};
