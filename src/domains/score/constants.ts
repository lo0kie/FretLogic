/**
 * 乐谱领域常量：包含离屏导出尺寸、排版配置、主题配色以及防抖延时。
 */
import { FRETBOARD_CANVAS_CONFIG } from '@/domains/fretboard/constants';

/** 无标题乐谱导出/保存时使用的默认标题文案 */
export const DEFAULT_SCORE_TITLE = '歌词谱';

/** 乐谱离屏导出引擎（Worker / OffscreenCanvas）UI 尺寸、排版与主题配色常量 */
export const SCORE_EXPORT_CONFIG = {
  // ---- 画布与页面尺寸 ----
  /** A4 标准宽度（px @96dpi，210mm） */
  A4_WIDTH: 794,
  /** A4 标准高度（px @96dpi，297mm） */
  A4_HEIGHT: 1123,
  /** 导出页面安全边距（px，统一为 A4 标准 15mm 边距 56px） */
  PAGE_MARGIN: 56,
  /** 离屏绘制像素比（超采样抗锯齿） */
  PIXEL_RATIO: 2.0,
  /** 普通长图模式最小画布宽度（px，保证标题与表头排版舒展） */
  NORMAL_CANVAS_MIN_WIDTH: 520,
  /** 普通长图模式单行最大正文宽度（px，超出自动软折行） */
  NORMAL_CONTENT_MAX_WIDTH: 880,
  /** 表头元信息与首行歌词之间的间距（px） */
  HEADER_BOTTOM_GAP: 42,
  /** 标题与元信息行之间的垂直间距（px） */
  TITLE_TO_META_GAP: 14,

  // ---- 吉他指板图尺寸（几何单一来源：引用指板领域 FRETBOARD_CANVAS_CONFIG，避免双处声明漂移） ----
  getExportFretboardWidth: FRETBOARD_CANVAS_CONFIG.getExportFretboardWidth,
  FRETBOARD_WIDTH: FRETBOARD_CANVAS_CONFIG.FRETBOARD_WIDTH,
  STRING_SPACING: FRETBOARD_CANVAS_CONFIG.STRING_SPACING,
  FRET_HEIGHT: FRETBOARD_CANVAS_CONFIG.FRET_HEIGHT,
  FRETBOARD_LEFT_PAD: FRETBOARD_CANVAS_CONFIG.FRETBOARD_LEFT_PAD,
  FRETBOARD_GRID_TOP: FRETBOARD_CANVAS_CONFIG.FRETBOARD_GRID_TOP,
  DOT_RADIUS: FRETBOARD_CANVAS_CONFIG.DOT_RADIUS,
  BARRE_THICKNESS: FRETBOARD_CANVAS_CONFIG.BARRE_THICKNESS,
  NUT_HEIGHT: FRETBOARD_CANVAS_CONFIG.NUT_HEIGHT,
  CHORD_NAME_BASELINE_Y: FRETBOARD_CANVAS_CONFIG.CHORD_NAME_BASELINE_Y,
  MARKER_CENTER_Y: FRETBOARD_CANVAS_CONFIG.MARKER_CENTER_Y,
  MUTE_CROSS_RADIUS: FRETBOARD_CANVAS_CONFIG.MUTE_CROSS_RADIUS,
  OPEN_CIRCLE_RADIUS: FRETBOARD_CANVAS_CONFIG.OPEN_CIRCLE_RADIUS,

  // ---- 排版与文字布局（和弦贴近歌词，行与行之间拉开大间距） ----
  /** 歌词文字字号（px） */
  LYRICS_FONT_SIZE: 23,
  /** 和弦名称字号（px）——与指板渲染一致，引用单一来源 */
  CHORD_NAME_FONT_SIZE: FRETBOARD_CANVAS_CONFIG.CHORD_NAME_FONT_SIZE,
  // 以下 4 项为乐谱导出相对指板渲染的刻意排版差异（导出字号体系独立），保留本地值
  /** 和弦名称升降号上标字号（px） */
  ACCIDENTAL_FONT_SIZE: 11,
  /** 和弦名称升降号上标垂直偏移量（px，负值向上浮动） */
  ACCIDENTAL_SUPERSCRIPT_OFFSET: -5,
  /** 品号标记字号（px） */
  CAPO_TEXT_FONT_SIZE: 10,
  /** 品号文字距首弦的水平向左偏移量（px） */
  FRET_NUMBER_X_OFFSET: 3.8,
  /** 标题字号（px） */
  TITLE_FONT_SIZE: 32,
  /** 元信息（调号/变调夹）字号（px，加大） */
  META_FONT_SIZE: 18,
  /** 元信息调号升降号上标字号（px） */
  META_ACCIDENTAL_FONT_SIZE: 12,
  /** 元信息升降号上标垂直偏移量（px，负值向上浮动） */
  META_ACCIDENTAL_SUPERSCRIPT_OFFSET: -5,
  /** 普通空格宽度（px） */
  SPACE_CHAR_WIDTH: 18,
  /** 普通汉字/单字基准列宽（px） */
  REGULAR_CHAR_WIDTH: 30,
  /** 指板槽位额外列宽补偿（px） */
  CHORD_COLUMN_EXTRA_PAD: 8,
  /** 行内连续和弦间距（px） */
  INLINE_CHORD_GAP: 10,
  /** 边和弦与歌词正文间距（px） */
  EDGE_CHORD_SECTION_GAP: 6,
  /** 指板图底部与歌词字符之间的垂直间距（px，保持紧贴连贯） */
  CHORD_TO_LYRICS_GAP: 6,
  /** 歌词超长自动折行续行缩进量（px，首行顶格，续行悬挂缩进） */
  WRAPPED_LINE_INDENT: 32,
  /** 自动折行子行间的紧凑垂直行距（px，约为标准行距的一半） */
  WRAPPED_LINE_ROW_GAP: 18,
  /** 行与行之间的独立垂直行间距（px，拉开乐谱各行） */
  LINE_ROW_GAP: 36,
} as const;

/** 乐谱预览 A4 分页重新生成的防抖间隔（ms） */
export const SCORE_PREVIEW_DEBOUNCE_MS = 150;

/** 乐谱预览缩放：自定义缩放百分比下限（%） */
export const PREVIEW_MIN_ZOOM_PERCENT = 30;
/** 乐谱预览缩放：自定义缩放百分比上限（%） */
export const PREVIEW_MAX_ZOOM_PERCENT = 200;
/** 乐谱预览缩放：默认缩放百分比（%） */
export const PREVIEW_DEFAULT_ZOOM_PERCENT = 70;
/** 乐谱预览缩放：自适应模式下预留给上下呼吸的视口内边距（px，上下合计） */
export const PREVIEW_FIT_PADDING_PX = 48;
/** 乐谱预览缩放：Ctrl+滚轮/捏合的灵敏度（每像素 deltaY 对应的百分比变化） */
export const PREVIEW_WHEEL_ZOOM_SENSITIVITY = 0.15;
