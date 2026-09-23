/**
 * 页脚页码「合成层」。
 *
 * 页脚不参与页面栅格：A4 页面渲染只画内容（表头 + 歌词 + 指板），页脚由本模块**统一在渲染线程**叠加：
 * 预览展示与导出（PDF / ZIP / 复制·下载本页）都走 Worker 的 composeFooterPages —— 把无页脚的页图
 * 贴回整页画布、画页码、重编码。主线程不参与绘制，因此也不必为这一行字加载那 1MB Sarasa 子集。
 *
 * 两侧用的是同一个 drawFooterMark、同一套常量与同一坐标系（页面逻辑 px），故逐像素同源；
 * 且「显示页脚」不进预览缓存的内容键——开关只切页流展示源（合成图 / 原图，按条目懒生成），
 * 既不重渲染乐谱，也不产生第二份缓存条目。
 *
 * 【字体由渲染线程自己装载】族栈由 services/scoreFonts 统一给出（与整张谱同一份 Sarasa 子集），
 * 但「哪些字体可用」绑在 font style source object 上 —— 渲染线程的 canvas 认自己的 FontFaceSet，
 * 故装载由 Worker 入口在首帧前 ensure（见 scoreExportWorker/index.ts）。漏了这一步，页码会静默按
 * 系统等宽回落，与页面文字不再同源。
 */
import { SCORE_EXPORT_CONFIG } from '@/domains/score/constants';

import { scoreFont } from './scoreFonts';

/**
 * 页脚绘制上下文：CanvasRenderingContext2D 与 OffscreenCanvasRenderingContext2D 的公共子集
 * （只用这四项）。当前唯一调用方是渲染线程，但取公共子集而非具体类型，使两侧都能直接传入。
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

/** 页脚字重：直接点名 Regular（400）。子集只有 300 / 400 / 700 三档，字重表里没有 500 —— 与其写 500
 *  让 CSS 匹配规则去猜（落点取决于该环境注册了哪几档），不如直接取真正用到的那一档，两侧装载的也是它。 */
export const SCORE_FOOTER_FONT_WEIGHT = 400;

/**
 * 在底部页边距内水平居中绘制页码。
 * 调用方负责把 ctx 变换设成「逻辑 px → 目标设备像素」的缩放，本函数只用逻辑坐标。
 */
export const drawFooterMark = (ctx: FooterDrawContext, opts: FooterMarkOptions): void => {
  ctx.font = scoreFont(SCORE_FOOTER_FONT_WEIGHT, FOOTER_FONT_SIZE);
  ctx.fillStyle = opts.color;
  ctx.textAlign = 'center';
  ctx.fillText(footerTextOf(opts.pageIndex), opts.width / 2, opts.height - opts.pageMargin / 2);
};
