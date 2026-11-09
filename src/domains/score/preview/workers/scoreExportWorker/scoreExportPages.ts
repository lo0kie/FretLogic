/**
 * 乐谱导出 Worker 的分页与导出层：整页画布复用、A4 装箱、长图渲染、页脚合成。
 *
 * 从 scoreExportWorker.ts 抽出（原 1084~1395 行）。
 * 处在依赖图倒数第二层：单向依赖 layout / render / types，只被消息入口调用。
 */

import { getScorePageSize } from '@/domains/score/constants';
import { drawFooterMark } from '@/domains/score/preview/services/footerOverlay';

import { throwIfAborted } from './scoreExportAbort';
import { EXPORT_JPEG_QUALITY, LAYOUT, renderRatio, requireContext2D, wrapScoreLines } from './scoreExportLayout';
import { getHeaderHeight, renderHeader, renderScoreLine } from './scoreExportRender';

import type {
  ExportLineItem,
  FooterBandPayload,
  FooterComposePayload,
  RenderSegment,
  ThemeColors,
} from './scoreExportTypes';

/**
 * 整页离屏画布（模块级复用）。
 *
 * A4 分页每页都是一张 1600×2300 级别的画布，底层缓冲约 15MB；原来逐页新建再丢弃，
 * 一本 10 页的乐谱就会反复分配 150MB。改为复用同一张（尺寸档位变化时才重建），
 * 每次取用重置变换并清底，语义与「新建画布 + 填充背景」一致。
 * 复用安全的前提：convertToBlob 在被调用时即同步拷贝画布位图（规范约定），
 * 因此每页 await 完成后才进入下一页，不会读到被覆盖的像素。
 *
 * canvas 与 ctx 成对存放（而非两个并列的模块变量）：配对关系由类型保证，重建必然同时换掉两者，
 * 取用处无需再断言「上下文一定还在」。
 */
let pagePool: { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D } | null = null;

/**
 * 浏览器单张画布的尺寸硬上限（Blink 判定 canvas 位图是否合法的口径：单边 65535px，总面积 2^28）。
 *
 * 超限的画布会被判为非法尺寸——出问题的那个维度在设置时被丢弃、留在 0，画布从此不可用，
 * 之后任何 convertToBlob 都抛「The size of the OffscreenCanvas is zero」：报错指向「零尺寸」，
 * 真实原因却是尺寸超限。故必须在**构造之前**挡住，不能等它在编码时以零尺寸的形态爆开。
 *
 * 长图是本项目唯一高度随内容无界增长的画布：A4 分页固定 794×1123，长图宽度也被
 * NORMAL_CONTENT_MAX_WIDTH（880）钳在 992 逻辑 px 内，所以总面积上限（约 2.68 亿 px）
 * 永远不会先于单边上限触发——只查单边即可。
 */
const MAX_CANVAS_EDGE = 65535;
/**
 * 画布位图总面积上限（像素）。Blink 的口径是 2^28，这里取同值 —— 与单边上限一样必须在
 * 构造前挡住：超限同样表现为「零尺寸」的误导性报错。
 */
const MAX_CANVAS_AREA = 2 ** 28;

/**
 * 长图渲染比的下限。0.5 是「和弦名不小于 8px 设备像素」的可读性底线（原始字号 16px）：
 * 再低就该显式失败并引导分页导出，而不是产出一张放大也看不清的图。
 */
const MIN_LONG_IMAGE_RATIO = 0.5;

/**
 * 按内容逻辑尺寸反推长图渲染比：优先保留 PIXEL_RATIO 的超采样，放不下才逐级往下降，
 * 保证画布尺寸在任何内容长度下都合法；跌破下限即显式失败（见 MIN_LONG_IMAGE_RATIO）。
 *
 * 比例小于 1 时**不**重光栅化指板位图：位图缓存固定按 PIXEL_RATIO 光栅化，贴图时由 canvas
 * 统一降采样。缓存分辨率与渲染比解耦是必须的——否则每次比例变化都要清空整条位图缓存，
 * 跨次渲染复用（改歌词不换和弦即命中）就没了。
 *
 * device 尺寸是 Math.round(逻辑 × 比例)，留 1px 余量避免取整后正好顶到上限被判非法。
 */
function resolveLongImageRatio(width: number, height: number): number {
  // 单边与**总面积**两条上限都要满足：长图宽度通常被 NORMAL_CONTENT_MAX_WIDTH（880）钳在
  // 992 逻辑 px 内，但 maxSegmentW 是折行后的**实测**段宽、不受该常量约束（首段带行首和弦组时
  // 永不折断），极端宽段下「单边合法、总面积非法」可达 —— 那样画布会静默变 0×0，
  // 最终在 convertToBlob 处以误导性的「零尺寸」爆开。
  const edgeRatio = (MAX_CANVAS_EDGE - 1) / Math.max(width, height);
  // 面积随比例平方缩放，故取平方根
  const areaRatio = Math.sqrt(MAX_CANVAS_AREA / Math.max(1, width * height));
  const ratio = Math.min(renderRatio(), edgeRatio, areaRatio);
  if (ratio >= MIN_LONG_IMAGE_RATIO) return ratio;

  throw new Error(
    `乐谱过长：长图即使在最小可读比例（${MIN_LONG_IMAGE_RATIO}×）下也需 ` +
      `${Math.ceil(height * MIN_LONG_IMAGE_RATIO)}px 高度，超出浏览器单张图片上限（${MAX_CANVAS_EDGE}px）。` +
      '请改用「下载为 PDF」或「下载为 ZIP」分页导出。'
  );
}

/**
 * 取整页画布与上下文（需要时按新尺寸重建），返回前已重置变换、清底交由调用方填充背景。
 * ratio 缺省为本次渲染的超采样比（见 setRenderRatio）；长图高度无界，由调用方传入按内容反推的合法比例。
 */
function acquirePageCanvas(
  width: number,
  height: number,
  ratio: number = renderRatio()
): { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D } {
  const deviceW = Math.round(width * ratio);
  const deviceH = Math.round(height * ratio);
  // 有限正数守卫：NaN / 0 / Infinity 会被 OffscreenCanvas 静默转成 0×0，此后所有 convertToBlob
  // 都抛「The size of the OffscreenCanvas is zero」—— 报错指向症状而非原因。就地挡住。
  if (!Number.isFinite(deviceW) || !Number.isFinite(deviceH) || deviceW <= 0 || deviceH <= 0)
    throw new Error(`画布尺寸非法（${deviceW}×${deviceH}）：宽高必须是有限正数`);
  let pool = pagePool;
  if (!pool || pool.canvas.width !== deviceW || pool.canvas.height !== deviceH) {
    const canvas = new OffscreenCanvas(deviceW, deviceH);
    pool = { canvas, ctx: requireContext2D(canvas) };
    pagePool = pool;
  }
  const { canvas, ctx } = pool;
  // 必须 setTransform 而非 scale：复用画布要重置变换，否则缩放逐页累乘
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { canvas, ctx };
}

/** 单页页脚合成的绘制参数（纸张尺寸已在调用方解析好，避免每页重解析一次档位） */
export interface FooterPageOptions {
  width: number;
  height: number;
  pageMargin: number;
  /** 页码文字色（导出配色 SUB_TEXT） */
  color: string;
  /** 输出 JPEG 质量（0.3~1） */
  quality: number;
}

/**
 * 合成**单页**页脚：把无页脚页图贴回整页画布 → 画页码 → 重编码为 JPEG。
 *
 * 两个调用方共用这一份实现：页脚合成分支（拿到的是一批页图）与整谱渲染循环
 * （`embedFooterPages` 为真时，每画完一页就顺手合成该页）。
 *
 * **两者共用同一张整页画布**（acquirePageCanvas 的模块级 pagePool），故调用方必须保证它们不重叠 ——
 * 现状由两条共同保证：渲染循环内是**顺序 await**，跨任务则由「同一条串行队列」保证。
 * 这也是「页脚不能作为另一笔任务与渲染并行」的根因（并行会互相清掉对方的画布内容）。
 */
export async function composeFooterPage(
  page: Blob,
  pageIndex: number,
  opts: FooterPageOptions,
  ratio: number = renderRatio()
): Promise<Blob> {
  const { canvas, ctx } = acquirePageCanvas(opts.width, opts.height, ratio);
  // 页图为设备像素（逻辑尺寸 × 本次渲染比），贴图用恒等变换保证 1:1 不重采样
  const bitmap = await createImageBitmap(page);
  try {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
  } finally {
    // 位图是解码后的整页像素（单页可达十余 MB）：clearRect/drawImage 抛错时同样必须释放
    bitmap.close();
  }

  // 回到逻辑坐标系画页码：与预览展示层共用同一绘制函数，字号/位置逐像素同源
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  drawFooterMark(ctx, {
    pageIndex,
    width: opts.width,
    height: opts.height,
    pageMargin: opts.pageMargin,
    color: opts.color,
  });

  return canvas.convertToBlob({ type: 'image/jpeg', quality: opts.quality });
}

/**
 * 页脚合成：把无页脚的页面图贴回整页画布 → 画页码 → 重编码为 JPEG。
 *
 * 页面栅格与页脚解耦的原因：若页脚画进页面栅格，「显示页脚」便成了内容的一部分，
 * 预览缓存必须为开关两态各存一份（同一首歌两份条目、字节数翻倍）。改为合成层后只留一份
 * 无页脚页面；代价是导出时多一次 JPEG 编码（质量档位与页面渲染相同，视觉无损级）。
 *
 * @param onFooterPage 逐页上报（可选）。整批一次回传会让页码在全部页合成完那一刻一起跳出来
 *        （14 页实测 ≈ 400ms），而单页合成只有 ~22ms。逐页回传后第 1 页的页码立刻到位，
 *        且被中断时已上报的页仍归调用方。
 */
export async function composeFooterPages(
  payload: FooterComposePayload,
  onFooterPage?: (index: number, blob: Blob) => void
): Promise<Blob[]> {
  const { width, height } = getScorePageSize(payload.pageSize ?? 'a4');
  const opts: FooterPageOptions = {
    width,
    height,
    pageMargin: payload.pageMargin ?? LAYOUT.PAGE_MARGIN,
    color: payload.color,
    quality: Math.min(1, Math.max(0.3, payload.exportQuality ?? EXPORT_JPEG_QUALITY)),
  };
  // 待合成的页图按**哪一档比**渲染的：由载荷给出（缺省当前渲染比）。导出的页图恒为默认比，
  // 预览若将来传低比页图来合成，也必须按同一个比贴图 + 画页码，否则字被拉伸。
  const ratio = payload.renderRatio ?? renderRatio();

  const blobs: Blob[] = [];
  for (let i = 0; i < payload.pages.length; i++) {
    // 页边界即中断点：每页都要 await createImageBitmap（解码上一张 JPEG）+ convertToBlob（重编码），
    // 本笔被作废（切歌）时这些产物全部丢弃，没必要把剩下的页继续贴完、继续占着渲染线程。
    // 本层是唯一能拦住页脚合成的地方 —— 它对整谱渲染不是「派生的展示料」而是同一条串行队列上的
    // 一大段编码，不中断就会把新歌的渲染整段挡在后面。
    throwIfAborted();
    // 页序取**真实页序**而非数组下标 —— 合成批只覆盖「缺页脚的那几页」，下标与页序不是一回事
    const pageIndex = payload.pageIndexes?.[i] ?? i;
    const blob = await composeFooterPage(payload.pages[i]!, pageIndex, opts, ratio);
    blobs.push(blob);
    onFooterPage?.(pageIndex, blob);
  }
  return blobs;
}

/**
 * 页脚带高度（逻辑 px）：从页底往上取这么高一条作为叠加层画布。
 *
 * 取值只需覆盖页码本身（`drawFooterMark` 把基线落在页底边距中线 `height − pageMargin/2`，
 * 字号 FOOTER_FONT_SIZE），故「一个页边距」已经远超所需。取整页边距而不是紧贴字高，是为了给
 * 不同纸张档位（a4 / a5 / letter 的 pageMargin 不同）留出同一套算式，不必按档位另调。
 */
const footerBandHeight = (pageMargin: number): number => Math.max(1, Math.ceil(pageMargin));

/**
 * 产出单页页脚**条带**：一张「页宽 × 页脚带高」的**透明** PNG，只有页码那一行有像素。
 *
 * 【为什么透明底可行】页码是叠在页图之上的独立层，底下页图已铺好背景色；条带自身不需要背景，
 * 全透明区在 PNG 里几乎不占字节（实测整页尺寸的透明 PNG 也才 79KB，而截到条带后只有 7KB）。
 *
 * 【为什么用 PNG 而不是 JPEG】JPEG 没有 alpha 通道，透明区会被填成黑/白实底、把下面的页图盖住。
 *
 * 【坐标系】ctx 变换设成 ratio 缩放后，`drawFooterMark` 收到的 height/pageMargin 仍是**逻辑**值，
 * 但传入的 height 要换成「本图在整页中的逻辑底边」= 条带高（因为条带画布的 y=0 就是整页的
 * `pageHeight − bandHeight`）—— 故这里把 baseline 直接算成 `bandHeight − pageMargin/2`，
 * 与整页路径的 `pageHeight − pageMargin/2` 在各自坐标系里是同一根线。
 */
export async function renderFooterBand(
  pageIndex: number,
  opts: { width: number; pageHeight: number; pageMargin: number; color: string; ratio: number }
): Promise<Blob> {
  const bandH = footerBandHeight(opts.pageMargin);
  // 透明画布：不铺任何背景，未绘制处保持 alpha=0
  const canvas = new OffscreenCanvas(Math.ceil(opts.width * opts.ratio), Math.ceil(bandH * opts.ratio));
  const ctx = requireContext2D(canvas);
  ctx.setTransform(opts.ratio, 0, 0, opts.ratio, 0, 0);
  // 条带坐标系里「整页底边」在 y = bandH 处（画布顶端对应整页的 pageHeight − bandH）
  drawFooterMark(ctx, {
    pageIndex,
    width: opts.width,
    height: bandH,
    pageMargin: opts.pageMargin,
    color: opts.color,
  });
  return canvas.convertToBlob({ type: 'image/png' });
}

/**
 * 批量产出页脚条带（页脚 band 请求的处理体）：逐页产出并流式上报。
 *
 * 与 composeFooterPages 的差别：不碰整页画布（各自新建小画布）、不解码页图、不重编码 JPEG ——
 * 单页成本实测约 0.7ms（对比整页合成的 ~30ms）。逐页 `throwIfAborted` 与合成路径同款：
 * 切歌后这些产物同样没人要。
 */
export async function renderFooterBands(
  payload: FooterBandPayload,
  onBand?: (index: number, blob: Blob) => void
): Promise<Blob[]> {
  const { width, height } = getScorePageSize(payload.pageSize ?? 'a4');
  const pageMargin = payload.pageMargin ?? LAYOUT.PAGE_MARGIN;
  const ratio = payload.ratio ?? renderRatio();
  const blobs: Blob[] = [];
  for (const pageIndex of payload.pageIndexes) {
    throwIfAborted();
    const blob = await renderFooterBand(pageIndex, {
      width,
      pageHeight: height,
      pageMargin,
      color: payload.color,
      ratio,
    });
    blobs.push(blob);
    onBand?.(pageIndex, blob);
  }
  return blobs;
}

/**
 * 画布复用时的清底 + 铺背景：背景色含透明度时必须先清掉上一页残留。
 * 长图与 A4 分页两条路径都要做这一对操作，收在这里免得漏掉其中一步。
 */
const fillPageBackground = (
  ctx: OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  bg: string
): void => {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
};

/**
 * 逐段绘制（返回末段之后的 Y）。
 *
 * 长图与 A4 分页的绘制循环**逐字相同**，唯一差别是「整行段之间的行距」：长图恒取
 * `LAYOUT.LINE_ROW_GAP`，A4 满页会按可用高动态拉伸（dynamicRowGap）。故只把这一档作为参数传入，
 * 而不是让两条路径各持一份循环 —— 此前起点 X 的算式、续行缩进、末段行距归零这几条口径都有两个家，
 * 改一处漏一处就会让长图与分页在同样的内容上排出不同的版。
 */
const drawSegments = (
  ctx: OffscreenCanvasRenderingContext2D,
  segments: RenderSegment[],
  startY: number,
  opts: {
    canvasW: number;
    pageMargin: number;
    colors: ThemeColors;
    layoutAlign: 'start' | 'center';
    showBarre: boolean;
    lyricsFontWeight: number;
    /** 续行行首是否画折行提示符（只影响这一笔画不画，不影响任何排版量） */
    showWrappedLineMark: boolean;
    /** 整行段之间的行距；续行段恒取 LAYOUT.WRAPPED_LINE_ROW_GAP，不受本值影响 */
    majorRowGap: number;
  }
): number => {
  const { canvasW, pageMargin, colors, layoutAlign, showBarre, lyricsFontWeight, showWrappedLineMark, majorRowGap } =
    opts;
  const isCenter = layoutAlign === 'center';
  let curY = startY;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const isLast = i === segments.length - 1;
    const defaultGap = seg.isLastSubLine ? majorRowGap : LAYOUT.WRAPPED_LINE_ROW_GAP;
    const startX = isCenter
      ? Math.max(pageMargin, Math.round((canvasW - seg.width) / 2)) +
        (seg.isContinuation ? LAYOUT.WRAPPED_LINE_INDENT : 0)
      : pageMargin + (seg.isContinuation ? LAYOUT.WRAPPED_LINE_INDENT : 0);
    curY = renderScoreLine(
      ctx,
      seg,
      startX,
      curY,
      colors,
      showBarre,
      lyricsFontWeight,
      isLast ? 0 : defaultGap,
      showWrappedLineMark
    ).nextY;
  }
  return curY;
};

/**
 * 长图渲染入参。
 *
 * 由 14 个位置参数改成对象：位置参数在这条路径上已经排到第 14 位，且**相邻多项同型**
 * （`title` / `singer` / `keyText` / `capoText` / `timeSignatureText` 五个字符串连排），
 * 调用方少写一个就会把后面全部前移一格、编译期毫无察觉 —— 本文件另一条渲染路径
 * （`A4PageRenderOptions`）早已是对象入参，两条路径对齐后新增字段也不必再改签名。
 */
export interface LongImageRenderOptions {
  lines: ExportLineItem[];
  title: string;
  singer: string;
  keyText: string;
  capoText: string;
  timeSignatureText: string;
  colors: ThemeColors;
  layoutAlign: 'start' | 'center';
  showBarre: boolean;
  lyricsFontWeight: number;
  jpegQuality: number;
  pageMargin: number;
  ignoreEmptySpace: boolean;
  showWrappedLineMark: boolean;
}

/**
 * 长图模式离屏渲染：自适应最宽行宽度绘制整曲为单张 JPEG，返回 Blob。
 * 供「下载为长图」导出与「预估文件尺寸」估算两处复用——估算即真实渲染后取 blob.size，
 * 因此预估值与最终导出文件字节数一致（仅取整误差）。
 *
 * 与 A4 分页的本质区别是**高度无界**（随行数增长），而浏览器对单张画布有硬尺寸上限，
 * 故这里不固定 PIXEL_RATIO 超采样，而是按内容反推一个合法渲染比（见 resolveLongImageRatio）：
 * 常规长度下与固定超采样逐像素等价，超长内容才逐级降比例，降无可降则显式失败。
 */
export async function renderLongImageBlob(opts: LongImageRenderOptions): Promise<Blob> {
  const {
    lines,
    title,
    singer,
    keyText,
    capoText,
    timeSignatureText,
    colors,
    layoutAlign,
    showBarre,
    lyricsFontWeight,
    jpegQuality,
    pageMargin,
    ignoreEmptySpace,
    showWrappedLineMark,
  } = opts;

  const availWidth = LAYOUT.NORMAL_CONTENT_MAX_WIDTH;
  const allSegments = wrapScoreLines(lines, availWidth, ignoreEmptySpace);

  // 单次遍历同时计算：最宽段宽度、内容总高、行间距总高（段宽已在软折行阶段预计算）
  let maxSegmentW = 0;
  let totalContentH = 0;
  let totalGapsH = 0;
  for (let i = 0; i < allSegments.length; i++) {
    const seg = allSegments[i]!;
    const segW = seg.width;
    if (segW > maxSegmentW) maxSegmentW = segW;
    totalContentH += seg.contentHeight;
    if (i < allSegments.length - 1) totalGapsH += seg.isLastSubLine ? LAYOUT.LINE_ROW_GAP : LAYOUT.WRAPPED_LINE_ROW_GAP;
  }

  const headerH = getHeaderHeight(Boolean(singer));
  const canvasW = Math.max(LAYOUT.NORMAL_CANVAS_MIN_WIDTH, Math.round(maxSegmentW + pageMargin * 2));
  const canvasH = pageMargin + headerH + totalContentH + totalGapsH + pageMargin;

  // 先按内容尺寸反推合法渲染比再建画布：尺寸超限的画布会在 convertToBlob 处以「零尺寸」的
  // 形态爆开、看不出真实原因（见 MAX_CANVAS_EDGE），必须挡在构造之前
  const { canvas, ctx } = acquirePageCanvas(canvasW, canvasH, resolveLongImageRatio(canvasW, canvasH));

  // 清底后铺背景：画布复用，背景色若含透明度则需先清掉上一页残留
  fillPageBackground(ctx, canvasW, canvasH, colors.BG);

  let curY: number = pageMargin;
  curY = renderHeader(ctx, title, singer, keyText, capoText, timeSignatureText, canvasW, curY, colors);

  drawSegments(ctx, allSegments, curY, {
    canvasW,
    pageMargin,
    colors,
    layoutAlign,
    showBarre,
    lyricsFontWeight,
    showWrappedLineMark,
    majorRowGap: LAYOUT.LINE_ROW_GAP,
  });

  return canvas.convertToBlob({ type: 'image/jpeg', quality: jpegQuality });
}

/**
 * A4 分页装箱：软折行后的分段按页高动态装箱。
 * - 整句歌词跨页断裂保护（`keepLineIntact`）：原始行首个分段放不下整句、而全新一页放得下时，
 *   提前开新页，让整句歌词完整留在同一页。**关掉它**则长行按段照常填充当前页（可以跨页）——
 *   代价是同一句分处两页，换来的是上一页不因「差一点装下」而整段留白；长行（折成好几段的那些）
 *   尤其明显，用户要的正是这个取向，故它是默认档。
 * - 页首空行优化：新页尚未放入任何歌词时跳过纯空行，避免页首留白。
 */
export function packA4Pages(
  allSegments: RenderSegment[],
  contentHeight: number,
  headerH: number,
  keepLineIntact: boolean
): RenderSegment[][] {
  const pages: RenderSegment[][] = [];
  let curPageSegments: RenderSegment[] = [];
  let curPageUsedH: number = headerH;

  const isEmptySegment = (seg: RenderSegment) =>
    seg.chars.length === 0 && !seg.startChords?.length && !seg.endChords?.length;

  for (let i = 0; i < allSegments.length; i++) {
    const seg = allSegments[i]!;

    // 页首空行优化：如果新页尚未放入任何歌词，遇到纯空行直接跳过，避免页首留白
    if (curPageSegments.length === 0 && isEmptySegment(seg)) continue;

    const segContentH = seg.contentHeight;
    const lastSeg = curPageSegments.at(-1);
    const gap = lastSeg ? (lastSeg.isLastSubLine ? LAYOUT.LINE_ROW_GAP : LAYOUT.WRAPPED_LINE_ROW_GAP) : 0;

    let willOverflow = false;

    // 整句歌词跨页保护：当这是一个原始歌词行的首个分段时，前瞻该原始行所有分段的总高度。
    // `keepLineIntact` 关掉时整段跳过 —— 长行于是按段填充当前页、可以跨页。
    if (keepLineIntact && !seg.isContinuation && curPageSegments.length > 0) {
      let entireLineH = gap + segContentH;
      for (let j = i + 1; j < allSegments.length; j++) {
        const nextSeg = allSegments[j]!;
        if (nextSeg.lineIdx !== seg.lineIdx) break;
        entireLineH += LAYOUT.WRAPPED_LINE_ROW_GAP + nextSeg.contentHeight;
      }
      // 当前页放不下整句，但全新一页放得下 → 提前开新页，保证整句歌词完整留在同一页
      if (curPageUsedH + entireLineH > contentHeight && entireLineH <= contentHeight) willOverflow = true;
    }

    // 常规溢出判定（单段放不下）
    if (!willOverflow && curPageUsedH + gap + segContentH > contentHeight && curPageSegments.length > 0)
      willOverflow = true;

    if (willOverflow) {
      pages.push(curPageSegments);
      curPageSegments = [];
      curPageUsedH = 0;

      // 新页若遇到纯空行则跳过
      if (isEmptySegment(seg)) continue;
    }

    const effectiveGap = willOverflow || curPageSegments.length === 0 ? 0 : gap;
    curPageSegments.push(seg);
    curPageUsedH += effectiveGap + segContentH;
  }
  if (curPageSegments.length > 0 || pages.length === 0) pages.push(curPageSegments);

  return pages;
}

/** 装箱后按段的 lineIdx 归集每页覆盖的原始歌词行序号（升序去重），供外部按页重组内容 */
export function computePageLineRanges(pages: RenderSegment[][]): number[][] {
  return pages.map(pageSegments => {
    const seen = new Set<number>();
    for (const seg of pageSegments) seen.add(seg.lineIdx);
    return [...seen].sort((a, b) => a - b);
  });
}

export interface A4PageRenderOptions {
  pageSegments: RenderSegment[];
  /** 首页绘制表头 */
  isFirstPage: boolean;
  isFullPage: boolean;
  title: string;
  singer: string;
  keyText: string;
  capoText: string;
  timeSignatureText: string;
  canvasW: number;
  canvasH: number;
  pageMargin: number;
  colors: ThemeColors;
  layoutAlign: 'start' | 'center';
  showBarre: boolean;
  lyricsFontWeight: number;
  /** 续行行首是否画折行提示符（纯绘制开关，不影响分页与任何排版量） */
  showWrappedLineMark: boolean;
  jpegQuality: number;
}

/** 渲染单页 A4：整页时按 space-between 动态膨胀行距（上限 1.35 倍默认行距）。
 *  页脚页码不在本函数内绘制——它是独立合成层，见 composeFooterPages。 */
export async function renderA4Page(opts: A4PageRenderOptions): Promise<Blob> {
  const {
    pageSegments,
    isFirstPage,
    isFullPage,
    title,
    singer,
    keyText,
    capoText,
    timeSignatureText,
    canvasW,
    canvasH,
    pageMargin,
    colors,
    layoutAlign,
    showBarre,
    lyricsFontWeight,
    showWrappedLineMark,
    jpegQuality,
  } = opts;

  const { canvas, ctx } = acquirePageCanvas(canvasW, canvasH);

  // 清底后铺背景：画布复用，背景色若含透明度则需先清掉上一页残留
  fillPageBackground(ctx, canvasW, canvasH, colors.BG);

  let curY: number = pageMargin;
  if (isFirstPage) curY = renderHeader(ctx, title, singer, keyText, capoText, timeSignatureText, canvasW, curY, colors);

  // 合并为单次循环：计算 space-between 参数 + 逐段绘制
  const pageAvailH = canvasH - pageMargin - curY;

  let totalContentH = 0;
  let totalWrappedGapsH = 0;
  let majorGapCount = 0;
  for (let i = 0; i < pageSegments.length - 1; i++) {
    const s = pageSegments[i]!;
    totalContentH += s.contentHeight;
    if (s.isLastSubLine) majorGapCount++;
    else totalWrappedGapsH += LAYOUT.WRAPPED_LINE_ROW_GAP;
  }
  if (pageSegments.length > 0) totalContentH += pageSegments.at(-1)!.contentHeight;

  let dynamicRowGap: number = LAYOUT.LINE_ROW_GAP;
  if (isFullPage && majorGapCount > 0) {
    const rawGap = (pageAvailH - totalContentH - totalWrappedGapsH) / majorGapCount;
    // 限制最大膨胀上限为默认行距的 1.35 倍，避免因整句跨页保护导致少行时行距被暴力拉伸至夸张间距
    const maxAllowedGap = LAYOUT.LINE_ROW_GAP * 1.35;
    dynamicRowGap = Math.min(maxAllowedGap, Math.max(LAYOUT.LINE_ROW_GAP, rawGap));
  }

  drawSegments(ctx, pageSegments, curY, {
    canvasW,
    pageMargin,
    colors,
    layoutAlign,
    showBarre,
    lyricsFontWeight,
    showWrappedLineMark,
    majorRowGap: dynamicRowGap,
  });

  return canvas.convertToBlob({ type: 'image/jpeg', quality: jpegQuality });
}
