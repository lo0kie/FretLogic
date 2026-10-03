/**
 * 排列和弦区**一行的 canvas 排版**：把一行歌词（字符槽 + 两侧边和弦槽 + 两个添加槽 + 行号 +
 * 行末删除钮）算成一份「几何表」，同时驱动绘制与命中测试。
 *
 * 为什么是纯函数 + 一张表：canvas 化之后浏览器不再替我们排版 —— 命中测试必须与所见**逐像素**
 * 同源，唯一可靠的做法是「同一份矩形表既用来画、也用来命中」。任何一处各自算一遍（例如绘制按
 * flex 自然撑开、命中按另一套估算）都会让「点得中」与「看得见」错位，且不会报错。
 *
 * 度量常量与 Tailwind 类一一对应（`p-0.5` / `gap-2xs` / `mx-md` / `text-2xs` …），改版式时
 * 两份要一起改：这是 canvas 化的固有代价 —— 排版从 CSS 搬到了 JS，CSS 侧不再是真相源。
 * 常量集中在本文件顶部，就是为了把这份代价收在一处。
 *
 * 与 DOM 版的两处**有意的**简化（都在注释里点名，不是漏掉的）：
 * 1. 拖拽落点行不再把槽撑到 `min-h-[108px]`（那要重排行内几何）：落点反馈只落在**落点槽**那一圈
 *    实线框上，行级不画任何框 —— 行高因此不会在拖拽中跳变（行级反馈由行自身的悬停底色 / 边框承担）；
 * 2. 槽级 hover 不再改槽的几何，只在绘制侧换底色。
 */
import { SCORE_EXPORT_CONFIG } from '@/domains/score/constants';
import { chordCardCanvasSizePx } from '@/domains/score/editor/lineCardHeight';
import { isClient } from '@/platform/utils/common';
import { rootFontSizePx } from '@/platform/utils/dom';

import type { Chord } from '@/domains/chord/types';
import type { LineData } from '@/domains/score/preview/services/scoreExportCanvas';
import type { SlotKey } from '@/domains/score/types';

// ---- 度量常量：与槽 / 行 / 字形的 Tailwind 类一一对应 ----
//
// ⚠️ 一律以 **rem** 记录，运行时乘根字号（`rootFontSizePx()`）—— 与 Tailwind 的 `--spacing-*` 标度
// 同源（见 `assets/tailwind.css` 的 `--spacing-3xs: 0.125rem` 起那一组）。此前这里直接写 px，
// 且按「1 单位 = 4px」的直觉填了 2 / 4 / 8 / 12；而本项目根字号是 22.25px，Tailwind 的
// `p-0.5` 是 0.125rem（2.78px）、`gap-2xs` 是 0.25rem（5.56px）、`mx-md` 是 0.75rem（16.69px）——
// 于是全线偏小，观感就是「内容挤在一起」。改间距时照 Tailwind 的 rem 值填，**不要填 px**。

/** 槽根内边距（`SLOT_SHELL_CLASS` 的 `p-0.5`） */
const SLOT_PAD_REM = 0.125;
/** 字形横向内边距（`SLOT_GLYPH_CLASS` 的 `px-0.5`） */
const GLYPH_PAD_X_REM = 0.125;
/**
 * 指板图卡与字符行之间的间距。
 *
 * DOM 版是 `is-content-slot` 的 `gap-2xs`（0.25rem），这里**再进一档**取 `gap-xs`（0.375rem）——
 * 按用户「加一点和弦和歌词之间的间距」的要求：卡片底沿与歌词字符之间原来只有 0.25rem，
 * 指板图与文字几乎贴在一起。
 */
const CONTENT_GAP_REM = 0.375;
/** 指板图卡的描边宽度（`.inline-fretboard-card` 的 `border`，1px 与 rem 标度无关） */
const CARD_BORDER = 1;
/**
 * 行框内边距（`.lyrics-line` 的 `p-2xs`）—— 即内容与行左右两端的留白。
 *
 * DOM 版是 `p-2xs`（0.25rem），这里**再进一档**取 0.375rem，按用户「还有行首尾间距」的要求：
 * 行首的行号与行尾的删除钮都贴行框太近。
 */
const LINE_PAD_REM = 0.375;
/** 行框边框宽度（`.lyrics-line` 的 `border`） */
const LINE_BORDER = 1;
/** 行号与紧随其后的行首添加槽之间的间距（行号容器的 `mr-2`） */
const LINE_INDEX_GAP_REM = 0.5;
/** 行首 / 行尾添加槽的左右外边距（`mx-md`） */
const ADD_SLOT_MARGIN_X_REM = 0.75;
/** 与左侧相邻和弦紧邻时补的左外边距（`is-left-adjacent` 的 `ml-[0.15rem]`） */
const LEFT_ADJACENT_GAP_REM = 0.15;
/**
 * 槽上那枚「清除和弦」钮的边长 ÷ 行内图标钮边长。
 *
 * 不写成一个 px：它与行首 / 行尾的「+」、行末删除钮是**同一族控件**（都坐在槽附近、都只画一个图标），
 * 那三枚的档位由宿主按断点折算（见 ScoreInteractiveArea 的 actionButtonSize）——清除钮若钉死像素，
 * 窄屏降到 sm 档时它会相对变大、桌面在 md 档时又相对变小。取固定比例后它与那三枚同源：
 * 0.567 × md（1.9rem × 22.25px ≈ 42.3px）≈ 24px，正是此前的观感；窄屏 sm 档下随之收到 ≈ 20px。
 */
const REMOVE_BUTTON_SIZE_RATIO = 0.567;
/**
 * 槽上清除钮相对槽右上角的位移。
 *
 * DOM 版把它放在槽**外**上方（`-top-2 -right-1`），canvas 版放不出去 —— 画不出自身位图之外的像素。
 * 但行画布的顶沿到槽顶之间还有一整段行框内边距（`lineInset`）可用，故这里把钮**上提**到贴近行顶、
 * **右移**到略微越出槽右沿：视觉上它落在卡片的右上角外沿（少遮指板图），又不会被行画布裁掉。
 * ⚠️ 上提量受 `lineInset` 约束（代码里用 `Math.max(0, …)` 钳住）：超出即被裁，圆角与图标顶部会缺一块。
 */
const REMOVE_BUTTON_RISE_REM = 0.25;
const REMOVE_BUTTON_OFFSET_X_REM = 0.125;

/**
 * 折行续行之间的垂直间距（rem）。
 *
 * 取 `gap-2xs`（0.25rem）—— 比行与行之间的行间距紧一档，读起来是「同一行的延续」而不是
 * 「另起一行」。两段各自仍带完整的行框内边距，故实际视觉间距是「内边距 × 2 + 本值」。
 */
const SEGMENT_GAP_REM = 0.25;

/**
 * 折行符（续行行首那枚记号）在排列区的**放大系数**。
 *
 * 排列区与预览用的是**同一枚记号、同一套常量**（形状 / 线宽 / 深浅都引自
 * `SCORE_EXPORT_CONFIG.WRAPPED_LINE_MARK_*`），只有尺寸放大一档 —— 预览那边它锚在导出图的
 * 歌词字身上，而排列区字号更小、那一笔按原尺寸显得太小。放大后它的高度 ≈ 排列区自己的一个字身
 * （`GLYPH_FONT_REM` 折算后的 px），与预览「高约一个字身」的口径一致。
 */
const ARRANGE_WRAP_MARK_SCALE = 1.4;

/** 折行符臂长（px 基准，字号系数以外）。形状是「竖臂朝上 + 折角在左下 + 横臂朝右」的 L 形，
 *  尺寸与线宽都引自 `SCORE_EXPORT_CONFIG` —— 那枚记号全项目只有这一份声明，排列区与预览/导出
 *  共用，各写一份必然分叉。 */
const WRAP_MARK_SIZE_PX = SCORE_EXPORT_CONFIG.WRAPPED_LINE_MARK_SIZE * ARRANGE_WRAP_MARK_SCALE;

/** 折行符线宽（px 基准）：比歌词笔画粗一档，才在那段留白里立得住（同预览的取值口径） */
const WRAP_MARK_STROKE_PX = SCORE_EXPORT_CONFIG.WRAPPED_LINE_MARK_STROKE * ARRANGE_WRAP_MARK_SCALE;

/** 字形字号基准（`text-[calc(var(--score-font-scale,1)*0.875rem)]`） */
const GLYPH_FONT_REM = 0.875;
/** 字形行高基准（`min-h-[calc(1.15rem*var(--score-font-scale,1))]` 与同一行高值） */
const GLYPH_ROW_REM = 1.15;
/** 行号字号（`text-2xs`）—— **不随 `--score-font-scale` 缩放**，与 DOM 版一致（行号不参与字号偏好） */
const LINE_INDEX_FONT_REM = 0.625;

/** 界面字体栈（与 main.scss 的 body 同源，canvas 不继承 CSS，必须显式写一遍） */
const UI_FONT_FAMILY =
  "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";
/** 等宽字体栈（行号用的 `font-mono`） */
const MONO_FONT_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

let measureCtx: CanvasRenderingContext2D | null = null;
let measureCtxResolved = false;

/** 文本度量的共享离屏上下文（惰性创建一次；无 canvas 的环境返回 null，走字符数粗估兜底） */
const getMeasureCtx = (): CanvasRenderingContext2D | null => {
  if (measureCtxResolved) return measureCtx;
  measureCtxResolved = true;
  if (typeof document === 'undefined') return null;
  measureCtx = document.createElement('canvas').getContext('2d');
  return measureCtx;
};

/** 无 canvas 环境（jsdom）的宽度兜底：按字号的一半估每字符宽，只求量级正确（该路径不参与视觉） */
const FALLBACK_GLYPH_RATIO = 0.5;

/**
 * 量一段文本的宽度（px）。
 *
 * `font` 必须是完整的 CSS font 简写（`<weight> <size>px <family>`）—— canvas 的 `ctx.font`
 * 与 CSS 的 `font` 简写同语法，故两处可以用同一个字符串常量族拼出来。
 */
export const measureTextWidth = (text: string, font: string, fontPx: number): number => {
  const ctx = getMeasureCtx();
  if (!ctx) return text.length * fontPx * FALLBACK_GLYPH_RATIO;
  ctx.font = font;
  return ctx.measureText(text).width;
};

/**
 * 字形字体：排版度量与绘制共用同一份拼装（避免两处各写一遍后分叉）。
 *
 * `weight` 只有两档：600（`font-semibold`，正文）与 400（`font-normal`，`|` / `｜` 分隔符）。
 */
export const arrangeGlyphFont = (fontScale: number, weight: 400 | 600 = 600): string =>
  `${weight} ${arrangeGlyphFontPx(fontScale)}px ${UI_FONT_FAMILY}`;

/** 字形字号（px） */
export const arrangeGlyphFontPx = (fontScale: number): number => GLYPH_FONT_REM * rootFontSizePx() * fontScale;

/**
 * 单个字符的排版宽度（px，`font-semibold` 档），**按字符缓存**。
 *
 * 折行必须逐行知道每个槽多宽（见 `wrapPlannedSlots`），而同一字符在同一字号下宽度恒定 ——
 * 不缓存的话，`lineHeightOf` 在滚动帧里逐行调用会退化成「每行每个字符一次 measureText」
 * （几百行 × 几十字符）。缓存后度量只按**去重字符数**付一次，之后是查表。
 *
 * 字号变了整表作废（宽度是字号的函数），故只保留当前字号那一份。
 */
const glyphWidthCache = new Map<string, number>();
let glyphWidthCacheScale = Number.NaN;

export const arrangeGlyphWidthOf = (char: string, fontScale: number): number => {
  if (glyphWidthCacheScale !== fontScale) {
    glyphWidthCache.clear();
    glyphWidthCacheScale = fontScale;
  }
  const key = glyphTextOf(char);
  const cached = glyphWidthCache.get(key);
  if (cached !== undefined) return cached;
  const width = measureTextWidth(key, arrangeGlyphFont(fontScale), arrangeGlyphFontPx(fontScale));
  glyphWidthCache.set(key, width);
  return width;
};

/** 行号字体 */
export const arrangeLineIndexFont = (): string => `700 ${arrangeLineIndexFontPx()}px ${MONO_FONT_FAMILY}`;

/** 行号字号（px）—— 不随字号偏好缩放，与 DOM 版一致 */
export const arrangeLineIndexFontPx = (): number => LINE_INDEX_FONT_REM * rootFontSizePx();

// ---- 几何表 ----

/**
 * 排列区行位图统一使用的设备像素比（与 ScoreLineCanvas 的绘制倍率同一份，含上限）。
 *
 * 行位图的尺寸 = CSS 尺寸 × 本值（见 ScoreLineCanvas.draw），故排版侧把行宽 / 行高**量化到
 * 本值的整数倍**（见 measureArrangeLineHeight / layoutArrangeLine），两者才逐像素对齐。
 *
 * `extraScale` 是**排列区的视图倍率**（手势缩放，见 ScoreInteractiveArea 的 viewZoom）：行 canvas
 * 的 CSS 尺寸不带它、渲染时由 CSS `zoom` 放大，故位图要按同一个倍率加密度，放大后才不糊。
 * 倍率 < 1（缩小）时不提升 —— 缩小不需要更多像素。上限取 3（而不是 2）：既给缩放留出余量，
 * 又不让视口内几十行的位图内存失控（倍率进的是平方项）。
 */
export const arrangeCanvasDpr = (extraScale = 1): number => {
  if (!isClient) return 1;
  const dpr = window.devicePixelRatio || 1;
  return Math.min(dpr * Math.max(1, extraScale), 3);
};

/** 把一个 CSS 长度量化到设备像素网格（× dpr 后取整），避免位图与 CSS 盒之间出现亚像素错位 */
const quantizeToDpr = (px: number, dpr: number): number => Math.round(px * dpr) / dpr;

export interface ArrangeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 槽位种类：字符槽 / 行首边槽 / 行尾边槽 / 行首添加槽 / 行尾添加槽 */
export type ArrangeSlotKind = 'char' | 'start' | 'end' | 'add-start' | 'add-end';

export interface ArrangeSlotBox {
  slotKey: SlotKey;
  kind: ArrangeSlotKind;
  /** 槽根矩形（命中测试的落点，与 DOM 版的 `.char-box` 同范围） */
  rect: ArrangeRect;
  /** 槽内字符（添加槽无字符） */
  char?: string;
  /** 槽内和弦（空槽为 null） */
  chord: Chord | null;
  /** 指板图卡的外框矩形（有和弦时）：含描边，绘制时先铺底色再描边 */
  card?: ArrangeRect;
  /** 字形矩形（有字符层的槽才有）：绘制时按它水平居中 */
  glyph?: ArrangeRect;
  /**
   * 槽上那枚「清除和弦」钮的矩形（只有绑了和弦的槽才有）。
   *
   * 位置：**上提到行顶附近 + 略微越出槽右沿**（见 `REMOVE_BUTTON_RISE_REM` / `REMOVE_BUTTON_OFFSET_X_REM`）。
   * DOM 版把它放在槽**外**上方（`-top-2 -right-1`），canvas 画不出自身位图之外的像素 —— 但行画布的
   * 顶沿到槽顶之间还有一整段行框内边距可用，于是把钮上提到那一段里（仍在行画布内），视觉上就落在
   * 卡片的右上角外沿：少遮指板图，也不越界。
   */
  removeButton?: ArrangeRect;
  /** 与左侧相邻和弦紧邻（DOM 版的 `.is-left-adjacent`，补一点左外边距） */
  leftAdjacent: boolean;
}

export interface ArrangeLineLayout {
  /** 行逻辑宽（含右侧留白栏）：canvas 元素的 CSS 宽度 */
  width: number;
  /** 行逻辑高：canvas 元素的 CSS 高度 */
  height: number;
  /** 内容区（DOM 版的 `.lyrics-line`）矩形：行悬停底色与边框画在它上面 */
  lineRect: ArrangeRect;
  /** 行内全部槽位（按视觉从左到右） */
  slots: ArrangeSlotBox[];
  /** 槽位并集的水平范围（拖拽落点的水平容差判定，口径见 lyrics-drag 的槽位吸附） */
  slotsLeft: number;
  slotsRight: number;
  /** 行末删除钮矩形 */
  deleteRect: ArrangeRect;
  /**
   * 折行符的矩形（每个续行一个，按段序；未折行时为空数组）。
   *
   * 它**不进任何排版量** —— 不占槽宽、不参与折行判定，只是绘制阶段叠在续行缩进留白里的一笔。
   * 位置由排版给出（画笔只读几何、不做布局计算，见 arrangeLinePainter 的分工）。
   */
  wrapMarks: ArrangeRect[];
  /** 行号文本（两位补零）与其矩形 */
  lineIndexText: string;
  lineIndexRect: ArrangeRect;
}

export interface ArrangeLayoutOptions {
  /** 字号缩放：对应容器上的 `--score-font-scale`（用户字号偏好 × 窄屏系数） */
  fontScale: number;
  /** 指板图卡画布倍率（`resolveScoreCardScale` 的产物） */
  cardScale: number;
  /** 「忽略首末空品格」设置 */
  trimEmptyEdgeFrets: boolean;
  /** 行可用宽（滚动容器内容宽，含右侧留白栏） */
  containerWidth: number;
  /** 图标钮边长（px）：由宿主按断点折算，三枚钮共用一档 */
  buttonSize: number;
  /** 右侧留白栏宽（DOM 版的 `.line-row-gutter`：`w-6` / 窄屏 `w-2`） */
  gutterWidth: number;
  /**
   * 排列区的视图倍率（手势缩放，缺省 1 = 未缩放）。
   *
   * 它**不参与折行**（可用宽是容器逻辑宽，与视觉缩放无关），只影响行宽高的**量化网格** ——
   * 行位图的密度按它提升（见 `arrangeCanvasDpr`），量化不跟着走就会与位图错开、右缘留残影。
   */
  viewZoom?: number;
  /**
   * 按槽位键实时解析当前绑定的和弦（无绑定返回 null）。
   *
   * 行数据（`LineData`）里只有字符与槽位键、不含和弦本体 —— 那是刻意的：和弦绑定存在乐谱的
   * `chordMap` 上、随编辑实时变化，而行数据是按行文本缓存的。排版是唯一需要「这个槽上是什么和弦」
   * 的地方，故由宿主把这个解析器递进来（与 DOM 版的 `getCharChord` 同源）。
   */
  resolveChord: (slotKey: SlotKey) => Chord | null;
}

/** 字形文本：空格用不换行空格撑宽（与 `slotGlyphText` 同口径），无字符时为空串。
 *  排版量宽与绘制上屏共用这一份（见 arrangeLinePainter 的 import），两处口径不得分叉。 */
export const glyphTextOf = (char?: string): string => {
  if (char === undefined) return '';
  return char === ' ' ? '\u00A0' : char;
};

/** **行内**行号文本：两位补零（行内排版与宿主滚动气泡读数共用这一份实现）。
 *
 *  补零不是为了好看，是**排版量**：行号列宽由本函数的文本量出（见 `arrangeLineIndexWidth`），再决定
 *  首段可用宽与续行缩进量（`planArrangeLineWidth` 的 indent 里含行号宽）。一旦不补零，行 9→10、
 *  99→100 处列宽会跳一格，折行位置与续行缩进便跟着逐行跳变 —— 这是它必须定宽的原因。
 *
 *  **纯展示的读数不要复用本函数**：滚动气泡那处刻意不补零（`3 / 12` 而非 `03 / 12`，见
 *  ScoreInteractiveArea 的 `resolveLineLabelFromProgress`）。两处需求不同，不要以「同形副本」为由合并。 */
export const formatArrangeLineIndex = (index: number): string => String(index + 1).padStart(2, '0');

/** `measureArrangeLineHeight` / `measureArrangeSlotHeight` 的入参 */
export interface ArrangeLineHeightOptions {
  /**
   * 行内**最高那张指板图卡**的画布高（px，容器局部 px；本行没有卡时为 0）。
   *
   * 由 `useLineChordSignatures` 的 `lineCardHeight` 给出 —— 与实绘同源（同一份
   * `chordCardCanvasSizePx`），故这里不必、也不该自己再遍历一遍和弦。
   */
  cardHeightPx: number;
  fontScale: number;
  /** 图标钮边长（与排版同一个数） */
  buttonSize: number;
  /**
   * 本行折成了几段（≥ 1，缺省 1 = 未折行）。
   *
   * 由 `planArrangeLineSegmentCount` 给出 —— 与 `layoutArrangeLine` 的折行**同一份实现**，
   * 故离屏行的占位高度与它进入视口后的真实高度逐像素一致（见 useScoreViewportRender 的
   * linePlaceholderHeight）。段数之所以不能在这里现算：那需要文本度量，而本函数在滚动帧里
   * 被逐行调用（几百行）。
   */
  segmentCount?: number;
  /** 排列区的视图倍率（缺省 1）：只影响量化网格，口径见 `ArrangeLayoutOptions.viewZoom` */
  viewZoom?: number;
}

/**
 * 单段的**槽高**（px）：行内最高的那个槽撑出来的那一截（槽是 `self-stretch`，段高 = 各槽内容高的最大值）。
 *
 * 只做算术、不做任何文本度量 —— 它会在滚动帧里被逐行调用。
 */
export const measureArrangeSlotHeight = (options: ArrangeLineHeightOptions): number => {
  const rem = rootFontSizePx();
  const glyphRowH = GLYPH_ROW_REM * rem * options.fontScale;
  const slotPad = SLOT_PAD_REM * rem;
  const cardSlotH =
    options.cardHeightPx > 0
      ? options.cardHeightPx + CARD_BORDER * 2 + CONTENT_GAP_REM * rem + glyphRowH + slotPad * 2
      : 0;
  return Math.max(cardSlotH, options.buttonSize + slotPad * 2, glyphRowH + slotPad * 2);
};

/** 单段的**行框高**（px）：槽高 + 上下内边距 + 上下边框。未折行时它就是整行高。 */
export const measureArrangeSegmentHeight = (options: ArrangeLineHeightOptions): number => {
  const rem = rootFontSizePx();
  return measureArrangeSlotHeight(options) + LINE_PAD_REM * rem * 2 + LINE_BORDER * 2;
};

/**
 * 一行的**逻辑高度**（px，容器局部 px）：**不含**行间距（那是行与行之间的事，由虚拟化侧另计）。
 *
 * 与 `layoutArrangeLine` 共用同一组度量常量，且是后者算行高的唯一入口 —— 离屏行的占位高度
 * （见 useScoreViewportRender 的 linePlaceholderHeight）与实绘因此逐像素一致：内容总高不随
 * 「哪些行挂进了 DOM」而漂移，滚动落点才算得准。
 *
 * 折行后整行高 = 各段行框高之和 + 段间间距；**段数由调用方给**（见 segmentCount 的说明）。
 */
export const measureArrangeLineHeight = (options: ArrangeLineHeightOptions): number => {
  const count = Math.max(1, Math.trunc(options.segmentCount ?? 1));
  const segmentH = measureArrangeSegmentHeight(options);
  const gap = SEGMENT_GAP_REM * rootFontSizePx() * (count - 1);
  return quantizeToDpr(segmentH * count + gap, arrangeCanvasDpr(options.viewZoom));
};

// ---- 折行 ----

/**
 * 槽计划：折行**之前**的槽 —— 只有量（宽 / 高 / 卡与字形的尺寸），没有位置。
 *
 * 为什么要有这一遍：折行必须**先知道每个槽多宽**才能决定在哪断开（见 `wrapPlannedSlots`），
 * 而原实现是「边量边放」（一个 cursor 一路累加）—— 位置与宽度混在一起，回头没法重排。
 * 拆成「计划 → 折行 → 放置」三段后，宽度只量一遍、位置只放一遍。
 */
interface PlannedSlot {
  slotKey: SlotKey;
  kind: ArrangeSlotKind;
  char?: string;
  chord: Chord | null;
  /** 槽**前**的额外水平间距（`is-left-adjacent` 的补白 / 添加槽的外边距）；**段首不计** */
  leadGap: number;
  /** 槽**后**的额外水平间距（添加槽的外边距） */
  trailGap: number;
  /** 槽根矩形宽（不含 leadGap / trailGap） */
  w: number;
  /** 槽根矩形高 */
  h: number;
  /** 指板图卡外框尺寸（有和弦时；含描边） */
  cardW: number;
  cardH: number;
  /** 字形宽（含两侧内边距；无字符为 0） */
  glyphW: number;
}

/**
 * 添加槽的盒宽（`p-0.5` 各一份 + 方形按钮）。
 *
 * 行首 / 行尾两枚「+」与**折行续行的悬挂缩进**共用这一个数 —— 续行从行首按钮的右沿起，
 * 与首段的「行号 → 按钮」对成一个连续的缩进台阶。三处各算一遍必然走散，故只留这一个出口。
 */
const arrangeAddSlotSize = (options: ArrangeLayoutOptions): number =>
  options.buttonSize + SLOT_PAD_REM * rootFontSizePx() * 2;

/**
 * 把一行的内容流算成**槽计划**（只有量，没有位置）。
 *
 * 横向顺序与 DOM 版逐项对齐：行首添加槽 → 行首边和弦 → 字符槽 → 行尾边和弦 → 行尾添加槽。
 * 行号与行末删除钮**不在其中** —— 它们不参与折行（行号只占首段、删除钮贴行右端，见 layoutArrangeLine）。
 */
const planArrangeLineSlots = (line: LineData, options: ArrangeLayoutOptions): PlannedSlot[] => {
  const rem = rootFontSizePx();
  const slotPad = SLOT_PAD_REM * rem;
  const glyphPadX = GLYPH_PAD_X_REM * rem;
  const contentGap = CONTENT_GAP_REM * rem;
  const glyphRowH = GLYPH_ROW_REM * rem * options.fontScale;
  const addSlotMarginX = ADD_SLOT_MARGIN_X_REM * rem;
  const addSlotSize = arrangeAddSlotSize(options);
  const { resolveChord } = options;
  const hasContent = line.chars.length > 0 || line.startChords.length > 0 || line.endChords.length > 0;

  const planned: PlannedSlot[] = [];

  const pushSlot = (
    slotKey: SlotKey,
    kind: ArrangeSlotKind,
    char: string | undefined,
    chord: Chord | null,
    leftAdjacent: boolean
  ): void => {
    const glyphW = char === undefined ? 0 : arrangeGlyphWidthOf(char, options.fontScale) + glyphPadX * 2;
    let w: number;
    let h: number;
    let cardW = 0;
    let cardH = 0;
    if (chord) {
      const size = chordCardCanvasSizePx(chord, {
        scale: options.cardScale,
        trimEmptyEdgeFrets: options.trimEmptyEdgeFrets,
      });
      cardW = size.width + CARD_BORDER * 2;
      cardH = size.height + CARD_BORDER * 2;
      w = Math.max(cardW, glyphW) + slotPad * 2;
      h = cardH + contentGap + glyphRowH + slotPad * 2;
    } else {
      w = glyphW + slotPad * 2;
      h = glyphRowH + slotPad * 2;
    }
    planned.push({
      slotKey,
      kind,
      char,
      chord,
      leadGap: leftAdjacent ? LEFT_ADJACENT_GAP_REM * rem : 0,
      trailGap: 0,
      w,
      h,
      cardW,
      cardH,
      glyphW,
    });
  };

  // ---- 行首添加槽（本行恒有）：两侧外边距分记在 leadGap / trailGap ----
  planned.push({
    slotKey: line.nextStartKey,
    kind: 'add-start',
    chord: null,
    leadGap: addSlotMarginX,
    trailGap: addSlotMarginX,
    w: addSlotSize,
    h: addSlotSize,
    cardW: 0,
    cardH: 0,
    glyphW: 0,
  });

  // ---- 行首边和弦（DOM 版不传 left-chord-gap：行首那一侧本就没有可紧邻的和弦） ----
  line.startChords.forEach(item => void pushSlot(item.slotKey, 'start', undefined, resolveChord(item.slotKey), false));

  // ---- 字符槽 ----
  line.chars.forEach((item, index) => {
    const chord = resolveChord(item.slotKey);
    const prevChord =
      index > 0
        ? resolveChord(line.chars[index - 1]!.slotKey)
        : line.startChords.at(-1)
          ? resolveChord(line.startChords.at(-1)!.slotKey)
          : null;
    pushSlot(item.slotKey, 'char', item.char, chord, Boolean(chord && prevChord));
  });

  // ---- 行尾边和弦 ----
  line.endChords.forEach((item, index) => {
    const chord = resolveChord(item.slotKey);
    const prevChord =
      index > 0
        ? resolveChord(line.endChords[index - 1]!.slotKey)
        : line.chars.at(-1)
          ? resolveChord(line.chars.at(-1)!.slotKey)
          : null;
    pushSlot(item.slotKey, 'end', undefined, chord, Boolean(chord && prevChord));
  });

  // ---- 行尾添加槽（本行有内容时才挂） ----
  if (hasContent)
    planned.push({
      slotKey: line.nextEndKey,
      kind: 'add-end',
      chord: null,
      leadGap: addSlotMarginX,
      trailGap: addSlotMarginX,
      w: addSlotSize,
      h: addSlotSize,
      cardW: 0,
      cardH: 0,
      glyphW: 0,
    });

  return planned;
};

/**
 * 把槽计划按可用宽折成多段（续行）：贪心装箱，放不下就断到下一段。
 *
 * 返回每段的槽下标（按原顺序，段内亦保序）。**段首不计 `leadGap`** —— 那是「与左侧相邻和弦紧邻」
 * 的补白，段首左侧本就没有东西可紧邻。
 *
 * 单个槽比可用宽还宽时（超长和弦卡）它独占一段并溢出：宁可让它越界，也不要为它切一段空的。
 */
const wrapPlannedSlots = (planned: readonly PlannedSlot[], firstAvail: number, avail: number): number[][] => {
  const runs: number[][] = [];
  let current: number[] = [];
  let used = 0;
  let limit = firstAvail;
  for (let index = 0; index < planned.length; index++) {
    const slot = planned[index]!;
    const cost = (current.length === 0 ? 0 : slot.leadGap) + slot.w + slot.trailGap;
    if (current.length > 0 && used + cost > limit) {
      runs.push(current);
      current = [];
      used = 0;
      limit = avail;
    }
    current.push(index);
    used += cost;
  }
  if (current.length > 0) runs.push(current);
  return runs.length > 0 ? runs : [[]];
};

/**
 * 行的横向口径：行宽与各段的可用宽。
 *
 * **行宽恒为容器内容宽** —— 这是「排列区不再横向滚动」的落点：折行把超出的内容折进下一段，
 * 行不再被内容撑宽。
 *
 * 唯一的例外是**下限**：容器窄到「一个槽都放不下」时行仍会被撑宽（横向滚动回来）。这不是退让 ——
 * 折行只能把槽**分组**，单槽本身宽过可用宽时无处可去，而它一旦溢出就会压到贴行右端的删除钮上
 * （删除钮是行内唯一挪不走的元件）。下限取「行框内边距 + 删除钮 + 最宽的那个槽 + 行号及其间距」，
 * 保证首段至少装得下最宽的一槽。
 */
const planArrangeLineWidth = (options: ArrangeLayoutOptions, lineIndexW: number, widestSlotW: number) => {
  const rem = rootFontSizePx();
  const lineInset = LINE_PAD_REM * rem + LINE_BORDER;
  const lineIndexLead = lineIndexW + LINE_INDEX_GAP_REM * rem;
  /**
   * 续行的悬挂缩进 = **行号 + 其后的间距 + 行首按钮的盒宽 + 按钮之后的外边距**。
   *
   * 前三项之和是首段「行首按钮右沿」相对内容区左沿的偏移，再加按钮自己的右外边距，续行首槽
   * 因此与首段**第一个内容槽**的左沿对齐 —— 不是一个凭空取的数，而是那几处的和。
   */
  const indent = lineIndexLead + arrangeAddSlotSize(options) + ADD_SLOT_MARGIN_X_REM * rem;
  // 下限要同时容下两种段的首槽：首段是「行号 + 最宽槽」，续段是「缩进 + 最宽槽」——
  // 缩进已含行号那一段，故更宽的一侧必然落在缩进上
  const minWidth = lineInset * 2 + options.buttonSize + widestSlotW + indent;
  const lineWidth = quantizeToDpr(
    Math.max(options.containerWidth - options.gutterWidth, minWidth),
    arrangeCanvasDpr(options.viewZoom)
  );
  /** 内容区可用宽（首段还要让过行号，续段还要让过缩进） */
  const contentAvail = lineWidth - lineInset * 2 - options.buttonSize;
  return { lineWidth, indent, firstAvail: contentAvail - lineIndexLead, nextAvail: contentAvail - indent };
};

/** 折行符线宽（px）：随字号系数缩放 —— 与预览/导出侧同一口径（那边它也在「随字号缩放」的名单里） */
export const arrangeWrapMarkStrokePx = (fontScale: number): number => WRAP_MARK_STROKE_PX * fontScale;

/** 最宽的那个槽的**占用宽**（含它两侧的额外间距）—— 行宽下限按它算，见 planArrangeLineWidth */
const widestSlotWidthOf = (planned: readonly PlannedSlot[]): number =>
  planned.reduce((widest, slot) => Math.max(widest, slot.leadGap + slot.w + slot.trailGap), 0);

/** 行号的排版宽（首段可用宽要扣掉它与其后间距） */
const arrangeLineIndexWidth = (line: LineData): number =>
  measureTextWidth(formatArrangeLineIndex(line.lineIdx), arrangeLineIndexFont(), arrangeLineIndexFontPx());

/**
 * 本行折成几段（≥ 1）。
 *
 * 与 `layoutArrangeLine` 的折行是**同一份实现**（同一份槽计划 + 同一份装箱）—— 行高账在滚动帧里
 * 逐行调用它，若与实绘各算一遍，「占位高度」与「真实高度」必然分叉，内容总高随滚动漂移
 * （见 useScoreViewportRender 的 linePlaceholderHeight）。
 */
export const planArrangeLineSegmentCount = (line: LineData, options: ArrangeLayoutOptions): number => {
  const planned = planArrangeLineSlots(line, options);
  const { firstAvail, nextAvail } = planArrangeLineWidth(
    options,
    arrangeLineIndexWidth(line),
    widestSlotWidthOf(planned)
  );
  return wrapPlannedSlots(planned, firstAvail, nextAvail).length;
};

/**
 * 排版一行。
 *
 * 横向顺序与 DOM 版逐项对齐：行号 → 行首添加槽 → 行首边和弦 → 字符槽 → 行尾边和弦 → 行尾添加槽；
 * 行末删除钮不参与内容流（DOM 版的 `ml-auto` 把它推到行右端）。
 *
 * **折行**：内容按可用宽折成多段（续行），行宽因此恒为容器内容宽、不再被内容撑宽。行号只占首段、
 * 行末删除钮仍贴行右端且纵向居中于整行；**续行悬挂缩进两格**，行首叠一枚折行符（见 wrapMarks）。
 * 段高一律取**整行最高卡**那一档（各段等高）—— 段数一旦确定，行高就退化成纯算术
 * （见 `measureArrangeLineHeight`），滚动占位与实绘才能逐像素同源。
 */
export const layoutArrangeLine = (line: LineData, options: ArrangeLayoutOptions): ArrangeLineLayout => {
  const rem = rootFontSizePx();
  const slotPad = SLOT_PAD_REM * rem;
  const glyphRowH = GLYPH_ROW_REM * rem * options.fontScale;
  const lineInset = LINE_PAD_REM * rem + LINE_BORDER;
  const lineIndexFontPx = LINE_INDEX_FONT_REM * rem;
  const lineIndexGap = LINE_INDEX_GAP_REM * rem;
  const lineIndexText = formatArrangeLineIndex(line.lineIdx);
  const lineIndexW = arrangeLineIndexWidth(line);

  // ---- 计划 → 折行 → 放置 ----
  const planned = planArrangeLineSlots(line, options);
  const { lineWidth, indent, firstAvail, nextAvail } = planArrangeLineWidth(
    options,
    lineIndexW,
    widestSlotWidthOf(planned)
  );
  const runs = wrapPlannedSlots(planned, firstAvail, nextAvail);

  // 行高只由「行内最高的那个槽」决定（段间等高，见上面的说明），故先取整行最高卡
  const cardHeightPx = Math.max(0, ...planned.map(plan => plan.cardH - CARD_BORDER * 2));
  // viewZoom 必须一并透传：行高在 measureArrangeLineHeight 里按 arrangeCanvasDpr(viewZoom) 量化，
  // 而本行行宽（:599）与宿主占位也按同一倍率算 —— 漏掉它会让「占位高度与实绘逐像素一致」这条
  // 不变量在放大后破裂（每行最多差 0.5px，几百行累计成总高漂移）。
  const heightOptions = {
    cardHeightPx,
    fontScale: options.fontScale,
    buttonSize: options.buttonSize,
    viewZoom: options.viewZoom,
  };
  const slotH = measureArrangeSlotHeight(heightOptions);
  const segmentH = measureArrangeSegmentHeight(heightOptions);
  const segmentGap = SEGMENT_GAP_REM * rem;
  const contentH = measureArrangeLineHeight({ ...heightOptions, segmentCount: runs.length });

  const deleteSize = options.buttonSize;
  const removeSize = options.buttonSize * REMOVE_BUTTON_SIZE_RATIO;
  const slots: ArrangeSlotBox[] = [];
  /** 折行符：每个续行一枚，画在它的缩进留白里（形状与位置见 SEGMENT_INDENT_REM / WRAP_MARK_ARM_REM） */
  const wrapMarks: ArrangeRect[] = [];
  const wrapArm = WRAP_MARK_SIZE_PX * options.fontScale;

  runs.forEach((run, runIdx) => {
    /** 本段的槽顶（行局部坐标）：每段自带完整行框，段间再留一道间距 */
    const segmentTop = lineInset + runIdx * (segmentH + segmentGap);
    // 首段的游标要让过行号；续行让过悬挂缩进（两格）
    let cursor = lineInset + (runIdx === 0 ? lineIndexW + lineIndexGap : indent);
    // 折行符落在续行的缩进留白里、纵向居中于本段：竖臂朝上、折角在左下、横臂朝右。
    // 它不进任何排版量（不占槽宽、不参与折行判定），只是叠上去的一笔。
    if (runIdx > 0)
      wrapMarks.push({
        // **在缩进区域内居中**：左右留白相等，记号因此浮在「续行缩进段」的正中，
        // 而不是贴在这个区间的左沿（贴左时它与右侧正文之间空出一大段，读起来像另一列的标记）
        x: lineInset + (indent - wrapArm) / 2,
        y: segmentTop + (slotH - wrapArm) / 2,
        w: wrapArm,
        h: wrapArm,
      });
    let isSegmentHead = true;

    for (const plannedIndex of run) {
      const plan = planned[plannedIndex]!;
      if (!isSegmentHead) cursor += plan.leadGap;
      isSegmentHead = false;

      const slot: ArrangeSlotBox = {
        slotKey: plan.slotKey,
        kind: plan.kind,
        rect: { x: cursor, y: segmentTop, w: plan.w, h: slotH },
        char: plan.char,
        chord: plan.chord,
        leftAdjacent: plan.leadGap > 0,
      };
      if (plan.cardH > 0) {
        // 内容层 `justify-center`：卡片在槽内容区水平居中
        slot.card = {
          x: cursor + slotPad + (plan.w - slotPad * 2 - plan.cardW) / 2,
          y: segmentTop + slotPad,
          w: plan.cardW,
          h: plan.cardH,
        };
        // 清除钮上提到贴近**本段**顶（受行框内边距约束，钳到 ≥ 0，否则被画布上边界裁掉一角）
        slot.removeButton = {
          x: cursor + plan.w - removeSize + REMOVE_BUTTON_OFFSET_X_REM * rem,
          y: Math.max(0, segmentTop - REMOVE_BUTTON_RISE_REM * rem),
          w: removeSize,
          h: removeSize,
        };
      }
      // 字形层水平居中于槽、纵向贴**本段**底（`mt-auto`）
      if (plan.char !== undefined)
        slot.glyph = {
          x: cursor + slotPad + (plan.w - slotPad * 2 - plan.glyphW) / 2,
          y: segmentTop + slotH - slotPad - glyphRowH,
          w: plan.glyphW,
          h: glyphRowH,
        };
      slots.push(slot);
      cursor += plan.w + plan.trailGap;
    }
  });

  // ---- 行框尺寸 ----
  // 槽位并集（拖拽落点的水平容差判定用）：只含真实槽位，不含行号与删除钮
  const slotsLeft = Math.min(...slots.map(slot => slot.rect.x));
  const slotsRight = Math.max(...slots.map(slot => slot.rect.x + slot.rect.w));

  // 行号：**未折行**时贴内容区底沿、再往上 2px（DOM 版的 `items-end pb-0.5`），也就是行框的
  // 左下角。**折行后**改为纵向居中于整行 —— 整行变高之后，左下角离正文越来越远，而它标的是
  // 「这一行」，挂在整行的中线附近才读得出这份归属（挂在末尾会像最后一段的注脚）。
  const lineIndexH = lineIndexFontPx * 1.15;
  const lineIndexRect: ArrangeRect = {
    x: lineInset,
    y: runs.length > 1 ? (contentH - lineIndexH) / 2 : lineInset + slotH - 2 - lineIndexH,
    w: lineIndexW,
    h: lineIndexH,
  };

  // ---- 行末删除钮：贴内容区右沿（DOM 版的 `ml-auto`），纵向居中于整行 ----
  // 减去 `lineInset` 是让行框内边距在**右端也生效** —— 否则这枚钮会直接贴到行的物理边缘，
  // 与行首那一侧（行号距左沿一个 `lineInset`）不对称。
  const deleteRect: ArrangeRect = {
    x: lineWidth - lineInset - deleteSize,
    y: (contentH - deleteSize) / 2,
    w: deleteSize,
    h: deleteSize,
  };

  return {
    width: lineWidth + options.gutterWidth,
    height: contentH,
    lineRect: { x: 0, y: 0, w: lineWidth, h: contentH },
    slots,
    slotsLeft,
    slotsRight,
    deleteRect,
    wrapMarks,
    lineIndexText,
    lineIndexRect,
  };
};

// ---- 命中测试 ----

export type ArrangeHit =
  { kind: 'delete-line' } | { kind: 'slot-remove'; slot: ArrangeSlotBox } | { kind: 'slot'; slot: ArrangeSlotBox };

/** 点是否落在矩形内（**左闭右开**：相邻矩形的接缝像素只归前者，不会同时命中两个。
 *  续行的清除钮顶边与上一段槽底边恰好重合，两端都闭时那条接缝会落到别的段的槽上）。 */
const containsPoint = (rect: ArrangeRect, x: number, y: number): boolean =>
  x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;

/**
 * 命中测试：给定行局部坐标（相对 `.line-row` 左上角，**容器局部 px**），返回命中的元件。
 *
 * 优先级：行末删除钮 > 槽上的清除钮 > 槽位本体。前者在 DOM 版里是叠在行内容之上的真实按钮，
 * 后者只在**它自己那一格**被悬停（或触屏常驻）时才可命中 —— **可见性不在这里判**，由调用方按当前
 * 视觉状态（`removeVisibleKey` / `removeAlwaysVisible`）决定要不要采信 `slot-remove`：本函数只回答几何。
 */
export const hitTestArrangeLine = (layout: ArrangeLineLayout, x: number, y: number): ArrangeHit | null => {
  if (containsPoint(layout.deleteRect, x, y)) return { kind: 'delete-line' };
  const bodyHit = layout.slots.find(slot => containsPoint(slot.rect, x, y)) ?? null;
  const removeHit = layout.slots.find(slot => slot.removeButton && containsPoint(slot.removeButton, x, y)) ?? null;
  // 清除钮优先于槽本体，但**只在它确实属于同一个槽、或点压根不在任何槽本体上时**成立。
  // 两个边界必须同时满足，缺一即错：
  //   ① 无条件让钮优先 —— 钮的右沿刻意越出槽右沿 0.125rem（≈2.8px），而相邻卡间隙最多 3.3px，
  //      于是点在**下一张卡左上角**那条 2.8px 竖条上会清掉前一张卡的和弦；
  //   ② 无条件让槽本体优先 —— 钮就压在自家槽上，指针一移到钮上就被判成「不在任何槽上」，
  //      那枚钮当场消失、槽级 hover 闪断（用户报的正是这个）。
  // 故：钮与本体同槽 ⇒ 钮赢；落在别家的本体上 ⇒ 那家赢；落在间隙里（无本体命中）⇒ 钮赢。
  if (removeHit && (!bodyHit || bodyHit.slotKey === removeHit.slotKey)) return { kind: 'slot-remove', slot: removeHit };

  return bodyHit ? { kind: 'slot', slot: bodyHit } : null;
};

/**
 * 命中结果**所属的槽位键**（行末删除钮不属于任何槽，返回 null）。
 *
 * 存在的理由：`slot-remove` 与 `slot` 落在同一个槽上，而「指针在不在某个槽上」的消费方
 *（槽级 hover 底色、字形染色、清除钮的显隐）必须把两者**一视同仁** —— 只认 `slot` 的话，
 * 指针一移到清除钮上就会被判成「不在任何槽上」，那枚钮当场消失（用户报的正是这个）。
 * 把这条语义收在这里，免得每个消费方各写一遍 `kind === 'slot' || kind === 'slot-remove'`。
 */
export const hitSlotKey = (hit: ArrangeHit | null): SlotKey | null =>
  hit && hit.kind !== 'delete-line' ? hit.slot.slotKey : null;
