import { globalDarkMode } from '@/stores/globalState';
import type { Chord, SlotKey } from '@/types';
import { computeChordFingerprint } from '@/utils/music/musicTheory';
import { plainToChordMap } from '@/utils/score/chordSlots';
import { charKey, chordSlotKey, collectEdgeChordIds } from '@/utils/score/scoreModel';
import type { Options } from 'html-to-image/lib/types';

// ===== scoreLines: 谱面行数据与缓存 =====

export interface EdgeChordItem {
  slotKey: SlotKey;
  chord: Chord;
}

export interface CharItem {
  char: string;
  slotKey: SlotKey;
}

export interface LineData {
  lineIdx: number;
  lineId: string;
  chars: CharItem[];
  startChords: EdgeChordItem[];
  endChords: EdgeChordItem[];
  nextStartKey: SlotKey;
  nextEndKey: SlotKey;
}

const prevCharsByLineId = new Map<string, { text: string; chars: CharItem[] }>();
const prevEdgeChordsCache = new Map<string, { sig: string; chords: EdgeChordItem[] }>();

/** 读取某行某侧的边和弦（含缓存）：签名含和弦内容，和弦编辑后能正确失效缓存；同时给出下一个可用槽位键。 */
function getEdgeChordsWithNextKey(
  chordMap: Map<string, string>,
  lineId: string,
  type: 'start' | 'end',
  chordsLookupMap: Map<string, Chord>
) {
  const ids = collectEdgeChordIds(chordMap, lineId, type);
  // 签名必须包含和弦内容（指纹 + barres），否则编辑同一 id 的和弦后缓存命中旧对象，乐谱行首/行尾不刷新
  const sig = ids
    .map((id, idx) => {
      const chord = chordsLookupMap.get(id);
      const contentSig = chord ? `${computeChordFingerprint(chord)}:${JSON.stringify(chord.barres ?? null)}` : '-';
      return `${idx}:${id}:${contentSig}|`;
    })
    .join('');
  const cacheKey = `${lineId}_${type}`;
  const cached = prevEdgeChordsCache.get(cacheKey);
  if (cached && cached.sig === sig) {
    return { chords: cached.chords, nextKey: chordSlotKey(lineId, type, ids.length) };
  }

  const chords: EdgeChordItem[] = [];
  ids.forEach((chordId, idx) => {
    const foundChord = chordsLookupMap.get(chordId);
    if (foundChord) {
      chords.push({ slotKey: chordSlotKey(lineId, type, idx), chord: foundChord });
    }
  });
  prevEdgeChordsCache.set(cacheKey, { sig, chords });
  return { chords, nextKey: chordSlotKey(lineId, type, ids.length) };
}

/** 构建一行歌词的字符槽位序列，行文本未变化时复用缓存。 */
function buildChars(lineId: string, lineText: string): CharItem[] {
  const cached = prevCharsByLineId.get(lineId);
  if (cached && cached.text === lineText) {
    return cached.chars;
  }
  const chars = lineText.split('').map((char, charIdx) => ({
    char,
    slotKey: charKey(lineId, charIdx),
  }));
  prevCharsByLineId.set(lineId, { text: lineText, chars });
  return chars;
}

/** 构建乐谱行数据（歌词字符 + 行首/行尾和弦），并清理已消失行的缓存条目。 */
export function buildLyricsLinesWithEdges(
  lyrics: string,
  chordMap: Map<string, string>,
  chordsLookupMap: Map<string, Chord>,
  existingLineIds: string[] = []
): LineData[] {
  // 序列化边界守卫：内存契约要求 chordMap 为 Map；若从持久化/同步链路拿到普通对象，
  // 在此归一化为 Map，避免 collectEdgeChordIds 迭代直接抛错。纯等价转换，不改语义。
  const normalizedChordMap = chordMap instanceof Map ? chordMap : plainToChordMap(chordMap);
  const rawLines = lyrics.split('\n');
  const activeIds = new Set<string>();
  const result = rawLines.map((lineText, lineIdx) => {
    const lineId = existingLineIds[lineIdx] || String(lineIdx);
    activeIds.add(lineId);
    const { chords: startChords, nextKey: nextStartKey } = getEdgeChordsWithNextKey(
      normalizedChordMap,
      lineId,
      'start',
      chordsLookupMap
    );
    const { chords: endChords, nextKey: nextEndKey } = getEdgeChordsWithNextKey(
      normalizedChordMap,
      lineId,
      'end',
      chordsLookupMap
    );
    return {
      lineIdx,
      lineId,
      chars: buildChars(lineId, lineText),
      startChords,
      endChords,
      nextStartKey,
      nextEndKey,
    };
  });
  for (const id of prevCharsByLineId.keys()) {
    if (!activeIds.has(id)) {
      prevCharsByLineId.delete(id);
      prevEdgeChordsCache.delete(`${id}_start`);
      prevEdgeChordsCache.delete(`${id}_end`);
    }
  }
  return result;
}

/** 清空歌词行字符与边和弦的全部缓存（和弦库整体替换等场景调用）。 */
export function clearLyricsLineCharsCache() {
  prevCharsByLineId.clear();
  prevEdgeChordsCache.clear();
}

// ===== paginateLines: A4 分页 =====

export interface PageChunk {
  lineIndices: number[];
  isFirstPage: boolean;
}

/**
 * 按每行的（缩放后）高度，贪心地把选中的行分配到若干个 A4 页面里。
 * capacityPx：每页内容区可用高度（已扣掉首页的歌名信息栏高度）
 */
export function paginateLinesByHeight(
  sortedIndices: number[],
  lineHeights: Map<number, number>,
  firstPageCapacityPx: number,
  restPageCapacityPx: number
): PageChunk[] {
  const pages: PageChunk[] = [];
  let current: number[] = [];
  let currentHeight = 0;
  let isFirst = true;

  for (const idx of sortedIndices) {
    const h = lineHeights.get(idx) ?? 0;
    const capacity = isFirst ? firstPageCapacityPx : restPageCapacityPx;
    // 单行就超页高的极端情况：单独成页，避免死循环
    if (currentHeight > 0 && currentHeight + h > capacity) {
      pages.push({ lineIndices: current, isFirstPage: isFirst });
      current = [];
      currentHeight = 0;
      isFirst = false;
    }
    current.push(idx);
    currentHeight += h;
  }
  if (current.length > 0) {
    pages.push({ lineIndices: current, isFirstPage: isFirst });
  }
  return pages;
}

// ===== domExporter: DOM → 图片导出 =====

export interface ExportOptions {
  width?: number;
  height?: number;
  backgroundColor?: string;
  isTransparent?: boolean;
  style?: Record<string, string>;
  filter?: (node: Node) => boolean;
  pixelRatio?: number;
}

/** 按导出元素面积选择画布像素比：超大面积降为 1.5，其余 2.5，避免超尺寸画布。 */
const getCanvasPixelRatio = (el: HTMLElement): number => {
  const area = el.scrollWidth * el.scrollHeight;
  if (area > 8_000_000) return 1.5;

  return 2.5;
};

/** 返回导出图的默认背景色（跟随当前明暗主题）。 */
const getDOMBgColor = (): string => {
  const isDark = globalDarkMode.value;
  return isDark ? '#18181a' : '#f2f2f7';
};

/** 等待字体加载完成再渲染；超过 1.5s 超时放行，避免导出卡死。 */
const waitForFontsReady = async (): Promise<void> => {
  if (!document.fonts) return;
  await Promise.race([document.fonts.ready, new Promise<void>(resolve => setTimeout(resolve, 1500))]);
};

/** 组装 html-to-image 的渲染参数：处理透明背景、尺寸、像素比，并剥离阴影/边框等导出干扰样式。 */
const buildHtmlToImageOptions = (el: HTMLElement, exportOptions: ExportOptions): Options => {
  let defaultBgColor: string | undefined = getDOMBgColor();
  let defaultStyle: Record<string, string> = {};
  if (exportOptions.isTransparent) {
    defaultBgColor = undefined;
    defaultStyle = {
      backgroundColor: 'transparent',
      backgroundImage: 'none',
    };
  }
  const width = exportOptions.width;
  const height = exportOptions.height;
  const backgroundColor = exportOptions.backgroundColor ?? defaultBgColor;
  const filter = exportOptions.filter;
  return {
    quality: 0.95,
    pixelRatio: exportOptions.pixelRatio ?? getCanvasPixelRatio(el),
    cacheBust: false,
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(backgroundColor !== undefined ? { backgroundColor } : {}),
    style: {
      ...defaultStyle,
      ...exportOptions.style,
      transform: exportOptions.style?.['transform'] ?? 'none',
      borderRadius: '0',
      borderColor: 'transparent',
      borderWidth: '0',
      boxShadow: 'none',
      border: 'none',
    },
    ...(filter !== undefined ? { filter } : {}),
  };
};

/** 将 DOM 元素渲染为图片 Blob（html-to-image 按需动态加载，导出前等待字体就绪）。 */
export const renderElementToBlob = async (el: HTMLElement, exportOptions: ExportOptions = {}): Promise<Blob> => {
  const htmlToImage = await import('html-to-image');
  const finalOptions = buildHtmlToImageOptions(el, exportOptions);
  await waitForFontsReady();
  const blob = await htmlToImage.toBlob(el, finalOptions);
  if (!blob) {
    throw new Error('Blob 图片数据生成失败');
  }
  return blob;
};

/** 将 DOM 元素渲染为 Canvas（pdf 导出等需要位图后处理的场景）。 */
export const renderElementToCanvas = async (
  el: HTMLElement,
  exportOptions: ExportOptions = {}
): Promise<HTMLCanvasElement> => {
  const htmlToImage = await import('html-to-image');
  const finalOptions = buildHtmlToImageOptions(el, exportOptions);
  await waitForFontsReady();
  return htmlToImage.toCanvas(el, finalOptions);
};

/** Canvas 转 Blob 的 Promise 封装。 */
export const canvasToBlob = (canvas: HTMLCanvasElement, type = 'image/png', quality = 0.95): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Canvas 转 Blob 失败'))), type, quality);
  });

/** 复制图片 Blob 到剪贴板；环境不支持或页面失焦时抛错，写入时按 MIME 兼容性多级降级重试。 */
export const writeBlobToClipboard = async (blob: Blob): Promise<void> => {
  if (!navigator.clipboard || typeof navigator.clipboard.write !== 'function' || typeof ClipboardItem === 'undefined') {
    throw new Error('当前浏览器环境不支持复制图片到剪贴板');
  }
  if (!document.hasFocus()) {
    throw new Error('页面已失去焦点，请保持窗口激活后重新尝试');
  }
  const mimeType = blob.type || 'image/png';
  try {
    await navigator.clipboard.write([new ClipboardItem({ [mimeType]: blob })]);
  } catch {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    } catch {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': Promise.resolve(blob) })]);
    }
  }
};

/** 延时工具（默认 0ms），用于导出前等待一帧渲染。 */
export const wait = (ms = 0) => new Promise<void>(resolve => setTimeout(resolve, ms));
