/**
 * Web Worker 离屏乐谱导出服务。
 * 将乐谱数据封装后发送至常驻 Worker 独立线程，OffscreenCanvas 离屏绘制，主线程 0ms 阻塞；
 * 请求在渲染线程上串行排队（原因见下文队列实现：串行才能让 Worker 内的指板位图缓存跨次复用）。
 */
import { computeSongKey, getChordName } from '@/domains/chord/theory/theory';
import { resolveFretboardCanvasPalette } from '@/domains/fretboard/fretboardCanvasPalette';
import { DEFAULT_SCORE_TITLE, SCORE_EXPORT_CONFIG } from '@/domains/score/constants';
import { lineCharChord, lineEdgeChords } from '@/domains/score/model/scoreModel';

import type { Chord } from '@/domains/chord/types';
import type {
  ExportChordData,
  ExportLineItem,
  ScoreWorkerRequest,
  WorkerExportMessage,
  WorkerExportPayload,
} from '@/domains/score/preview/workers/scoreExportWorker';
import type { Song } from '@/domains/score/types';
import type { ScoreLyricsFontWeight } from '@/platform/types';

/** 将 Chord 模型转为 Worker 绘图所需的轻量指板实体 */
const buildExportChordData = (chord: Chord, shorthand: boolean): ExportChordData => ({
  chordName: getChordName(chord, { shorthand, useUnicode: true }),
  strings: chord.strings.map(s => [s.fret, s.preferFlat]),
  fretCount: chord.fretCount,
  fretOffset: chord.fretOffset,
  rootStringIndex: chord.rootStringIndex ?? null,
  barres: chord.barres?.map(b => ({
    fret: b.fret,
    fromString: b.fromString,
    toString: b.toString,
  })),
});

/**
 * 抽取结果缓存：**同一首歌里同一个和弦常被引用几十次**（反复出现的 C / G / Am 之类），
 * 而每次抽取都要跑 getChordName 拼名 + strings/barres 两轮 map + 新建对象；大歌一次预览就有
 * 数百个槽位（逐字符 + 行首尾边和弦），其中绝大多数是同名重复。
 *
 * 按**和弦对象引用**缓存、且跨次预览复用（改歌词不换和弦时整段直接命中）：
 * 前提与 theory 的 sortMetaCache 一致 —— 库内和弦一律整对象替换（编辑产出新对象即落到新缓存项），
 * 且 chordsLookupMap 只装库内和弦、不含会被原地改写的草稿。返回的实例会被复用进同一份 payload，
 * 对 postMessage 无害（结构化克隆按引用图克隆一份），Worker 侧拿到的是副本、不会反向改到这里。
 * WeakMap 的键随和弦对象回收，不额外延长其生命周期。
 */
const exportChordCache = new WeakMap<Chord, Map<boolean, ExportChordData>>();

/** 将 Chord 模型转为 Worker 绘图所需的轻量指板实体（按对象引用 + 简写口径记忆化） */
const extractExportChordData = (chord: Chord, shorthand = false): ExportChordData => {
  let byShorthand = exportChordCache.get(chord);
  if (!byShorthand) {
    byShorthand = new Map<boolean, ExportChordData>();
    exportChordCache.set(chord, byShorthand);
  }
  const cached = byShorthand.get(shorthand);
  if (cached) return cached;
  const data = buildExportChordData(chord, shorthand);
  byShorthand.set(shorthand, data);
  return data;
};

/** Worker 渲染载荷入参：可选字段均有与旧签名一致的默认值（见函数解构） */
export interface WorkerExportPayloadInput {
  /** 歌曲模型 */
  song: Song;
  /** 参与渲染的歌词行索引 */
  selectedIndices: number[];
  /** 和弦 id → 和弦模型查询表 */
  chordsLookupMap: Map<string, Chord>;
  /** 渲染模式：normal 长图 / a4 自动分页 */
  mode: 'normal' | 'a4';
  /** 和弦名简写（如 Cmaj → C） */
  shorthand?: boolean;
  /** 排版对齐：start 左对齐 / center 居中 */
  layoutAlign?: 'start' | 'center';
  /** 歌词字号缩放百分比 */
  fontScale?: number;
  /** 指板图缩放百分比 */
  fretboardScale?: number;
  /** 是否绘制横按符号 */
  showBarre?: boolean;
  /** 歌词字重档位 */
  lyricsFontWeight?: ScoreLyricsFontWeight;
  /** JPEG 导出质量百分制（30~100） */
  exportQualityPct?: number;
  /** 导出页面边距（标准档位 窄/标准/宽，px） */
  pageMarginPx?: number;
  /** 导出单页尺寸档位（a4 / a5 / letter） */
  pageSize?: string;
  /** 忽略无和弦空格：canvas 中该空格不占列宽 */
  ignoreEmptySpace?: boolean;
}

/** 将歌曲模型与选中行转换为 Worker 专用的轻量渲染结构（options 对象入参，避免多位置参数逐位对齐） */
export const prepareWorkerExportPayload = (input: WorkerExportPayloadInput): WorkerExportPayload => {
  const {
    song,
    selectedIndices,
    chordsLookupMap,
    mode,
    shorthand = false,
    layoutAlign = 'start',
    fontScale = 100,
    fretboardScale = 100,
    showBarre = true,
    lyricsFontWeight = 'regular',
    exportQualityPct = 95,
    pageMarginPx = SCORE_EXPORT_CONFIG.PAGE_MARGIN,
    pageSize = 'a4',
    ignoreEmptySpace = false,
  } = input;
  const lyricsLines = song.lyrics.split('\n');
  const chordMap = song.chordMap;
  const lineIds = song.lineIds;

  const lines: ExportLineItem[] = [];

  for (const idx of selectedIndices) {
    const rawText = lyricsLines[idx] ?? '';
    const lineId = lineIds[idx] ?? `line_${idx}`;

    // 收集行首和弦（嵌套结构下行级直读，O(1)）
    const startIds = lineEdgeChords(chordMap, lineId, 'start');
    const startChords = startIds
      .map(id => {
        const chord = chordsLookupMap.get(id);
        return chord ? extractExportChordData(chord, shorthand) : undefined;
      })
      .filter((c): c is ExportChordData => Boolean(c));

    // 收集字符与上方和弦
    // 必须与 scoreModel 的 charKey 码元口径一致（split('')），不能用 Array.from 按码点切：
    // 否则歌词含 emoji/生僻字时该字符之后的和弦整体左移、行尾和弦掉出（仅导出复现，预览正常）
    const chars = rawText.split('').map((char, charIdx) => {
      const chordId = lineCharChord(chordMap, lineId, charIdx);
      const chord = chordId ? chordsLookupMap.get(chordId) : undefined;
      return {
        char,
        chord: chord ? extractExportChordData(chord, shorthand) : undefined,
      };
    });

    // 收集行尾和弦
    const endIds = lineEdgeChords(chordMap, lineId, 'end');
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
  // 原调（'' 表示未设置）：设置后表头 meta 行按「原调 X │ Capo N │ 选调 Y」推导链排布；未设置只显示「选调 Y」，
  // 统一「原调/选调」标签 + 调名，不带「调」后缀，升降号由 token 渲染统一上标
  const originalKey = song.originalKey ?? '';
  const keyText = originalKey ? `原调 ${formatKey(originalKey)} 选调 ${formattedKey}` : `选调 ${formattedKey}`;
  const capoText = `${song.capo}`;
  // 拍号（'' 表示未设置）：设置后表头元信息行最右段显示如「4/4」，未设置不绘制
  const timeSignatureText = song.timeSignature;

  return {
    kind: 'export',
    title: song.title || DEFAULT_SCORE_TITLE,
    // 歌手（纯展示元数据，空串表示无；canvas 表头非空时绘制副标题行）
    singer: song.singer ?? '',
    // 原调（'' 表示未设置）：已并入 keyText 元信息行右段（「原调 X → 演唱调」），无需单独字段
    keyText,
    capoText,
    timeSignatureText,
    lines,
    mode,
    // 画布配色单一来源是 tokens.scss 的 --fbc-* 变量，主线程解析后传给 Worker（Worker 无 DOM）
    colors: resolveFretboardCanvasPalette(),
    layoutAlign,
    fontScale,
    fretboardScale,
    showBarre,
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

/** 单次渲染请求的可选项 */
export interface RunWorkerExportOptions {
  /** 渲染进度回调（0~100） */
  onProgress?: (percent: number) => void;
  /** 排队中的任务在真正开跑前询问一次：返回 true 表示调用方已不需要这次结果（切歌 / 又改了内容），
   *  直接作废、不占用渲染线程。已在渲染中的任务无法中断（Worker 没有抢占能力）。 */
  isObsolete?: () => boolean;
}

interface PendingRender {
  /** 请求载荷：整谱渲染或页脚合成（两者共用渲染线程与队列） */
  payload: ScoreWorkerRequest;
  options: RunWorkerExportOptions;
  resolve: (result: WorkerExportResult) => void;
  reject: (err: Error) => void;
}

/**
 * 渲染线程（常驻单例）与请求队列。
 *
 * 原先每次导出都新建 Worker、拿到结果立即 terminate：Worker 内的模块级缓存（和弦名分片、
 * 指板位图）随实例一起销毁，跨次渲染复用为零——改一个歌词字也要把所有指板重画一遍。
 * 现在改为常驻一个 Worker、请求串行排队：
 * - 串行是必须的：Worker 内的布局常量与缓存都是共享状态，并发消息会互相踩；
 * - 串行同时让「连续编辑」触发的多次渲染不再争抢 CPU（旧实现会并发拉起多个 Worker）；
 * - 排队的任务开跑前会再问一次 isObsolete，编辑期间的过期渲染直接作废，不排队堆压；
 * - 空闲一段时间后自动 terminate，把其中累积的指板位图/画布缓冲一并释放，下次按需重建。
 */
const WORKER_IDLE_TERMINATE_MS = 60_000;
const renderQueue: PendingRender[] = [];
let exportWorker: Worker | null = null;
let inFlightRender: PendingRender | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

const clearIdleTimer = () => {
  if (idleTimer !== null) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
};

/** 空闲回收：Worker 内累积的指板位图与整页画布缓冲随之释放 */
const scheduleIdleTerminate = () => {
  clearIdleTimer();
  idleTimer = setTimeout(() => {
    idleTimer = null;
    exportWorker?.terminate();
    exportWorker = null;
  }, WORKER_IDLE_TERMINATE_MS);
};

/** 创建（或复用）常驻渲染线程，并把消息回调接到当前在跑的任务上 */
const ensureExportWorker = (): Worker => {
  if (exportWorker) return exportWorker;
  const worker = new Worker(new URL('@/domains/score/preview/workers/scoreExportWorker', import.meta.url), {
    type: 'module',
  });

  worker.onmessage = (e: MessageEvent<WorkerExportMessage>) => {
    const item = inFlightRender;
    if (!item) return;
    const msg = e.data;
    if (msg.type === 'progress') {
      item.options.onProgress?.(msg.percent);
      return;
    }
    inFlightRender = null;
    if (msg.type === 'complete') {
      item.resolve({ blobs: msg.blobs, pageLineRanges: msg.pageLineRanges ?? [] });
    } else {
      item.reject(new Error(msg.message));
    }
    pumpRenderQueue();
  };

  worker.onerror = event => {
    const item = inFlightRender;
    inFlightRender = null;
    // 未捕获异常（模块加载失败等）：Worker 可能已不可用，直接废弃，下个请求重建
    worker.terminate();
    if (exportWorker === worker) exportWorker = null;
    item?.reject(new Error(event.message || '渲染线程异常'));
    pumpRenderQueue();
  };

  exportWorker = worker;
  return worker;
};

/** 取队首请求开跑；队列已空则挂上空闲回收计时 */
const pumpRenderQueue = () => {
  if (inFlightRender) return;
  while (renderQueue.length > 0) {
    const item = renderQueue.shift()!;
    // 排队期间已作废（切歌 / 再次编辑）：判失败即可，调用方凭自己的 token 判定忽略
    if (item.options.isObsolete?.()) {
      item.reject(new Error('渲染任务已作废'));
      continue;
    }
    inFlightRender = item;
    try {
      ensureExportWorker().postMessage(item.payload);
    } catch (err) {
      inFlightRender = null;
      item.reject(err instanceof Error ? err : new Error('渲染任务下发失败'));
      continue;
    }
    return;
  }
  scheduleIdleTerminate();
};

/** 执行 Worker 离屏导出，主线程完全无阻塞（多条请求在同一渲染线程上串行排队） */
export const runWorkerExport = (
  payload: WorkerExportPayload,
  options: RunWorkerExportOptions = {}
): Promise<WorkerExportResult> => {
  return new Promise((resolve, reject) => {
    // 检查浏览器是否支持 OffscreenCanvas
    if (typeof OffscreenCanvas === 'undefined') {
      reject(new Error('当前浏览器环境不支持 OffscreenCanvas 离屏渲染'));
      return;
    }
    clearIdleTimer();
    renderQueue.push({ payload, options, resolve, reject });
    pumpRenderQueue();
  });
};

/** 页脚合成请求入参：页面栅格与页脚解耦（见 services/footerOverlay） */
export interface FooterComposeInput {
  /** 待合成的页面图（image/jpeg，尺寸须与 pageSize 档位的设备像素一致） */
  pages: Blob[];
  /** 各页真实页序号（从 0 起，与 pages 同序） */
  pageIndexes?: number[];
  /** 单页尺寸档位（a4 / a5 / letter，缺省 a4） */
  pageSize?: string;
  /** 页边距（px，逻辑坐标系） */
  pageMargin?: number;
  /** 页码文字色（弱化文字色） */
  color: string;
  /** 输出 JPEG 质量（0.3~1；与页面渲染同档位即可，缺省 0.95） */
  exportQuality?: number;
}

/**
 * 在渲染线程上把页脚合成到已渲染的页面上，返回合成后的各页 Blob（主线程 0ms 阻塞）。
 * 与整谱渲染共用同一队列：两者都会用到那张复用的整页画布，必须串行。
 */
export const runWorkerFooterCompose = (
  input: FooterComposeInput,
  options: RunWorkerExportOptions = {}
): Promise<Blob[]> =>
  new Promise((resolve, reject) => {
    if (typeof OffscreenCanvas === 'undefined') {
      reject(new Error('当前浏览器环境不支持 OffscreenCanvas 离屏渲染'));
      return;
    }
    clearIdleTimer();
    renderQueue.push({
      payload: { kind: 'footer-compose', ...input },
      options,
      // 合成结果只有 Blob（无分页行序号），在这里直接摊平交给调用方
      resolve: result => resolve(result.blobs),
      reject,
    });
    pumpRenderQueue();
  });
