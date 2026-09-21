/**
 * 页脚页码「合成层」。
 *
 * 页脚不参与页面栅格：A4 页面渲染只画内容（表头 + 歌词 + 指板），页脚由本模块在**两处**叠加：
 * - 预览展示：主线程在页图之上叠一张透明画布（ScorePageFooter.vue）画页码；
 * - 导出（PDF / ZIP / 复制·下载本页）：渲染线程把页图贴回整页画布后画页码再编码。
 *
 * 两处调用的是同一个 drawFooterMark、同一套常量与同一坐标系（页面逻辑 px），
 * 因此预览与导出逐像素同源；同时「显示页脚」不再进入预览缓存的内容键——
 * 切换开关只是多画/少画一行字，既不重渲染也不产生第二份缓存。
 */
import { SCORE_EXPORT_CONFIG } from '@/domains/score/constants';

/**
 * 页脚绘制上下文：主线程 CanvasRenderingContext2D 与渲染线程 OffscreenCanvasRenderingContext2D
 * 的公共子集（只用这四项，两条路径都能直接传入）。
 */
export type FooterDrawContext = Pick<CanvasRenderingContext2D, 'font' | 'fillStyle' | 'textAlign' | 'fillText'>;

export interface FooterMarkOptions {
  /** 页序号（从 0 起，绘制时 +1 显示） */
  pageIndex: number;
  /** 页面逻辑宽度（px @96dpi，与页面渲染坐标系一致） */
  width: number;
  /** 页面逻辑高度（px @96dpi） */
  height: number;
  /** 页边距（px）：页码基线落在底部页边距的中线上 */
  pageMargin: number;
  /** 文字色（弱化文字色，取值同导出配色 SUB_TEXT） */
  color: string;
}

/** 页脚文案（预览展示与导出共用，避免两处各自拼串漂移） */
export const footerTextOf = (pageIndex: number): string => `第 ${pageIndex + 1} 页`;

/** 页脚字号（px，逻辑坐标系） */
export const { FOOTER_FONT_SIZE } = SCORE_EXPORT_CONFIG;

/**
 * 在底部页边距内水平居中绘制页码。
 * 调用方负责把 ctx 变换设成「逻辑 px → 目标设备像素」的缩放，本函数只用逻辑坐标。
 */
export const drawFooterMark = (ctx: FooterDrawContext, opts: FooterMarkOptions): void => {
  ctx.font = `500 ${FOOTER_FONT_SIZE}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = opts.color;
  ctx.textAlign = 'center';
  ctx.fillText(footerTextOf(opts.pageIndex), opts.width / 2, opts.height - opts.pageMargin / 2);
};
