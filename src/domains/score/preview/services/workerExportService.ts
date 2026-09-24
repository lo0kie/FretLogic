/**
 * Web Worker 离屏乐谱导出服务。
 * 将乐谱数据封装后发送至常驻 Worker 独立线程，OffscreenCanvas 离屏绘制，主线程 0ms 阻塞；
 * 请求在渲染线程上串行排队（原因见下文队列实现：串行才能让 Worker 内的指板位图缓存跨次复用）。
 */
import { computeSongKey, getChordName } from '@/domains/chord/theory/theory';
import { resolveFretboardCanvasPalette } from '@/domains/fretboard/fretboardCanvasPalette';
import { DEFAULT_SCORE_TITLE, SCORE_EXPORT_CONFIG } from '@/domains/score/constants';
import { lineCharChord, lineEdgeChords, resolveLineIdAt } from '@/domains/score/model/scoreModel';
import { RENDER_ABORT_MESSAGE } from '@/domains/score/preview/workers/scoreExportWorker/scoreExportTypes';
import { clamp } from '@/platform/utils/common';

import type { Chord } from '@/domains/chord/types';
import type {
  ExportChordData,
  ExportLineItem,
  ScoreWorkerRequest,
  WorkerExportMessage,
  WorkerExportPayload,
  WorkerRenderStage,
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
  /** 指板图是否忽略首末的空品格（缺省 false = 画满 fretCount 列的全指板） */
  trimEmptyEdgeFrets?: boolean;
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
  /** 续跑起点（页序，仅 a4 分页模式有意义）：前若干页的图调用方已持有，本线程从这一页开始画。
   *  语义与正确性前提见 WorkerExportPayload.resumeFrom（协议层是唯一口径） */
  resumeFrom?: number;
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
    trimEmptyEdgeFrets = false,
    lyricsFontWeight = 'regular',
    exportQualityPct = 95,
    pageMarginPx = SCORE_EXPORT_CONFIG.PAGE_MARGIN,
    pageSize = 'a4',
    ignoreEmptySpace = false,
    resumeFrom = 0,
  } = input;
  const lyricsLines = song.lyrics.split('\n');
  const { chordMap } = song;
  const { lineIds } = song;

  const lines: ExportLineItem[] = [];

  for (const idx of selectedIndices) {
    const rawText = lyricsLines[idx] ?? '';
    const lineId = resolveLineIdAt(lineIds, idx);

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
    trimEmptyEdgeFrets,
    lyricsFontWeight,
    // 导出质量：百分制（30~100）转为 0.3~1 的比例值，由 Worker 侧 clamp 兜底
    exportQuality: clamp(exportQualityPct / 100, 0.3, 1),
    // 导出页面边距（标准档位 窄/标准/宽，px）
    pageMargin: pageMarginPx,
    // 导出单页尺寸档位（a4 / a5 / letter）
    pageSize,
    // 忽略无和弦空格：canvas 中该空格不占列宽（缺省关闭，保持既有排版）
    ignoreEmptySpace,
    // 续跑起点（页序）：>0 时 Worker 跳过前若干页的绘制与编码，只回报剩下的页
    resumeFrom,
  };
};

/** Worker 导出结果：各页 Blob + a4 模式下每页覆盖的原始歌词行序号（供按页重组内容） */
export interface WorkerExportResult {
  blobs: Blob[];
  pageLineRanges: number[][];
  /** 本次实际跳过的前导页数（见 WorkerExportPayload.resumeFrom）：blobs[0] 即第 resumedFrom 页。
   *  取 Worker 回带的**实际值**而非调用方派发值 —— 它是拼装完整页流时的权威偏移量 */
  resumedFrom: number;
}

/** 单次渲染请求的可选项 */
export interface RunWorkerExportOptions {
  /** 阶段回调：渲染线程当前在做什么（见 WorkerRenderStage）。同一请求可回调多次，只表示**当前**阶段，
   *  不是累计进度；用于把「等字体子集」与「排版出图」两类等待分开提示。 */
  onStage?: (stage: WorkerRenderStage) => void;
  /**
   * 分页总数已定（排版结束、逐页出图之前）：只回调一次，normal 长图模式恒为 1。
   *
   * 与 onStage 同属**过程信息**：给调用方一个「先铺骨架」的机会 —— 页数一旦知道，超长谱的等待就从
   * 「白屏等整批」变成「N 个占位 + 逐个填」。不关心流式的调用方（导出 / 合成）不传即可。
   */
  onPagesPlanned?: (total: number) => void;
  /**
   * 单页出图（流式）：与 Promise 结果里的 blobs 同序、同批，只是早一步到达；下标从 0 起，
   * 到达顺序即渲染顺序（渲染线程串行 + 端口有序），故可直接按到达次序追加。
   * 只作展示用途 —— 需要「全部页面」的调用方仍应 await 返回值，别在这里攒。
   */
  onPage?: (index: number, blob: Blob) => void;
  /** 排队中的任务在真正开跑前询问一次：返回 true 表示调用方已不需要这次结果（切歌 / 又改了内容），
   *  直接作废、不占用渲染线程。它也是**中断在途任务**的判据 —— 调用方判废后调一次
   *  cancelObsoleteInFlightRender，服务层据此（而非无条件）中断渲染线程上那一笔。
   *  传了它的任务被作废时一律以 RENDER_ABORT_MESSAGE 拒绝（**不是**失败），调用方按文案认领后可静默。 */
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
  const worker = new Worker(new URL('@/domains/score/preview/workers/scoreExportWorker/index.ts', import.meta.url), {
    type: 'module',
  });

  worker.onmessage = (e: MessageEvent<WorkerExportMessage>) => {
    const item = inFlightRender;
    if (!item) return;
    const msg = e.data;
    // 阶段 / 页数 / 单页都是「过程信息」：就地转给调用方，不进入下面的 resolve / reject 分支
    if (msg.type === 'stage') {
      item.options.onStage?.(msg.stage);
      return;
    }
    if (msg.type === 'pages-planned') {
      item.options.onPagesPlanned?.(msg.total);
      return;
    }
    if (msg.type === 'page') {
      item.options.onPage?.(msg.index, msg.blob);
      return;
    }
    inFlightRender = null;
    if (msg.type === 'complete')
      item.resolve({ blobs: msg.blobs, pageLineRanges: msg.pageLineRanges ?? [], resumedFrom: msg.resumedFrom });
    else item.reject(new Error(msg.message));

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
    // 排队期间已作废（切歌 / 再次编辑）：判失败即可，调用方凭自己的 token 判定忽略。
    // 文案与 worker 中断点同源，故「作废」在两侧是同一个可识别的信号 —— 页脚合成没有 token，
    // 靠的就是这条文案把自己被作废（而非真失败）认出来，免得弹一个误导性的失败提示。
    if (item.options.isObsolete?.()) {
      item.reject(new Error(RENDER_ABORT_MESSAGE));
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

/**
 * 下一次渲染是否必然要等一次字体子集下载（渲染线程尚未建立 / 已被空闲回收 / 异常废弃）。
 *
 * 【为什么由服务层回答，而不是等 worker 自己上报】上报是**事后**的：worker 要先跑起来、走到装载那一行
 * 才有机会报 `fonts`。字体子集在 HTTP 缓存命中时只有几十毫秒（1MB woff2 的取回 + 解析），这段区间很可能
 * 整个落在同一帧里 —— 主线程收得到消息、Vue 也更新了 DOM，但浏览器还没合成这一帧，于是「正在加载字体」
 * 一次都画不出来，用户看到的开头直接是「正在生成预览」。
 *
 * 由这里预言则是**事前**的，且必然准确：线程不存在 ⇒ 这次请求会新建一个 worker ⇒ 它内部按字重记录的
 * 装载缓存（见 services/scoreFonts 的 weightTasks）是空的 ⇒ 渲染分支一定会走一次 ensureScoreFontsReady
 * 的下载路径。调用方据此把加载框的**首帧**就定在「正在加载字体」，不再和上报赛跑；worker 随后的上报照旧
 * 生效（线程已存在但歌词字重改用 Light 时，仍由它补报 fonts）。
 */
export const isRenderWorkerCold = (): boolean => exportWorker === null;

/**
 * 中断渲染线程上正在跑的那一笔 —— 但**只在它的提交方自己已声明作废**时才动手（按任务自带的
 * isObsolete 判定）。
 *
 * 【为什么需要它】Worker 没有抢占能力，队列只能在任务开跑前拦下作废项（见 pumpRenderQueue）；
 * 一笔在途的整谱渲染要数秒，切歌时上一首的它会把新歌整整挡在后面 —— 这正是「切歌后比首次渲染还慢」
 * 的来源之一。下发 cancel 后 Worker 会在自己的 await 边界（逐页出图之间、页脚合成逐页之间）中断，
 * 按 error 回报，队列随即推进到下一笔（被中断方凭自己的 token 或中断文案认领这次失败）。
 *
 * 【为什么按 isObsolete 判定，而不是无条件取消】整谱预览、页脚合成、PDF/ZIP 导出共用同一条队列与
 * 同一个 Worker。无条件取消会把用户正等着的导出一起砍掉。导出侧本就不传 isObsolete（它没有「作废」
 * 概念，每一次都是用户显式点击），因此永远不会被这里中断。
 *
 * 【哪些提交方会作废】目前两类，都是**前一首乐谱的派生工作**：
 * - 整谱预览：判据是「token 已换代」，切歌 / 内容变更均成立；
 * - 页脚合成：判据是「发起时那首歌已不是当前歌」，见 ScorePreviewPane 的 ensureFooterComposed。
 * 两者都不再产出任何还有人要的东西，且都跑在「新歌渲染之前」的队列位置上，中断即等于把新歌提前。
 */
export const cancelObsoleteInFlightRender = (): void => {
  if (!exportWorker || !inFlightRender?.options.isObsolete?.()) return;
  const request: ScoreWorkerRequest = { kind: 'cancel' };
  exportWorker.postMessage(request);
};

/** 执行 Worker 离屏导出，主线程完全无阻塞（多条请求在同一渲染线程上串行排队） */
export const runWorkerExport = (
  payload: WorkerExportPayload,
  options: RunWorkerExportOptions = {}
): Promise<WorkerExportResult> =>
  new Promise((resolve, reject) => {
    // 检查浏览器是否支持 OffscreenCanvas
    if (typeof OffscreenCanvas === 'undefined') {
      reject(new Error('当前浏览器环境不支持 OffscreenCanvas 离屏渲染'));
      return;
    }
    clearIdleTimer();
    renderQueue.push({ payload, options, resolve, reject });
    pumpRenderQueue();
  });

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
