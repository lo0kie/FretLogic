/**
 * Web Worker 离屏乐谱导出服务。
 * 将乐谱数据封装后发送至 Worker 独立线程，OffscreenCanvas 离屏绘制，主线程 0ms 阻塞。
 */
import { computeSongKey, getChordName } from '@/domains/chord/theory/theory';
import { resolveFretboardCanvasPalette } from '@/domains/fretboard/fretboardCanvasPalette';
import { DEFAULT_SCORE_TITLE } from '@/domains/score/constants';
import { charKey, collectEdgeChordIds } from '@/domains/score/model/scoreModel';

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
  lyricsFontWeight: ScoreLyricsFontWeight = 'regular'
): WorkerExportPayload => {
  const lyricsLines = song.lyrics.split('\n');
  const chordMap = song.chordMap;
  const lineIds = song.lineIds;

  const lines: ExportLineItem[] = [];

  for (const idx of selectedIndices) {
    const rawText = lyricsLines[idx] ?? '';
    const lineId = lineIds[idx] ?? `line_${idx}`;

    // 收集行首和弦
    const startIds = collectEdgeChordIds(chordMap, lineId, 'start');
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
    const endIds = collectEdgeChordIds(chordMap, lineId, 'end');
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
  const formattedKey = rawKey.replace(/#/g, '♯').replace(/b/g, '♭');
  const keyText = `${formattedKey} 调`;
  const capoText = `${song.capo}`;

  return {
    title: song.title || DEFAULT_SCORE_TITLE,
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
    lyricsFontWeight,
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
