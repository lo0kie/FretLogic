/**
 * 乐谱导出 Worker 的分页与导出层：整页画布复用、A4 装箱、长图渲染、页脚合成。
 *
 * 从 scoreExportWorker.ts 抽出（原 1084~1395 行）。
 * 处在依赖图倒数第二层：单向依赖 layout / render / types，只被消息入口调用。
 */

import { getScorePageSize } from '@/domains/score/constants';
import { drawFooterMark } from '@/domains/score/preview/services/footerOverlay';

import { EXPORT_JPEG_QUALITY, LAYOUT, requireContext2D, wrapScoreLines } from './scoreExportLayout';
import { getHeaderHeight, renderHeader, renderScoreLine } from './scoreExportRender';

import type {
  ExportLineItem,
  FooterComposePayload,
  RenderSegment,
  ThemeColors,
  WorkerExportMessage,
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

/** 取整页画布与上下文（需要时按新尺寸重建），返回前已重置变换、清底交由调用方填充背景 */
function acquirePageCanvas(
  width: number,
  height: number
): { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D } {
  const deviceW = Math.round(width * LAYOUT.PIXEL_RATIO);
  const deviceH = Math.round(height * LAYOUT.PIXEL_RATIO);
  let pool = pagePool;
  if (!pool || pool.canvas.width !== deviceW || pool.canvas.height !== deviceH) {
    const canvas = new OffscreenCanvas(deviceW, deviceH);
    pool = { canvas, ctx: requireContext2D(canvas) };
    pagePool = pool;
  }
  const { canvas, ctx } = pool;
  // 必须 setTransform 而非 scale：复用画布要重置变换，否则缩放逐页累乘
  ctx.setTransform(LAYOUT.PIXEL_RATIO, 0, 0, LAYOUT.PIXEL_RATIO, 0, 0);
  return { canvas, ctx };
}

/**
 * 页脚合成：把无页脚的页面图贴回整页画布 → 画页码 → 重编码为 JPEG。
 *
 * 页面栅格与页脚解耦的原因：若页脚画进页面栅格，「显示页脚」便成了内容的一部分，
 * 预览缓存必须为开关两态各存一份（同一首歌两份条目、字节数翻倍）。改为合成层后只留一份
 * 无页脚页面；代价是导出时多一次 JPEG 编码（质量档位与页面渲染相同，视觉无损级）。
 */
export async function composeFooterPages(payload: FooterComposePayload): Promise<Blob[]> {
  const { width, height } = getScorePageSize(payload.pageSize ?? 'a4');
  const pageMargin = payload.pageMargin ?? LAYOUT.PAGE_MARGIN;
  const quality = Math.min(1, Math.max(0.3, payload.exportQuality ?? EXPORT_JPEG_QUALITY));
  const { canvas, ctx } = acquirePageCanvas(width, height);

  const blobs: Blob[] = [];
  for (let i = 0; i < payload.pages.length; i++) {
    // 页图为设备像素（逻辑尺寸 × PIXEL_RATIO），贴图用恒等变换保证 1:1 不重采样
    const bitmap = await createImageBitmap(payload.pages[i]!);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    // 回到逻辑坐标系画页码：与预览展示层共用同一绘制函数，字号/位置逐像素同源
    ctx.setTransform(LAYOUT.PIXEL_RATIO, 0, 0, LAYOUT.PIXEL_RATIO, 0, 0);
    drawFooterMark(ctx, {
      pageIndex: payload.pageIndexes?.[i] ?? i,
      width,
      height,
      pageMargin,
      color: payload.color,
    });

    blobs.push(await canvas.convertToBlob({ type: 'image/jpeg', quality }));
    self.postMessage({
      type: 'progress',
      percent: Math.round(((i + 1) / payload.pages.length) * 100),
    } as WorkerExportMessage);
  }
  return blobs;
}

/**
 * 长图模式离屏渲染：自适应最宽行宽度绘制整曲为单张 JPEG，返回 Blob。
 * 供「下载为长图」导出与「预估文件尺寸」估算两处复用——估算即真实渲染后取 blob.size，
 * 因此预估值与最终导出文件字节数一致（仅取整误差）。
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

  const { canvas, ctx } = acquirePageCanvas(canvasW, canvasH);

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
