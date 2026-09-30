/**
 * 乐谱领域常量：包含离屏导出尺寸、排版配置、主题配色以及防抖延时。
 *
 * **指板几何不在此声明**：导出侧的指板（品高、弦距、留白、圆点、字号……）全部由
 * `model/fretboardGeometry` 的工厂按「和弦缩放」派生，本文件只保留指板**之外**的排版量
 * （歌词字号与字宽、行距、列间距、页边距、表头字号）。
 */

import { isString } from '@/platform/utils/common';

import type { ScorePageMargin, ScorePageSizeId } from '@/platform/types';

/** 无标题乐谱导出/保存时使用的默认标题文案 */
export const DEFAULT_SCORE_TITLE = '歌词谱';

/**
 * 乐谱拍号预设选项（配置弹窗下拉 + 文本导入导出共用同一取值域）。
 *
 * `as const` 而非 `readonly string[]`：后者把 7 个预设值的字面量信息在类型层抹掉，
 * 消费方（下拉、筛选）拿到的只是 `string`，新增档位时漏改任一映射表都不会报错。
 * 联合由本表派生（`SongTimeSignature`），与 `FRET_COUNTS` / `Chord.fretCount` 同一手法。
 */
export const SONG_TIME_SIGNATURES = ['2/4', '3/4', '4/4', '6/8', '12/8', '5/4', '7/8'] as const;

/** 拍号预设档位（本表是唯一真相源） */
export type SongTimeSignature = (typeof SONG_TIME_SIGNATURES)[number];

/**
 * 拍号**格式**校验（分子/分母各 1~2 位数字）；'' 表示未设置，由调用方单独处理。
 *
 * 刻意比 `SONG_TIME_SIGNATURES` 宽：拍号是纯展示元数据，而导入的文本谱里 `9/8`、`11/8`
 * 这类合法但未列入预设的拍号很常见 —— 收紧成「成员判定」会把它们静默清成空值（用户看到的是
 * 拍号在导入后凭空消失），那是行为回归而不是类型收口。故本函数只认格式；要收窄到预设集用
 * `isSongTimeSignature`。
 *
 * 谓词写成 `value is string` 而非 `boolean`：入参是 `unknown`（清洗层与文本解析拿到的都是
 * `unknown`），这一步把 `unknown` 收窄成 `string`，调用方才敢直接把它写进 `Song.timeSignature`。
 */
export const isTimeSignatureFormat = (value: unknown): value is string =>
  isString(value) && /^\d{1,2}\/\d{1,2}$/.test(value);

/** 拍号是否属于预设档位（下拉/筛选等需要收窄到 `SongTimeSignature` 的场合用） */
export const isSongTimeSignature = (value: unknown): value is SongTimeSignature =>
  isString(value) && (SONG_TIME_SIGNATURES as readonly string[]).includes(value);

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
  /** 相邻两张指板图之间的最小缝隙（px）：图锚定所在字符的字形中心，中心距不足「框宽 + 本值」
   *  时把内容右推（见 scoreExportLayout 的 chordFigurePush） */
  CHORD_COLUMN_EXTRA_PAD: 4,
  /** 行内连续和弦间距（px） */
  INLINE_CHORD_GAP: 0,
  /** 边和弦与歌词正文间距（px） */
  EDGE_CHORD_SECTION_GAP: 6,
  /** 指板图底部与歌词字符之间的垂直间距（px，保持紧贴连贯） */
  CHORD_TO_LYRICS_GAP: 6,
  /** 歌词超长自动折行续行缩进量（px，首行顶格，续行悬挂缩进）。
   *  量纲取**汉字格**（`REGULAR_CHAR_WIDTH` = 30）：原 32 约一格，现 62 约两格 —— 退一格时续行
   *  与首行首字几乎齐平，看不出「这是上一行的继续」，退两格才有可辨的悬挂层次。 */
  WRAPPED_LINE_INDENT: 50,
  /** 自动折行子行间的紧凑垂直行距（px）。
   *  与 `LINE_ROW_GAP` 是**两个口径**：折出来的子行同属一个歌词行，它们之间的间距要明显小于
   *  「行与行之间」，读起来才是一整句而不是几句。当前取标准行距的三分之一（原为二分之一）。 */
  WRAPPED_LINE_ROW_GAP: 12,
  /** 行与行之间的独立垂直行间距（px，拉开乐谱各行） */
  LINE_ROW_GAP: 36,
  /**
   * 折行续行行首的**提示符**：一条**弯折线**（画在续行缩进那段留白里的直角折线）。
   *
   * 形状是「竖臂朝上 + 折角在左下 + 横臂朝右」的 L 形：竖臂指着上面那一行（这一行是它的继续），
   * 横臂指向本行正文（内容从这里接着往下读）。**刻意不画箭头**：箭头表达的是「往那个方向去」，
   * 而这里要说的只是「从上面折下来」—— 一个折角比一个箭头贴切，也不必再纠结箭头该指哪儿
   *（此前用过 `↩`(U+21A9) 与 `↖`(U+2196)，两次都卡在「到底指向哪」上）。
   *
   * 为什么改画折线、不再用字符：① 字符的粗细、折角、臂长全不可控，换个字重形状就变；
   * ② 它依赖随包字体子集里正好有那个字形（换符号要先翻 scripts/build-font-subset.py 的码位区间，
   * 缺字形会静默回落到系统字体，风格与整谱不一致）。画折线则三样都由本文件给定。
   *
   * 本值 = 折线的**臂长**（px）：竖臂与横臂等长，折线因此落在一个 SIZE × SIZE 的方框里，
   * 方框的**左下角**锚在「续行缩进段起点 × 歌词基线」上（见 scoreExportRender 的 renderScoreLine）——
   * 竖臂朝上、高约一个字身，横臂落在基线上、指向首字。
   *
   * 它**不占任何排版量**：不进 `chars`、不进段宽、不参与折行判定与两端对齐，只是绘制阶段叠上去的
   * 一笔（见 scoreExportRender 的 renderScoreLine）。横向落点由 `WRAPPED_LINE_INDENT` 给出：
   * 折线整条落在缩进段里，与首字之间隔着剩下的缩进量。
   */
  WRAPPED_LINE_MARK_SIZE: 14,
  /**
   * 折行提示符的**线宽**（px）：比歌词笔画粗一档，才在那段留白里立得住 ——
   * 它是一根孤零零的线，没有字形的墨迹量，按正文字重画会显得发飘。
   *
   * 折角的圆化半径由本值派生（见 scoreExportRender 的 renderScoreLine），不另立常量：
   * 圆角是线宽的观感修正，不是一条独立可调的排版量。倍率 2.5 —— 现约合臂长的一半，折角是个接近
   * 完整的四分之一圆；本值调小时半径跟着小，臂长调小时则由臂长那一侧的夹取兜住（半径不得超过臂长，
   * 否则折角的两条直臂互相反向）。
   */
  WRAPPED_LINE_MARK_STROKE: 3,
  /**
   * 折行提示符的不透明度（0~1）：它是提示、不是正文，得比歌词**弱一档**才不抢词。
   *
   * 只靠次级色（`SUB_TEXT`）不够：暗色主题下那是 `#a1a1aa`，与歌词的亮度差距很小，画出来几乎
   * 与正文同重。再乘一道 alpha 才拉开层次 —— 且**不新增配色令牌**：令牌要跟着主题一起维护，
   * 而这里要的只是「同一支次级色、更淡一点」，是绘制参数而不是主题决策。
   *
   * 本值是**按用户反馈一路调下来的**（用户三次提「太亮」：0.45 仍偏抢眼 → 0.2，现再降到 0.1）。
   * 要再调只动这里 —— 它同时是提示符唯一的「深浅」旋钮，线宽只管粗细、不管深浅。
   */
  WRAPPED_LINE_MARK_ALPHA: 0.1,
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
/** 乐谱预览缩放：开启捏合会话的最小两指间距（px） */
export const PREVIEW_MIN_PINCH_SPAN_PX = 24;

/** 排列和弦界面缩放手势：百分比下限（%） */
export const ARRANGE_VIEW_MIN_ZOOM_PERCENT = 50;
/** 排列和弦界面缩放手势：百分比上限（%） */
export const ARRANGE_VIEW_MAX_ZOOM_PERCENT = 200;
/** 排列和弦界面缩放手势：Ctrl+滚轮 / 触控板捏合的灵敏度（每像素 deltaY 对应的百分比变化） */
export const ARRANGE_VIEW_WHEEL_ZOOM_SENSITIVITY = 0.15;
/** 排列和弦界面缩放手势：开启捏合会话的最小两指间距（px） */
export const ARRANGE_VIEW_MIN_PINCH_SPAN_PX = 24;

/** 预览/导出页边距标准档位（px @96dpi，对应 A4 标准 10/15/20mm 边距；默认取「标准」56px）。
 *  `satisfies` 让本表与平台层的值域 `ScorePageMargin` 在编译期对齐 —— 档位值改动漏改任一侧即报错。 */
export const SCORE_PAGE_MARGIN_PRESETS = [
  { label: '窄', value: 38 },
  { label: '标准', value: 56 },
  { label: '宽', value: 76 },
] as const satisfies readonly { label: string; value: ScorePageMargin }[];

/**
 * 预览/导出标准单页尺寸档位：px @96dpi 供渲染与预览（默认取 A4），
 * mm 供打印纸张尺寸使用（标准纸型标称值，与 px 档位同源，不做 px↔mm 换算以避开取整误差）。
 *
 * 值域 `ScorePageSizeId` 定义在平台层（它同时是 `settingsStore` 的持久化值域），本表用
 * `satisfies` 向它对齐；`id` 因此不再是一份「只有隐式字面量、外部拿不到」的私有联合。
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
] as const satisfies readonly {
  id: ScorePageSizeId;
  label: string;
  width: number;
  height: number;
  widthMm: number;
  heightMm: number;
}[];

/** 按档位 id 解析页面宽高（A4 794×1123 / A5 559×794 / Letter 816×1056 px @96dpi）；未知 id 回退 A4 */
export const getScorePageSize = (id: ScorePageSizeId): { width: number; height: number } =>
  SCORE_PAGE_SIZE_PRESETS.find(p => p.id === id) ?? {
    width: SCORE_EXPORT_CONFIG.A4_WIDTH,
    height: SCORE_EXPORT_CONFIG.A4_HEIGHT,
  };

/** 按档位 id 解析单页物理尺寸（mm，打印纸张尺寸基准）；未知 id 回退 A4 */
export const getScorePageSizeMm = (id: ScorePageSizeId): { widthMm: number; heightMm: number } => {
  const preset = SCORE_PAGE_SIZE_PRESETS.find(p => p.id === id);
  return preset
    ? { widthMm: preset.widthMm, heightMm: preset.heightMm }
    : { widthMm: SCORE_EXPORT_CONFIG.A4_WIDTH_MM, heightMm: SCORE_EXPORT_CONFIG.A4_HEIGHT_MM };
};
