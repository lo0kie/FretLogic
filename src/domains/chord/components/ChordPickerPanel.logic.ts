/**
 * ChordPickerPanel 纯逻辑模块：和弦根音类别解析（带实例缓存）与按根音分区构建。
 * 与 store / DOM 状态解耦，便于独立测试与复用。
 */
import { getChordName, parseChordName, resolveChordRootPitch } from '@/domains/chord/theory/theory';

import type { Chord } from '@/domains/chord/types';

/** 分区化的和弦集合：同一根音类别的和弦归入一段 */
export interface ChordPickerSection {
  id: string;
  title: string;
  chords: Chord[];
}

const rootCategoryCache = new WeakMap<Chord, { key: string; label: string }>();

/** 按根音音高反推根音类别（名称缺失时的兜底路径） */
const resolveRootPitchCategory = (chord: Chord): { key: string; label: string } => {
  const rootPitch = resolveChordRootPitch(chord.strings, chord.fretOffset, chord.tuning, chord, chord.rootStringIndex);
  if (rootPitch >= 0 && rootPitch < 12) {
    const SHARP_KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const SHARP_LABELS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
    return { key: SHARP_KEYS[rootPitch] ?? 'OTHER', label: SHARP_LABELS[rootPitch] ?? '其他' };
  }
  return { key: 'OTHER', label: '其他' };
};

/**
 * 解析和弦根音类别：优先取名称段的根音，其次解析和弦名，最后按根音音高反推；
 * key 用 ASCII（分区 id 与排序），label 用 ♯/♭ 展示。结果按和弦实例缓存
 */
export const getChordRootCategory = (chord: Chord): { key: string; label: string } => {
  const cached = rootCategoryCache.get(chord);
  if (cached) return cached;

  let result: { key: string; label: string };
  if (chord.nameSegments?.root) {
    const [letter, acc] = chord.nameSegments.root;
    const accAscii = acc === 1 ? '#' : acc === -1 ? 'b' : '';
    const accUnicode = acc === 1 ? '♯' : acc === -1 ? '♭' : '';
    result = { key: `${letter}${accAscii}`, label: `${letter}${accUnicode}` };
  } else {
    const name = getChordName(chord).trim();
    if (name) {
      const parsed = parseChordName(name);
      if (parsed.rootLabel) {
        const natural = parsed.rootLabel[0] || '';
        const accChar = parsed.rootLabel.slice(1);
        const accAscii = accChar === '#' || accChar === '♯' ? '#' : accChar === 'b' || accChar === '♭' ? 'b' : '';
        const accUnicode = accAscii === '#' ? '♯' : accAscii === 'b' ? '♭' : '';
        result = { key: `${natural}${accAscii}`, label: `${natural}${accUnicode}` };
      } else {
        result = resolveRootPitchCategory(chord);
      }
    } else {
      result = resolveRootPitchCategory(chord);
    }
  }

  rootCategoryCache.set(chord, result);
  return result;
};

/** 按根音类别把和弦列表分区（保持首次出现顺序） */
export const buildChordSections = (chords: Chord[]): ChordPickerSection[] => {
  if (chords.length === 0) return [];

  const sectionMap = new Map<string, ChordPickerSection>();
  const orderedKeys: string[] = [];

  for (const chord of chords) {
    const rootInfo = getChordRootCategory(chord);
    let sec = sectionMap.get(rootInfo.key);
    if (!sec) {
      sec = {
        id: rootInfo.key,
        title: rootInfo.label,
        chords: [],
      };
      sectionMap.set(rootInfo.key, sec);
      orderedKeys.push(rootInfo.key);
    }
    sec.chords.push(chord);
  }

  return orderedKeys.map(k => sectionMap.get(k)!);
};
