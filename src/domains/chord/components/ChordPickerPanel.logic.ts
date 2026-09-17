/**
 * ChordPickerPanel 纯逻辑模块：和弦根音类别解析（带实例缓存）与按根音分区构建。
 * 与 store / DOM 状态解耦，便于独立测试与复用。
 */
import { getChordName, parseChordName, resolveChordRootPitch } from '@/domains/chord/theory/theory';
import { computeFretboardLayout } from '@/domains/fretboard/components/renderFretboardCanvas';
import { DEFAULT_FRET_COUNT, MIN_FRET_COUNT } from '@/domains/fretboard/constants';
import { buildRowPlans } from '@/platform/composables/useRowWindowing';

import type { Chord } from '@/domains/chord/types';
import type { VirtualSectionPlan } from '@/platform/composables/useRowWindowing';

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

/* ---- 虚拟化行规划 ----
   选择器面板的卡片挂载是大头（卡片壳 + ActionButton + FretboardCanvas 的整套 setup，
   实测 ~0.8ms/张，775 卡全量挂载单帧 ~600ms）。行窗口化后只挂视口附近的卡片；
   窗口化的前提是「没挂载的行也必须知道确切高度」——否则滚动条与行位置会跳。
   行切分 / 二分查找 / 滚动窗口等通用机制见 platform/composables/useRowWindowing，
   本文件只负责域内几何：由 品数 × 弦数 × 缩放 纯几何推出每张卡的高度。
   卡片高度全部可由纯几何推出（布局函数 + 卡片内边距常量），与 FretboardCanvas 的
   cssHeight 同公式，占位与实绘逐像素一致。 */

/**
 * 卡片除指板画布外的高度（px）：pt-4(1rem) + pb-2(0.5rem) + 上下边框(2px)。
 * 模板间距类都是 rem，而应用根字号是流式的（不恒为 16px），故运行时读取，不能写死。
 */
export const getPickerCardChromePx = (): number => {
  const root =
    typeof document !== 'undefined' ? parseFloat(getComputedStyle(document.documentElement).fontSize) || 16 : 16;
  return 1.5 * root + 2;
};

/** 网格行间距（gap-md = 0.75rem，同样随根字号缩放） */
export const getPickerGridGapPx = (): number => {
  const root =
    typeof document !== 'undefined' ? parseFloat(getComputedStyle(document.documentElement).fontSize) || 16 : 16;
  return 0.75 * root;
};

const canvasCssHeightCache = new Map<string, number>();

/**
 * 卡片内指板画布的 CSS 高度（px）。
 * 与 FretboardCanvas 的 cssHeight 完全同公式：layout.height − nameReserveH 再乘 scale；
 * picker 固定显示和弦名（showChordName 默认 true），布局只随 品数 × 弦数 变化，按其缓存。
 */
export const getPickerCanvasCssHeight = (chord: Chord, scale: number): number => {
  const fretCount = Math.max(MIN_FRET_COUNT, chord.fretCount || DEFAULT_FRET_COUNT);
  const stringCount = chord.strings?.length || 6;
  const key = `${stringCount}x${fretCount}x${scale}`;
  let h = canvasCssHeightCache.get(key);
  if (h === undefined) {
    const layout = computeFretboardLayout({ stringCount, fretCount });
    h = Math.round((layout.height - layout.nameReserveH) * scale);
    canvasCssHeightCache.set(key, h);
  }
  return h;
};

/** 卡片总高（px） */
export const getPickerCardHeight = (chord: Chord, scale: number): number =>
  getPickerCanvasCssHeight(chord, scale) + getPickerCardChromePx();

/** 把分区集合按通用行规划切分：行高取行内最高卡片，行 top 逐行累加（含 gap） */
export const buildPickerRowPlan = (
  sections: ChordPickerSection[],
  cols: number,
  scale: number
): VirtualSectionPlan<Chord>[] => {
  // 根字号读数在单次规划内取一次：getComputedStyle 有强制样式解析成本，不能每行调
  const chromePx = getPickerCardChromePx();
  const gapPx = getPickerGridGapPx();
  return buildRowPlans(
    sections.map(section => section.chords),
    cols,
    gapPx,
    chord => getPickerCanvasCssHeight(chord, scale) + chromePx
  );
};
