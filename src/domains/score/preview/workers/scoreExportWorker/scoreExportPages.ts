/**
 * 乐谱导出 Worker 的分页与导出层：整页画布复用、A4 装箱、长图渲染、页脚合成。
 *
 * 从 scoreExportWorker.ts 抽出（原 1084~1395 行）。
 * 处在依赖图倒数第二层：单向依赖 layout / render / types，只被消息入口调用。
 */

import { getScorePageSize } from '@/domains/score/constants';
import { drawFooterMark } from '@/domains/score/preview/services/footerOverlay';

import { throwIfAborted } from './scoreExportAbort';
import { EXPORT_JPEG_QUALITY, LAYOUT, requireContext2D, wrapScoreLines } from './scoreExportLayout';
import { getHeaderHeight, renderHeader, renderScoreLine } from './scoreExportRender';

import type { ExportLineItem, FooterComposePayload, RenderSegment, ThemeColors } from './scoreExportTypes';

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
  const ratio = Math.min(LAYOUT.PIXEL_RATIO, (MAX_CANVAS_EDGE - 1) / Math.max(width, height));
  if (ratio >= MIN_LONG_IMAGE_RATIO) return ratio;

  throw new Error(
    `乐谱过长：长图即使在最小可读比例（${MIN_LONG_IMAGE_RATIO}×）下也需 ` +
      `${Math.ceil(height * MIN_LONG_IMAGE_RATIO)}px 高度，超出浏览器单张图片上限（${MAX_CANVAS_EDGE}px）。` +
      '请改用「下载为 PDF」或「下载为 ZIP」分页导出。'
  );
}

/**
 * 取整页画布与上下文（需要时按新尺寸重建），返回前已重置变换、清底交由调用方填充背景。
 * ratio 缺省为 PIXEL_RATIO 的超采样；长图高度无界，由调用方传入按内容反推的合法比例。
 */
function acquirePageCanvas(
  width: number,
  height: number,
  ratio: number = LAYOUT.PIXEL_RATIO
): { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D } {
  const deviceW = Math.round(width * ratio);
  const deviceH = Math.round(height * ratio);
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
export async function composeFooterPage(page: Blob, pageIndex: number, opts: FooterPageOptions): Promise<Blob> {
  const { canvas, ctx } = acquirePageCanvas(opts.width, opts.height);
  // 页图为设备像素（逻辑尺寸 × PIXEL_RATIO），贴图用恒等变换保证 1:1 不重采样
  const bitmap = await createImageBitmap(page);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  // 回到逻辑坐标系画页码：与预览展示层共用同一绘制函数，字号/位置逐像素同源
  ctx.setTransform(LAYOUT.PIXEL_RATIO, 0, 0, LAYOUT.PIXEL_RATIO, 0, 0);
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

  const blobs: Blob[] = [];
  for (let i = 0; i < payload.pages.length; i++) {
    // 页边界即中断点：每页都要 await createImageBitmap（解码上一张 JPEG）+ convertToBlob（重编码），
    // 本笔被作废（切歌）时这些产物全部丢弃，没必要把剩下的页继续贴完、继续占着渲染线程。
    // 本层是唯一能拦住页脚合成的地方 —— 它对整谱渲染不是「派生的展示料」而是同一条串行队列上的
    // 一大段编码，不中断就会把新歌的渲染整段挡在后面。
    throwIfAborted();
    // 页序取**真实页序**而非数组下标 —— 合成批只覆盖「缺页脚的那几页」，下标与页序不是一回事
    const pageIndex = payload.pageIndexes?.[i] ?? i;
    const blob = await composeFooterPage(payload.pages[i]!, pageIndex, opts);
    blobs.push(blob);
    onFooterPage?.(pageIndex, blob);
  }
  return blobs;
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
export async function renderLongImageBlob(
  lines: ExportLineItem[],
  title: string,
  singer: string,
  keyText: string,
  capoText: string,
  timeSignatureText: string,
  colors: ThemeColors,
  layoutAlign: 'start' | 'center',
  showBarre: boolean,
  lyricsFontWeight: number,
  jpegQuality: number,
  pageMargin: number,
  ignoreEmptySpace: boolean
): Promise<Blob> {
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
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.fillStyle = colors.BG;
  ctx.fillRect(0, 0, canvasW, canvasH);

  let curY: number = pageMargin;
  curY = renderHeader(ctx, title, singer, keyText, capoText, timeSignatureText, canvasW, curY, colors);

  for (let i = 0; i < allSegments.length; i++) {
    const seg = allSegments[i]!;
    const isLast = i === allSegments.length - 1;
    const defaultGap = seg.isLastSubLine ? LAYOUT.LINE_ROW_GAP : LAYOUT.WRAPPED_LINE_ROW_GAP;
    const rowGap = isLast ? 0 : defaultGap;
    const segW = seg.width;
    const isCenter = layoutAlign === 'center';
    const startX = isCenter
      ? Math.max(pageMargin, Math.round((canvasW - segW) / 2)) + (seg.isContinuation ? LAYOUT.WRAPPED_LINE_INDENT : 0)
      : pageMargin + (seg.isContinuation ? LAYOUT.WRAPPED_LINE_INDENT : 0);
    const res = renderScoreLine(ctx, seg, startX, curY, colors, showBarre, lyricsFontWeight, rowGap, ignoreEmptySpace);
    curY = res.nextY;
  }

  return canvas.convertToBlob({ type: 'image/jpeg', quality: jpegQuality });
}

/**
 * A4 分页装箱：软折行后的分段按页高动态装箱。
 * - 整句歌词跨页断裂保护：原始行首个分段放不下整句但全新一页放得下时，提前开新页；
 * - 页首空行优化：新页尚未放入任何歌词时跳过纯空行，避免页首留白。
 */
export function packA4Pages(allSegments: RenderSegment[], contentHeight: number, headerH: number): RenderSegment[][] {
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
    const lastSeg = curPageSegments[curPageSegments.length - 1];
    const gap = lastSeg ? (lastSeg.isLastSubLine ? LAYOUT.LINE_ROW_GAP : LAYOUT.WRAPPED_LINE_ROW_GAP) : 0;

    let willOverflow = false;

    // 整句歌词跨页保护：当这是一个原始歌词行的首个分段时，前瞻该原始行所有分段的总高度
    if (!seg.isContinuation && curPageSegments.length > 0) {
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
  jpegQuality: number;
  /** 无和弦空格是否零宽（须与装箱前的软折行同一取值） */
  ignoreEmptySpace: boolean;
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
    jpegQuality,
    ignoreEmptySpace,
  } = opts;

  const { canvas, ctx } = acquirePageCanvas(canvasW, canvasH);

  // 清底后铺背景：画布复用，背景色若含透明度则需先清掉上一页残留
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.fillStyle = colors.BG;
  ctx.fillRect(0, 0, canvasW, canvasH);

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
  if (pageSegments.length > 0) totalContentH += pageSegments[pageSegments.length - 1]!.contentHeight;

  let dynamicRowGap: number = LAYOUT.LINE_ROW_GAP;
  if (isFullPage && majorGapCount > 0) {
    const rawGap = (pageAvailH - totalContentH - totalWrappedGapsH) / majorGapCount;
    // 限制最大膨胀上限为默认行距的 1.35 倍，避免因整句跨页保护导致少行时行距被暴力拉伸至夸张间距
    const maxAllowedGap = LAYOUT.LINE_ROW_GAP * 1.35;
    dynamicRowGap = Math.min(maxAllowedGap, Math.max(LAYOUT.LINE_ROW_GAP, rawGap));
  }

  for (let i = 0; i < pageSegments.length; i++) {
    const seg = pageSegments[i]!;
    const isLastInPage = i === pageSegments.length - 1;
    const defaultGap = seg.isLastSubLine ? dynamicRowGap : LAYOUT.WRAPPED_LINE_ROW_GAP;
    const rowGap = isLastInPage ? 0 : defaultGap;
    const segW = seg.width;
    const isCenter = layoutAlign === 'center';
    const startX = isCenter
      ? Math.max(pageMargin, Math.round((canvasW - segW) / 2)) + (seg.isContinuation ? LAYOUT.WRAPPED_LINE_INDENT : 0)
      : pageMargin + (seg.isContinuation ? LAYOUT.WRAPPED_LINE_INDENT : 0);
    const res = renderScoreLine(ctx, seg, startX, curY, colors, showBarre, lyricsFontWeight, rowGap, ignoreEmptySpace);
    curY = res.nextY;
  }

  return canvas.convertToBlob({ type: 'image/jpeg', quality: jpegQuality });
}
