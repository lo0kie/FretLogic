/**
 * 乐谱导出 Worker 的公开类型契约（外加一条跨线程共用的中断文案常量，见 RENDER_ABORT_MESSAGE）。
 *
 * 从 scoreExportWorker.ts 抽出（原 15~101、106、316~325 行）。
 * 零依赖（仅 `import type`）：被 layout / fretboard / render / pages / 消息入口共同引用，位于依赖图最底层。
 * 这里放常量的理由正是「最底层」：主线程侧也要按同一文案认领「作废」这种非失败的中断，若把常量放在
 * 带运行时依赖的模块里，worker 侧一 import 就会把整张主线程模块图拖进 worker bundle。
 */

import type { FretboardCanvasPalette } from '@/domains/fretboard/fretboardCanvasPalette';
import type { BarreEntity } from '@/domains/fretboard/types';
import type { ScoreLyricsFontWeight } from '@/platform/types';

export interface ExportChordData {
  chordName: string;
  strings: [number, boolean][];
  fretCount: number;
  /** 品位/把位偏移量 */
  fretOffset?: number;
  rootStringIndex: number | null;
  barres?: BarreEntity[];
}

export interface ExportCharItem {
  char: string;
  chord?: ExportChordData;
}

export interface ExportLineItem {
  lineIdx: number;
  chars: ExportCharItem[];
  startChords?: ExportChordData[];
  endChords?: ExportChordData[];
}

export interface WorkerExportPayload {
  /** 请求判别字段：整谱渲染请求（页脚合成为另一类请求，见 ScoreWorkerRequest） */
  kind: 'export';
  title: string;
  /** 歌手（纯展示元数据；非空时表头在标题下绘制居中副标题行） */
  singer?: string;
  keyText: string;
  capoText: string;
  /** 拍号文本（如「拍号 4/4」，'' 表示未设置不绘制；旧 payload 缺省兼容） */
  timeSignatureText?: string;
  lines: ExportLineItem[];
  mode: 'normal' | 'a4' | 'estimate';
  /** 画布配色（单一来源 tokens.scss 的 --fbc-* 变量，由主线程 resolveFretboardCanvasPalette 解析后传入；Worker 无 DOM 不能自取） */
  colors: FretboardCanvasPalette;
  layoutAlign?: 'start' | 'center';
  /** 歌词字号缩放（来自排列和弦配置「字号缩放」，缺省 1 不缩放） */
  fontScale?: number;
  /** 指板图缩放（来自排列和弦配置「和弦缩放」，缺省 1 不缩放） */
  fretboardScale?: number;
  /** 是否绘制大横按（缺省 true；false 时隐藏横按梁，仅保留按弦圆点） */
  showBarre?: boolean;
  /** 指板图是否忽略首末的空品格（缺省 false = 画满 fretCount 列的全指板） */
  trimEmptyEdgeFrets?: boolean;
  /** 忽略无和弦空格：该类空格不占列宽（缺省 false，保持既有排版） */
  ignoreEmptySpace?: boolean;
  /** 歌词字重（缺省 regular 常规） */
  lyricsFontWeight?: ScoreLyricsFontWeight;
  /** 导出 JPEG 压缩质量（0.3~1，缺省 0.95） */
  exportQuality?: number;
  /** 导出页面边距（px，标准档位 窄/标准/宽，缺省跟随 pageMargin） */
  pageMargin?: number;
  /** 导出单页尺寸档位（a4 / a5 / letter，缺省 a4），仅 A4 分页模式生效 */
  pageSize?: string;
  /**
   * 续跑起点（页序，仅 a4 分页模式有意义；缺省 0 = 从第 0 页开始画）。
   *
   * 调用方在被打断的那一轮里已经拿到了前若干页的图（它们不在任何缓存条目里，本线程也不持有），
   * 重发同一份内容时带上本字段：排版照常重算（纯函数、便宜，且页数与逐页内容都由它决定），
   * 但 **[0, resumeFrom) 这些页的绘制与 JPEG 编码直接跳过** —— 那才是整笔渲染里最贵的一段。
   * 于是「切歌切回来 / 换设置又换回去」只需补没画完的页，而不是从第 0 页重来。
   *
   * 【为什么起点必须由调用方给】排版与出图都在本线程内，只有调用方知道前若干页的图在谁手上；
   * 本线程无状态，也没有跨请求的页图缓存（空闲 60s 即被回收，缓存寿命不足以承载）。
   *
   * 【正确性前提】同一份 payload 必然排出同一套页序（排版是纯函数）—— 故调用方只在**内容键相同**
   * 时才敢续跑。本线程另外把实际跳过的页数回带在 complete.resumedFrom 里，调用方用它与自己派发时
   * 的值交叉校验，不符即整段判废重跑（见 ScorePreviewPane 的结果拼装）。
   */
  resumeFrom?: number;
}

/**
 * 渲染阶段：供主线程把「等字体」与「出图」两类等待分开显示。
 * fonts 是唯一的「网络 IO」阶段（字体子集按字重各约 1MB，只在渲染线程尚未装载过该字重时发生）；
 * render 覆盖其后的全部同步计算与光栅化（折行、装箱、逐页绘制、编码）。
 */
export type WorkerRenderStage = 'fonts' | 'render';

export type WorkerExportMessage =
  /** 阶段切换：同一请求可上报多次，只报**当前**阶段（不是累计进度），主线程按最后一次覆盖显示 */
  | { type: 'stage'; stage: WorkerRenderStage }
  /**
   * 分页总数已定（纯排版阶段结束、进入逐页出图之前）。
   *
   * 与 `stage` 一样是**过程信息**：主线程据此先把 N 个骨架槽位铺出来，不必等任何一页出图 ——
   * 超长谱（几十页）整批渲染要等很久，这段等待期间有骨架可看、且总数已知，才谈得上「进度」。
   * 只发一次；normal 长图模式恒为 1（那本身只有一页）。
   */
  | { type: 'pages-planned'; total: number }
  /**
   * 单页出图（流式）：下标从 0 起，与 `complete` 里的 blobs 同序、同批（续跑时首位是 resumeFrom）。
   *
   * 逐页上报是「边出边看」的手段：主线程收到一页就替换掉对应骨架，而非等 complete 再整批上屏。
   * 消息顺序即渲染顺序（Worker 串行、同一端口有序），故调用方可以按到达次序 append。
   * `complete` 仍携带全部 blobs，两者**不是二选一**：非流式消费方（导出 / 合成）继续只认 complete。
   */
  | { type: 'page'; index: number; blob: Blob }
  | {
      type: 'complete';
      blobs: Blob[];
      /** 本次实际跳过的前导页数（见 payload.resumeFrom）：blobs[0] 即第 resumedFrom 页；0 = blobs 覆盖全部页 */
      resumedFrom: number;
      /** a4 模式下每页覆盖的原始歌词行序号（升序去重），供外部按页重组内容；normal 模式为 undefined。
       *  恒为**全部页**的读数：续跑只影响出图，不影响排版结果 */
      pageLineRanges?: number[][];
    }
  | { type: 'error'; message: string };

/**
 * 页脚合成请求：把已渲染的页面图（不含页脚）贴回整页画布后画上页码再编码。
 * 页面栅格与页脚解耦（见 services/footerOverlay），故预览缓存只需保留一份「无页脚」页面：
 * 切换「显示页脚」既不重渲染也不产生第二份缓存条目，导出时再按需合成。
 */
export interface FooterComposePayload {
  kind: 'footer-compose';
  /** 待合成的页面图（image/jpeg，尺寸须与 pageSize 档位的设备像素一致） */
  pages: Blob[];
  /** 各页真实页序号（从 0 起，与 pages 同序）；缺省按数组下标 */
  pageIndexes?: number[];
  /** 单页尺寸档位（a4 / a5 / letter，缺省 a4） */
  pageSize?: string;
  /** 页边距（px，逻辑坐标系；缺省排版层 LAYOUT.PAGE_MARGIN） */
  pageMargin?: number;
  /** 页码文字色（弱化文字色，取值同导出配色 SUB_TEXT） */
  color: string;
  /** 输出 JPEG 质量（0.3~1，缺省 0.95） */
  exportQuality?: number;
}

/**
 * 「本笔渲染已作废」的中断文案：worker 中断点抛的 Error、服务层拒绝排队项时用的 Error，都是这一条。
 *
 * 【为什么要有这条常量】作废**不是失败**：调用方（切歌 / 内容已变）本就不要这一笔结果，只是提前收工；
 * 而渲染线程还存在「用户显式发起」的活儿（导出 / 页脚合成），它们收到 error 就得真报错。两侧都靠
 * `error.message` 区分，故文案必须逐字同源，不能各处手写字面量。
 */
export const RENDER_ABORT_MESSAGE = '渲染任务已作废（乐谱已切换或内容已变更）';

/**
 * 作废请求：把渲染线程上**正在跑的那一笔**标记为可中断。
 *
 * 主线程侧只能拦下「尚未开跑」的任务（见 workerExportService 的 isObsolete 与 pumpRenderQueue），
 * 而一笔整谱渲染动辄数秒：切歌时上一首的在途渲染会把新歌整整挡在后面。Worker 没有抢占能力，可行的
 * 中断点只有它自己的 await 边界（字体装载之后、逐页 convertToBlob 之后、页脚合成逐页之间），故用这条
 * 消息置一个标志位，各渲染循环在自己的边界比对标志并主动中断（闸在 scoreExportAbort）。
 * 标志位在新请求起跑时复位，因此只影响「当下这一笔」。
 *
 * 【谁会被它中断】只可能是**声明过作废判据**的任务（整谱预览 / 页脚合成，见 isObsolete）；导出没有
 * 作废概念，服务层判不出「作废」，故不会下发这条消息。
 *
 * 本消息不携带载荷、也不产生 `complete`：被中断的请求按 `error` 回报，调用方凭自己的 token 忽略
 * （与排队期作废同一套语义）；没有 token 的页脚合成按 RENDER_ABORT_MESSAGE 认领并静默。
 */
export interface CancelRenderRequest {
  kind: 'cancel';
}

/** 渲染线程请求联合：整谱渲染 / 页脚合成 / 中断在途渲染（判别字段 kind） */
export type ScoreWorkerRequest = WorkerExportPayload | FooterComposePayload | CancelRenderRequest;

/** 主题配色（单一来源：主线程解析后的 --fbc-* 变量集） */
export type ThemeColors = FretboardCanvasPalette;

/** 渲染分段结构（包含首行顶格、续行缩进及子行紧凑行距控制） */
export interface RenderSegment {
  lineIdx: number;
  chars: ExportCharItem[];
  startChords?: ExportChordData[];
  endChords?: ExportChordData[];
  isContinuation: boolean; // 是否为续行（渲染时缩进 WRAPPED_LINE_INDENT）
  isLastSubLine: boolean; // 是否为该物理行的最后一段（决定后方行距是 WRAPPED_LINE_ROW_GAP 还是 LINE_ROW_GAP）
  contentHeight: number; // 预计算内容高度，避免渲染与装箱时重复遍历和弦列表
  width: number; // 预计算水平总宽（含续行缩进 / 段首段尾和弦组），避免渲染与装箱时重复遍历字符算列宽
}
