/**
 * Web Worker 离屏乐谱导出服务。
 * 将乐谱数据封装后发送至 Worker 独立线程，OffscreenCanvas 离屏绘制，主线程 0ms 阻塞。
 */
import { computeSongKey, getChordName } from '@/domains/chord/theory/theory';
import { resolveFretboardCanvasPalette } from '@/domains/fretboard/fretboardCanvasPalette';
import { DEFAULT_SCORE_TITLE, SCORE_EXPORT_CONFIG } from '@/domains/score/constants';
import { buildEdgeChordIndex, charKey } from '@/domains/score/model/scoreModel';

import type { Chord } from '@/domains/chord/types';
import type {
  ExportChordData,
  ExportLineItem,
  WorkerExportMessage,
  WorkerExportPayload,
} from '@/domains/score/preview/workers/scoreExportWorker';
import type { Song } from '@/domains/score/types';
import type { ScoreLyricsFontWeight } from '@/platform/types';

/** 将 Chord 模型转为 Worker 绘图所需的轻量指板实体（仅本文件内部使用） */
const extractExportChordData = (chord: Chord, shorthand = false): ExportChordData => ({
  chordName: getChordName(chord, { shorthand, useUnicode: true }),
  strings: chord.strings.map(s => [s[0], s[1]]),
  fretCount: chord.fretCount,
  fretOffset: chord.fretOffset,
  rootStringIndex: chord.rootStringIndex ?? null,
  barres: chord.barres?.map(b => ({
    fret: b.fret,
    fromString: b.fromString,
    toString: b.toString,
  })),
});

/** 将歌曲模型与选中行转换为 Worker 专用的轻量渲染结构 */
export const prepareWorkerExportPayload = (
  song: Song,
  selectedIndices: number[],
  chordsLookupMap: Map<string, Chord>,
  mode: 'normal' | 'a4',
  shorthand = false,
  layoutAlign: 'start' | 'center' = 'start',
  fontScale = 100,
  fretboardScale = 100,
  showBarre = true,
  lyricsFontWeight: ScoreLyricsFontWeight = 'regular',
  exportQualityPct = 95,
  pageMarginPx: number = SCORE_EXPORT_CONFIG.PAGE_MARGIN,
  pageSize = 'a4',
  showFooter = true,
  ignoreEmptySpace = false
): WorkerExportPayload => {
  const lyricsLines = song.lyrics.split('\n');
  const chordMap = song.chordMap;
  const lineIds = song.lineIds;
  // 一次遍历建边和弦索引：否则下列循环里每行两侧各扫一遍整张 chordMap（行数 × 绑定数）
  const edgeChordIndex = buildEdgeChordIndex(chordMap);

  const lines: ExportLineItem[] = [];

  for (const idx of selectedIndices) {
    const rawText = lyricsLines[idx] ?? '';
    const lineId = lineIds[idx] ?? `line_${idx}`;

    // 收集行首和弦
    const startIds = edgeChordIndex.get(lineId, 'start');
    const startChords = startIds
      .map(id => {
        const chord = chordsLookupMap.get(id);
        return chord ? extractExportChordData(chord, shorthand) : undefined;
      })
      .filter((c): c is ExportChordData => Boolean(c));

    // 收集字符与上方和弦
    const chars = Array.from(rawText).map((char, charIdx) => {
      const key = charKey(lineId, charIdx);
      const chordId = chordMap.get(key);
      const chord = chordId ? chordsLookupMap.get(chordId) : undefined;
      return {
        char,
        chord: chord ? extractExportChordData(chord, shorthand) : undefined,
      };
    });

    // 收集行尾和弦
    const endIds = edgeChordIndex.get(lineId, 'end');
    const endChords = endIds
      .map(id => {
        const chord = chordsLookupMap.get(id);
        return chord ? extractExportChordData(chord, shorthand) : undefined;
      })
      .filter((c): c is ExportChordData => Boolean(c));

    lines.push({
      lineIdx: idx,
      chars,
      startChords: startChords.length > 0 ? startChords : undefined,
      endChords: endChords.length > 0 ? endChords : undefined,
    });
  }

  const rawKey = computeSongKey(song.playKey, song.capo);
  const formatKey = (key: string) => key.replace(/#/g, '♯').replace(/b/g, '♭');
  const formattedKey = formatKey(rawKey);
  // 原调（'' 表示未设置）：设置后表头元信息行显示「原调 X 选调 Y」；未设置只显示「选调 Y」，
  // 统一「原调/选调」标签 + 调名，不带「调」后缀，升降号由 token 渲染统一上标
  const originalKey = song.originalKey ?? '';
  const keyText = originalKey ? `原调 ${formatKey(originalKey)} 选调 ${formattedKey}` : `选调 ${formattedKey}`;
  const capoText = `${song.capo}`;

  return {
    title: song.title || DEFAULT_SCORE_TITLE,
    // 歌手（纯展示元数据，空串表示无；canvas 表头非空时绘制副标题行）
    singer: song.singer ?? '',
    // 原调（'' 表示未设置）：已并入 keyText 元信息行左段（「原调 X → 演唱调」），无需单独字段
    keyText,
    capoText,
    lines,
    mode,
    // 画布配色单一来源是 tokens.scss 的 --fbc-* 变量，主线程解析后传给 Worker（Worker 无 DOM）
    colors: resolveFretboardCanvasPalette(),
    layoutAlign,
    fontScale,
    fretboardScale,
    showBarre,
    // 是否显示页脚页码（仅 A4 分页预览生效）
    showFooter,
    lyricsFontWeight,
    // 导出质量：百分制（30~100）转为 0.3~1 的比例值，由 Worker 侧 clamp 兜底
    exportQuality: Math.min(1, Math.max(0.3, exportQualityPct / 100)),
    // 导出页面边距（标准档位 窄/标准/宽，px）
    pageMargin: pageMarginPx,
    // 导出单页尺寸档位（a4 / a5 / letter）
    pageSize,
    // 忽略无和弦空格：canvas 中该空格不占列宽（缺省关闭，保持既有排版）
    ignoreEmptySpace,
  };
};

/** Worker 导出结果：各页 Blob + a4 模式下每页覆盖的原始歌词行序号（供按页重组内容） */
export interface WorkerExportResult {
  blobs: Blob[];
  pageLineRanges: number[][];
}

/** 执行 Worker 离屏导出，主线程完全无阻塞 */
export const runWorkerExport = (
  payload: WorkerExportPayload,
  onProgress?: (percent: number) => void
): Promise<WorkerExportResult> => {
  return new Promise((resolve, reject) => {
    // 检查浏览器是否支持 OffscreenCanvas
    if (typeof OffscreenCanvas === 'undefined') {
      reject(new Error('当前浏览器环境不支持 OffscreenCanvas 离屏渲染'));
      return;
    }

    const worker = new Worker(new URL('@/domains/score/preview/workers/scoreExportWorker', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (e: MessageEvent<WorkerExportMessage>) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        onProgress?.(msg.percent);
      } else if (msg.type === 'complete') {
        worker.terminate();
        resolve({ blobs: msg.blobs, pageLineRanges: msg.pageLineRanges ?? [] });
      } else if (msg.type === 'error') {
        worker.terminate();
        reject(new Error(msg.message));
      }
    };

    worker.onerror = err => {
      worker.terminate();
      reject(err);
    };

    worker.postMessage(payload);
  });
};

/**
 * 预估导出文件尺寸：复用 Worker 真实渲染管线（长图模式）返回字节数，主线程 0 阻塞。
 * 用于下载下拉标题展示「预估文件尺寸」，与最终下载的长图实际字节数一致（仅取整误差）。
 */
export const runWorkerEstimate = (payload: WorkerExportPayload): Promise<{ longImageBytes: number }> => {
  return new Promise((resolve, reject) => {
    if (typeof OffscreenCanvas === 'undefined') {
      reject(new Error('当前浏览器环境不支持 OffscreenCanvas 离屏渲染'));
      return;
    }

    const worker = new Worker(new URL('@/domains/score/preview/workers/scoreExportWorker', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (e: MessageEvent<WorkerExportMessage>) => {
      const msg = e.data;
      if (msg.type === 'estimate') {
        worker.terminate();
        resolve({ longImageBytes: msg.longImageBytes });
      } else if (msg.type === 'error') {
        worker.terminate();
        reject(new Error(msg.message));
      }
    };

    worker.onerror = err => {
      worker.terminate();
      reject(err);
    };

    // 覆盖为预估模式：仅渲染长图并返回字节数，不产出 Blob 列表
    worker.postMessage({ ...payload, mode: 'estimate' });
  });
};
