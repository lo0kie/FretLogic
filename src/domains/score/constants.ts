/**
 * 乐谱领域常量：包含离屏导出尺寸、排版配置、主题配色以及防抖延时。
 *
 * **指板几何不在此声明**：导出侧的指板（品高、弦距、留白、圆点、字号……）全部由
 * `model/fretboardGeometry` 的工厂按「和弦缩放」派生，本文件只保留指板**之外**的排版量
 * （歌词字号与字宽、行距、列间距、页边距、表头字号）。
 */

/** 无标题乐谱导出/保存时使用的默认标题文案 */
export const DEFAULT_SCORE_TITLE = '歌词谱';

/** 乐谱拍号预设选项（配置弹窗下拉 + 文本导入导出共用同一取值域） */
export const SONG_TIME_SIGNATURES: readonly string[] = ['2/4', '3/4', '4/4', '6/8', '12/8', '5/4', '7/8'];

/** 拍号格式校验（分子/分母各 1~2 位数字）；'' 表示未设置，由调用方单独处理 */
export const isValidTimeSignature = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{1,2}\/\d{1,2}$/.test(value);

/** 乐谱离屏导出引擎（Worker / OffscreenCanvas）UI 尺寸、排版与主题配色常量 */
export const SCORE_EXPORT_CONFIG = {
  // ---- 画布与页面尺寸 ----
  /** A4 标准宽度（px @96dpi，210mm） */
  A4_WIDTH: 794,
  /** A4 标准高度（px @96dpi，297mm） */
  A4_HEIGHT: 1123,
  /** A4 标准宽度（mm，打印纸张物理尺寸基准；px 档位是其 @96dpi 取整值，二者同源但不可互相推导） */
  A4_WIDTH_MM: 210,
  /** A4 标准高度（mm，打印纸张物理尺寸基准） */
  A4_HEIGHT_MM: 297,
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

  // ---- 排版与文字布局（和弦贴近歌词，行与行之间拉开大间距） ----
  /** 歌词文字字号（px） */
  LYRICS_FONT_SIZE: 23,
  /** 标题字号（px） */
  TITLE_FONT_SIZE: 32,
  /** 歌手副标题字号（px，仅 singer 非空时绘制于标题下方） */
  SINGER_SUBTITLE_FONT_SIZE: 18,
  /** 歌手副标题与标题/元信息行之间的垂直间距（px） */
  SINGER_SUBTITLE_GAP: 10,
  /** 元信息（调号/变调夹）字号（px，加大） */
  META_FONT_SIZE: 18,
  /** 元信息调号升降号上标字号（px） */
  META_ACCIDENTAL_FONT_SIZE: 12,
  /** 元信息升降号上标垂直偏移量（px，负值向上浮动） */
  META_ACCIDENTAL_SUPERSCRIPT_OFFSET: -5,
  /** 页脚页码字号（px，A4 分页预览/导出底部居中） */
  FOOTER_FONT_SIZE: 12,
  /** 普通空格宽度（px） */
  SPACE_CHAR_WIDTH: 18,
  /** 普通汉字/单字基准列宽（px） */
  REGULAR_CHAR_WIDTH: 30,
  /** 指板槽位额外列宽补偿（px；指板居中于槽位，故实际表现为左右各半的边距） */
  CHORD_COLUMN_EXTRA_PAD: 4,
  /** 行内连续和弦间距（px） */
  INLINE_CHORD_GAP: 0,
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
/** 乐谱预览缩放：Ctrl+滚轮/捏合的灵敏度（每像素 deltaY 对应的百分比变化） */
export const PREVIEW_WHEEL_ZOOM_SENSITIVITY = 0.15;

/** 预览/导出页边距标准档位（px @96dpi，对应 A4 标准 10/15/20mm 边距；默认取「标准」56px） */
export const SCORE_PAGE_MARGIN_PRESETS = [
  { label: '窄', value: 38 },
  { label: '标准', value: 56 },
  { label: '宽', value: 76 },
] as const;

/**
 * 预览/导出标准单页尺寸档位：px @96dpi 供渲染与预览（默认取 A4），
 * mm 供打印纸张尺寸使用（标准纸型标称值，与 px 档位同源，不做 px↔mm 换算以避开取整误差）。
 */
export const SCORE_PAGE_SIZE_PRESETS = [
  {
    id: 'a4',
    label: 'A4',
    width: SCORE_EXPORT_CONFIG.A4_WIDTH,
    height: SCORE_EXPORT_CONFIG.A4_HEIGHT,
    widthMm: SCORE_EXPORT_CONFIG.A4_WIDTH_MM,
    heightMm: SCORE_EXPORT_CONFIG.A4_HEIGHT_MM,
  },
  { id: 'a5', label: 'A5', width: 559, height: 794, widthMm: 148, heightMm: 210 },
  { id: 'letter', label: 'Letter', width: 816, height: 1056, widthMm: 215.9, heightMm: 279.4 },
] as const;

/** 按档位 id 解析页面宽高（A4 794×1123 / A5 559×794 / Letter 816×1056 px @96dpi）；未知 id 回退 A4 */
export const getScorePageSize = (id: string): { width: number; height: number } =>
  SCORE_PAGE_SIZE_PRESETS.find(p => p.id === id) ?? {
    width: SCORE_EXPORT_CONFIG.A4_WIDTH,
    height: SCORE_EXPORT_CONFIG.A4_HEIGHT,
  };

/** 按档位 id 解析单页物理尺寸（mm，打印纸张尺寸基准）；未知 id 回退 A4 */
export const getScorePageSizeMm = (id: string): { widthMm: number; heightMm: number } => {
  const preset = SCORE_PAGE_SIZE_PRESETS.find(p => p.id === id);
  return preset
    ? { widthMm: preset.widthMm, heightMm: preset.heightMm }
    : { widthMm: SCORE_EXPORT_CONFIG.A4_WIDTH_MM, heightMm: SCORE_EXPORT_CONFIG.A4_HEIGHT_MM };
};
