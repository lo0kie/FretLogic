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
import { chordCardCanvasSizePx } from '@/domains/score/editor/lineCardHeight';
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

/** 行号字体 */
export const arrangeLineIndexFont = (): string => `700 ${arrangeLineIndexFontPx()}px ${MONO_FONT_FAMILY}`;

/** 行号字号（px）—— 不随字号偏好缩放，与 DOM 版一致 */
export const arrangeLineIndexFontPx = (): number => LINE_INDEX_FONT_REM * rootFontSizePx();

// ---- 几何表 ----

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

/** 行号文本：两位补零（行内排版与宿主滚动气泡读数共用这一份实现） */
export const formatArrangeLineIndex = (index: number): string => String(index + 1).padStart(2, '0');

/** `measureArrangeLineHeight` 的入参 */
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
}

/**
 * 一行的**逻辑高度**（px，容器局部 px）：**不含**行间距（那是行与行之间的事，由虚拟化侧另计）。
 *
 * 与 `layoutArrangeLine` 共用同一组度量常量，且是后者算行高的唯一入口 —— 离屏行的占位高度
 * （见 useScoreViewportRender 的 linePlaceholderHeight）与实绘因此逐像素一致：内容总高不随
 * 「哪些行挂进了 DOM」而漂移，滚动落点才算得准。
 *
 * 只做算术、不做任何文本度量：它会在滚动帧里被逐行调用（几百行），而高度只由「最高的那个槽」
 * 决定 —— 有卡行由卡片撑出、无卡行由添加槽（图标钮）撑出，两者都不需要知道字符有多宽。
 */
export const measureArrangeLineHeight = (options: ArrangeLineHeightOptions): number => {
  const rem = rootFontSizePx();
  const glyphRowH = GLYPH_ROW_REM * rem * options.fontScale;
  const slotPad = SLOT_PAD_REM * rem;
  const cardSlotH =
    options.cardHeightPx > 0
      ? options.cardHeightPx + CARD_BORDER * 2 + CONTENT_GAP_REM * rem + glyphRowH + slotPad * 2
      : 0;
  const slotH = Math.max(cardSlotH, options.buttonSize + slotPad * 2, glyphRowH + slotPad * 2);
  return slotH + LINE_PAD_REM * rem * 2 + LINE_BORDER * 2;
};

/**
 * 排版一行。
 *
 * 横向顺序与 DOM 版逐项对齐：行号 → 行首添加槽 → 行首边和弦 → 字符槽 → 行尾边和弦 → 行尾添加槽；
 * 行末删除钮不参与内容流（DOM 版的 `ml-auto` 把它推到行右端）。
 */
export const layoutArrangeLine = (line: LineData, options: ArrangeLayoutOptions): ArrangeLineLayout => {
  const rem = rootFontSizePx();
  const { resolveChord } = options;
  /** 本行有没有内容：纯空行只留行首一枚「+」（口径与 DOM 版的 lineHasContent 同源） */
  const hasContent = line.chars.length > 0 || line.startChords.length > 0 || line.endChords.length > 0;
  const glyphFontPx = GLYPH_FONT_REM * rem * options.fontScale;
  const glyphRowH = GLYPH_ROW_REM * rem * options.fontScale;
  // 度量常量一律以 rem 记（见文件头的说明），进函数时一次性折算成 px —— 下面的算式全部用这几个数
  const slotPad = SLOT_PAD_REM * rem;
  const glyphPadX = GLYPH_PAD_X_REM * rem;
  const contentGap = CONTENT_GAP_REM * rem;
  /** 内容区起点（行框内边距 + 边框）：行号与首个槽都从这里起算 */
  const lineInset = LINE_PAD_REM * rem + LINE_BORDER;
  const lineIndexGap = LINE_INDEX_GAP_REM * rem;
  const addSlotMarginX = ADD_SLOT_MARGIN_X_REM * rem;
  /** 字形字体：`font-semibold` 档（分隔符走 normal，宽度差异不足以影响槽宽，统一按 semibold 量） */
  const glyphFont = `600 ${glyphFontPx}px ${UI_FONT_FAMILY}`;
  const lineIndexFontPx = LINE_INDEX_FONT_REM * rem;
  const lineIndexFont = `700 ${lineIndexFontPx}px ${MONO_FONT_FAMILY}`;

  const slots: ArrangeSlotBox[] = [];
  /** 内容流游标（行局部坐标，从内容区左沿起算） */
  let cursor = lineInset;

  // ---- 行号 ----
  const lineIndexText = formatArrangeLineIndex(line.lineIdx);
  const lineIndexW = measureTextWidth(lineIndexText, lineIndexFont, lineIndexFontPx);
  const lineIndexRect: ArrangeRect = { x: lineInset, y: 0, w: lineIndexW, h: 0 };
  cursor += lineIndexW + lineIndexGap;

  /** 添加槽的盒宽（`p-0.5` 各一份 + 方形按钮） */
  const addSlotW = options.buttonSize + slotPad * 2;
  const addSlotH = options.buttonSize + slotPad * 2;

  // ---- 行首添加槽（本行恒有） ----
  cursor += addSlotMarginX;
  slots.push({
    slotKey: line.nextStartKey,
    kind: 'add-start',
    rect: { x: cursor, y: 0, w: addSlotW, h: addSlotH },
    chord: null,
    leftAdjacent: false,
  });
  cursor += addSlotW + addSlotMarginX;

  /** 逐个排一个「和弦槽」或「纯字符槽」；返回槽盒宽 */
  const placeSlot = (
    slotKey: SlotKey,
    kind: ArrangeSlotKind,
    char: string | undefined,
    chord: Chord | null,
    leftAdjacent: boolean
  ): void => {
    // 与左侧相邻和弦紧邻时补一点左外边距（DOM 版的 `.is-left-adjacent`），避免两张指板图卡贴在一起
    if (leftAdjacent) cursor += LEFT_ADJACENT_GAP_REM * rem;
    const glyphW = char === undefined ? 0 : measureTextWidth(glyphTextOf(char), glyphFont, glyphFontPx) + glyphPadX * 2;
    let w: number;
    let h: number;
    let card: ArrangeRect | undefined;
    let glyph: ArrangeRect | undefined;
    let removeButton: ArrangeRect | undefined;

    if (chord) {
      const size = chordCardCanvasSizePx(chord, {
        scale: options.cardScale,
        trimEmptyEdgeFrets: options.trimEmptyEdgeFrets,
      });
      const cardW = size.width + CARD_BORDER * 2;
      const cardH = size.height + CARD_BORDER * 2;
      w = Math.max(cardW, glyphW) + slotPad * 2;
      h = cardH + contentGap + glyphRowH + slotPad * 2;
      // 内容层 `justify-center`：卡片在槽内容区水平居中
      card = { x: cursor + slotPad + (w - slotPad * 2 - cardW) / 2, y: slotPad, w: cardW, h: cardH };
      // x 与尺寸在这里定，y 由行高统一给出（见函数末段）—— 它要贴到行顶附近，而那是行级的位置
      const removeSize = options.buttonSize * REMOVE_BUTTON_SIZE_RATIO;
      removeButton = {
        x: cursor + w - removeSize + REMOVE_BUTTON_OFFSET_X_REM * rem,
        y: 0,
        w: removeSize,
        h: removeSize,
      };
    } else {
      w = glyphW + slotPad * 2;
      h = glyphRowH + slotPad * 2;
    }

    // 字形层水平居中于槽；**纵向贴行底**（`mt-auto`）—— 槽是 `self-stretch`，矮槽会被拉伸到
    // 行高，于是所有槽的字形在行底对齐。故这里只定 x，y 由行高统一给出（见函数末段）
    if (char !== undefined)
      glyph = { x: cursor + slotPad + (w - slotPad * 2 - glyphW) / 2, y: 0, w: glyphW, h: glyphRowH };

    slots.push({
      slotKey,
      kind,
      rect: { x: cursor, y: 0, w, h },
      char,
      chord,
      card,
      glyph,
      removeButton,
      leftAdjacent,
    });
    cursor += w;
  };

  // ---- 行首边和弦（DOM 版不传 left-chord-gap：行首那一侧本就没有可紧邻的和弦） ----
  line.startChords.forEach(item => void placeSlot(item.slotKey, 'start', undefined, resolveChord(item.slotKey), false));

  // ---- 字符槽 ----
  line.chars.forEach((item, index) => {
    const chord = resolveChord(item.slotKey);
    const prevChord =
      index > 0
        ? resolveChord(line.chars[index - 1]!.slotKey)
        : line.startChords.at(-1)
          ? resolveChord(line.startChords.at(-1)!.slotKey)
          : null;
    placeSlot(item.slotKey, 'char', item.char, chord, Boolean(chord && prevChord));
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
    placeSlot(item.slotKey, 'end', undefined, chord, Boolean(chord && prevChord));
  });

  // ---- 行尾添加槽（本行有内容时才挂） ----
  if (hasContent) {
    cursor += addSlotMarginX;
    slots.push({
      slotKey: line.nextEndKey,
      kind: 'add-end',
      rect: { x: cursor, y: 0, w: addSlotW, h: addSlotH },
      chord: null,
      leftAdjacent: false,
    });
    cursor += addSlotW + addSlotMarginX;
  }

  // ---- 行框尺寸 ----
  // 槽位并集（拖拽落点的水平容差判定用）：只含真实槽位，不含行号与删除钮
  const slotsLeft = Math.min(...slots.map(s => s.rect.x));
  const slotsRight = Math.max(...slots.map(s => s.rect.x + s.rect.w));
  // 行高走 measureArrangeLineHeight（与离屏占位同源）：入参取行内最高那张卡，算式只有一处
  const contentH = measureArrangeLineHeight({
    cardHeightPx: Math.max(0, ...slots.map(s => (s.card ? s.card.h - CARD_BORDER * 2 : 0))),
    fontScale: options.fontScale,
    buttonSize: options.buttonSize,
  });
  // 槽被 `self-stretch` 拉伸到整段内容高，故槽矩形统一取内容区高
  const slotH = contentH - LINE_PAD_REM * rem * 2 - LINE_BORDER * 2;
  /** 行末删除钮的边长（与行首 / 行尾两枚「+」同档） */
  const deleteSize = options.buttonSize;
  /** 内容流右沿（含内容区右内边距） */
  const contentEnd = cursor + lineInset;
  // 行宽 = max(内容流 + 行末删除钮, 容器宽)。
  //
  // ⚠️ **删除钮必须算进内容宽**：DOM 版里它是内容流的最后一个 flex 子项（`ml-auto` 只在**有多余
  // 空间**时把它推到行右端，空间不足时它紧跟内容之后）。若这里无条件把它贴到行右端、又不把它的宽度
  // 计进行宽，当内容宽占满行宽时它就会**压在行尾添加槽上** —— 容器一窄内容就顶到行右端，
  // 窄屏最容易撞见。
  const lineWidth = Math.max(contentEnd + deleteSize, options.containerWidth - options.gutterWidth);

  // 纵向落位：槽被拉伸到整段内容高，故槽矩形统一取「内容区」；卡片顶对齐、字形贴行底、
  // 清除钮上提到行顶附近。三者的 y 都相对**行**（`.line-row` 左上角）给出
  const contentTop = lineInset;
  const contentBottom = contentH - lineInset;
  const glyphY = contentBottom - slotPad - glyphRowH;
  // 清除钮的上提量受行框内边距约束（钳到 ≥ 0），否则会被行画布的上边界裁掉一角
  const removeButtonY = Math.max(0, lineInset - REMOVE_BUTTON_RISE_REM * rem);
  for (const slot of slots) {
    slot.rect.y = contentTop;
    slot.rect.h = slotH;
    if (slot.card) slot.card.y += contentTop;
    if (slot.removeButton) slot.removeButton.y = removeButtonY;
    if (slot.glyph) slot.glyph.y = glyphY;
  }

  // 行号贴内容区底沿、再往上 2px（DOM 版的 `items-end pb-0.5`）
  lineIndexRect.h = lineIndexFontPx * 1.15;
  lineIndexRect.y = contentBottom - 2 - lineIndexRect.h;

  // ---- 行末删除钮：贴内容区右沿（DOM 版的 `ml-auto`，且行框的内边距同样约束它）----
  // 行宽已按 `contentEnd + deleteSize` 兜底（见上），故这里贴内容区右沿时**必然**落在内容之后，
  // 不会与行尾添加槽重叠。减去 `lineInset` 是让行框内边距在**右端也生效** —— 否则这枚钮会直接贴到
  // 行的物理边缘，与行首那一侧（行号距左沿一个 `lineInset`）不对称。
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
    lineIndexText,
    lineIndexRect,
  };
};

// ---- 命中测试 ----

export type ArrangeHit =
  { kind: 'delete-line' } | { kind: 'slot-remove'; slot: ArrangeSlotBox } | { kind: 'slot'; slot: ArrangeSlotBox };

/** 点是否落在矩形内 */
const containsPoint = (rect: ArrangeRect, x: number, y: number): boolean =>
  x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;

/**
 * 命中测试：给定行局部坐标（相对 `.line-row` 左上角，**容器局部 px**），返回命中的元件。
 *
 * 优先级：行末删除钮 > 槽上的清除钮 > 槽位本体。前者在 DOM 版里是叠在行内容之上的真实按钮，
 * 后者只在**它自己那一格**被悬停（或触屏常驻）时才可命中 —— **可见性不在这里判**，由调用方按当前
 * 视觉状态（`removeVisibleKey` / `removeAlwaysVisible`）决定要不要采信 `slot-remove`：本函数只回答几何。
 */
export const hitTestArrangeLine = (layout: ArrangeLineLayout, x: number, y: number): ArrangeHit | null => {
  if (containsPoint(layout.deleteRect, x, y)) return { kind: 'delete-line' };
  for (const slot of layout.slots) {
    if (slot.removeButton && containsPoint(slot.removeButton, x, y)) return { kind: 'slot-remove', slot };
    if (containsPoint(slot.rect, x, y)) return { kind: 'slot', slot };
  }
  return null;
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
