/**
 * 乐谱导出 Worker 的公开类型契约。
 *
 * 从 scoreExportWorker.ts 抽出（原 15~101、106、316~325 行）。
 * 纯声明、零依赖：被 layout / fretboard / render / pages / 消息入口共同引用，位于依赖图最底层。
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
}

export type WorkerExportMessage =
  | { type: 'progress'; percent: number }
  | {
      type: 'complete';
      blobs: Blob[];
      /** a4 模式下每页覆盖的原始歌词行序号（升序去重），供外部按页重组内容；normal 模式为 undefined */
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

/** 渲染线程请求联合：整谱渲染 / 页脚合成（判别字段 kind） */
export type ScoreWorkerRequest = WorkerExportPayload | FooterComposePayload;

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
