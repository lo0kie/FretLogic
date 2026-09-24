/**
 * ChordPickerPanel 纯逻辑模块：和弦根音类别解析（带实例缓存）与按根音分区构建。
 * 与 store / DOM 状态解耦，便于独立测试与复用。
 */
import { getChordName, parseChordName, resolveChordRootPitch } from '@/domains/chord/theory/theory';
import { clampDrawFretCount } from '@/domains/fretboard/constants';
import { baseGeometryFor } from '@/domains/fretboard/model/fretboardGeometry';
import { isZeroFretWindow } from '@/domains/fretboard/model/fretGeometry';
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
      } else result = resolveRootPitchCategory(chord);
    } else result = resolveRootPitchCategory(chord);
  }

  rootCategoryCache.set(chord, result);
  return result;
};

/**
 * 取和弦标准全称（供卡片无障碍标签等展示用途），按和弦实例缓存。
 *
 * 面板此前为整屏构建 `id → 名称` 映射：每次键入（filteredChords 变化）都要为**全库**每个和弦
 * 拼一次名称，而唯一消费方只是当前挂载的那十几张卡片的 aria-label —— 775 条里七百多条白算。
 * 改为按需调用 + 引用级缓存后，开销随「真正渲染出来的卡片数」而非库容量增长。
 * 前提与同文件的 getChordRootCategory 一致：保存路径总是整对象替换，按引用缓存不会读到过期名称。
 */
const chordNameCache = new WeakMap<Chord, string>();
export const getPickerChordName = (chord: Chord): string => {
  const cached = chordNameCache.get(chord);
  if (cached !== undefined) return cached;
  const name = getChordName(chord);
  chordNameCache.set(chord, name);
  return name;
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
   本文件只负责域内几何：卡片高度 = 指板图高 × 缩放 + 卡片自身的 chrome。
   指板图高由 fretboard 的几何工厂给出（`FretboardGeometry.sizeOf`，自带容量 8 的缓存）——
   与 FretboardCanvas 的 cssHeight 同源，占位与实绘逐像素一致。 */

/**
 * 卡片除指板画布外的高度（px）：p-2 上下合计(1rem) + 上下边框(2px)。
 * 模板间距类都是 rem，而应用根字号是流式的（不恒为 16px），故运行时读取，不能写死。
 * 卡片留白是**四边等宽**的（模板 p-2），这里只取纵向合计 —— 与模板必须同步改。
 */
export const getPickerCardChromePx = (): number => {
  const root =
    typeof document !== 'undefined' ? parseFloat(getComputedStyle(document.documentElement).fontSize) || 16 : 16;

  return root + 2;
};

/** 网格行间距（gap-md = 0.75rem，同样随根字号缩放） */
export const getPickerGridGapPx = (): number => {
  const root =
    typeof document !== 'undefined' ? parseFloat(getComputedStyle(document.documentElement).fontSize) || 16 : 16;
  return 0.75 * root;
};

/**
 * 卡片内指板画布的 CSS 高度（px）。
 * 与 FretboardCanvas 的 cssHeight 同源：几何由指板工厂的 `sizeOf` 给出（隐藏的元素不占位），
 * picker 固定显示和弦名与空弦标记，故随 弦数 × 品数 × **是否画加粗弦枕** 变化
 * （弦枕画了才占位，偏移品窗那张图少一条弦枕 —— 判据见 nutIsDrawn）；结果缓存由工厂内部承担（容量 8）。
 * 这里只取 `height`：卡片宽度由网格列宽决定（画布按自身宽度居中），行高才是占位需要的那个量。
 */
export const getPickerCanvasCssHeight = (chord: Chord, scale: number): number =>
  Math.round(
    baseGeometryFor(isZeroFretWindow(chord.fretOffset ?? 0)).sizeOf({
      stringCount: chord.strings?.length || 6,
      fretCount: clampDrawFretCount(chord.fretCount),
    }).height * scale
  );

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
