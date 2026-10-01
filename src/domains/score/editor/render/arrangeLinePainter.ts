/**
 * 排列和弦区**一行的 canvas 绘制**：把 `arrangeLineLayout` 算出的几何表画出来。
 *
 * 分工：几何归 layout（同时驱动命中测试），本模块只回答「长什么样」。故这里**不做任何布局计算** ——
 * 一切位置都从几何表里读，否则「画在哪」与「点在哪」会分叉，而且不会报错。
 *
 * 配色：canvas 消费不了 `var()`，故与指板图同一条路 —— 从根元素解析一次 CSS 变量、按主题缓存
 * （见 resolveArrangePalette）。三档主题（亮 / 暗 / 高对比）切换时缓存键随之变化。
 *
 * 与 DOM 版相比**有意的**视觉简化（不是漏掉的）：
 * 槽上的「清除和弦」钮画在槽内右上角而非槽外上方（理由见 ArrangeSlotBox.removeButton）。
 *
 * 拖拽落点的视觉反馈**只在落点槽上给一圈实线框**。DOM 版靠把落点行的槽撑高到 `min-h-[108px]` 表达
 * 「可以落在这一行」；canvas 版一度改成「整行一圈虚线框 + 落点槽实线框」，行级那圈已去掉（用户明确
 * 要求）—— 行级反馈由行自身的悬停底色 / 边框承担（指针在行内时本就会亮），落点位置由落点槽的实线框给出。
 */
import { renderFretboard } from '@/domains/fretboard/components/renderFretboardCanvas';
import { PLUS_ICON_PATH, TRASH_ICON_PATH } from '@/domains/score/editor/render/arrangeIconPaths';
import { arrangeGlyphFont, arrangeLineIndexFont, glyphTextOf } from '@/domains/score/editor/render/arrangeLineLayout';
import { isLyricSeparator } from '@/domains/score/model/lyricChars';
import { activeTheme } from '@/platform/composables/useTheme';
import { resolveFretboardCanvasPalette } from '@/platform/utils/canvasPalette';
import { isClient } from '@/platform/utils/common';

import type { ArrangeLineLayout, ArrangeRect, ArrangeSlotBox } from './arrangeLineLayout';
import type { SlotKey } from '@/domains/score/types';

// ---- 配色 ----

/** 排列区 canvas 用到的语义色（键名对应 tokens 的 CSS 变量，见下方映射表） */
export interface ArrangePalette {
  /** 行号文字（次级） */
  lineText: string;
  /** 字形主色 */
  glyphText: string;
  /** 分隔符字形（降一档） */
  glyphMuted: string;
  /** 主题强调色（落点框、「+」、字形 hover 染色） */
  primary: string;
  /** 危险色（行末删除钮） */
  danger: string;
  /** 行悬停边框 */
  lineBorder: string;
  /** 行悬停底色 */
  lineBg: string;
  /** 槽悬停底色 */
  slotHoverBg: string;
  /** 指板图卡底色 */
  cardBg: string;
  /** 指板图卡描边 */
  cardBorder: string;
  /** 面板目标（待写入）虚线框 */
  pickerOutline: string;
  /** 槽上清除钮的底色（半透明遮住底下的指板图） */
  removeButtonBg: string;
  /** 实心危险底上的文字 / 图标色（两个删除钮的悬停态用） */
  onSolid: string;
}

/** 调色板键 → CSS 变量名（单一映射源） */
const ARRANGE_VAR_MAP: Record<keyof ArrangePalette, string> = {
  lineText: '--text-muted',
  glyphText: '--text-title',
  glyphMuted: '--text-muted',
  primary: '--color-primary',
  danger: '--color-danger',
  lineBorder: '--border-base',
  lineBg: '--bg-panel-hover',
  slotHoverBg: '--tint-primary-88',
  cardBg: '--bg-panel-subtle',
  cardBorder: '--border-light',
  pickerOutline: '--tint-primary-45',
  removeButtonBg: '--bg-panel',
  onSolid: '--text-on-solid',
};

/**
 * 兜底配色（亮色档的近似值）。
 *
 * 只在两处生效：无 DOM 的环境（测试 / Worker）与某个变量读到空串时。**不设主题感知** ——
 * 它是「解析失败」的信号，不是另一套配色；真机上 tokens 必定给出值（口径与 fretboardCanvasPalette 一致）。
 */
const ARRANGE_PALETTE_FALLBACK: ArrangePalette = {
  lineText: '#6b7280',
  glyphText: '#111827',
  glyphMuted: '#6b7280',
  primary: '#6366f1',
  danger: '#dc2626',
  lineBorder: '#d1d5db',
  lineBg: '#f3f4f6',
  slotHoverBg: 'rgba(99, 102, 241, 0.12)',
  cardBg: '#fafafa',
  cardBorder: '#e5e7eb',
  pickerOutline: 'rgba(99, 102, 241, 0.45)',
  removeButtonBg: '#ffffff',
  onSolid: '#ffffff',
};

let paletteCacheKey = '';
let paletteCache: ArrangePalette | null = null;

/**
 * 解析当前主题下的排列区配色（按主题缓存）。
 *
 * 缓存键取「生效主题 + 根元素上的 data-theme / .dark」：与 fretboardCanvasPalette 同口径 ——
 * 主题一变键即变，自然失效取到新配色，无需额外的主动清理。
 */
export const resolveArrangePalette = (): ArrangePalette => {
  if (!isClient) return ARRANGE_PALETTE_FALLBACK;
  const root = document.documentElement;
  const cacheKey = `${activeTheme.value}|${root.getAttribute('data-theme') ?? ''}|${root.classList.contains('dark') ? 1 : 0}`;
  if (paletteCache && paletteCacheKey === cacheKey) return paletteCache;

  const style = getComputedStyle(root);
  const palette = {} as ArrangePalette;
  for (const [key, varName] of Object.entries(ARRANGE_VAR_MAP))
    palette[key as keyof ArrangePalette] =
      style.getPropertyValue(varName).trim() || ARRANGE_PALETTE_FALLBACK[key as keyof ArrangePalette];

  paletteCacheKey = cacheKey;
  paletteCache = palette;
  return palette;
};

// ---- 视觉状态 ----

/** 一行的全部视觉状态：全部由宿主按当前交互态给，绘制只读不判 */
export interface ArrangeLineVisualState {
  /** 本行被悬停（或键盘焦点所在，后者已随键盘导航一并移除） */
  hoveredLine: boolean;
  /** 当前指针所在的槽（槽级 hover 底色与字形染色） */
  hoveredSlotKey: SlotKey | null;
  /** 选器和弦面板的当前目标槽 */
  pickerTargetKey: SlotKey | null;
  /** 当前拖拽落点槽 */
  dropTargetKey: SlotKey | null;
  /** 拖拽源槽（整体淡化） */
  dragSourceKey: SlotKey | null;
  /** 长按等待期正在蓄势的槽（触摸端起拖前的按压反馈） */
  pressArmingKey: SlotKey | null;
  /** 行末删除钮是否可见（行悬停，或没有悬停能力的设备常驻） */
  deleteVisible: boolean;
  /** 行末删除钮是否被指针压住（悬停态：实心底 + 反色图标） */
  deleteHovered: boolean;
  /** 槽上的清除钮**可见**的那一枚（键为槽位；null = 本行没有） */
  removeVisibleKey: SlotKey | null;
  /**
   * 清除钮是否常驻可见（没有悬停能力的设备：触屏上槽级 hover 永不匹配，钮无处可依附）。
   * 这一档与 `removeVisibleKey` 是**并列**关系，不是覆盖关系。
   */
  removeAlwaysVisible: boolean;
  /** 被指针压住的那枚槽上清除钮（键为槽位；null = 没有）—— 悬停态只作用于这一枚 */
  removeHoveredKey: SlotKey | null;
  /** 两枚「+」是否可见（行悬停 / 落点行 / 没有悬停能力的设备常驻） */
  addButtonVisible: boolean;
}

/** 绘制用参数（几何量由 layout 给出，这里只有影响笔触与指板图的项） */
export interface ArrangePaintOptions {
  /** 字号缩放（与排版同一个数，用于拼字体串） */
  fontScale: number;
  /** 指板图卡画布倍率 */
  cardScale: number;
  trimEmptyEdgeFrets: boolean;
  showBarre: boolean;
  shorthand: boolean;
}

// ---- 绘制原语 ----

/** 圆角矩形路径（不依赖 `ctx.roundRect`：后者在部分环境里缺失，且我们只需要这一种形态） */
const roundRectPath = (ctx: CanvasRenderingContext2D, rect: ArrangeRect, radius: number): void => {
  const r = Math.max(0, Math.min(radius, rect.w / 2, rect.h / 2));
  ctx.beginPath();
  ctx.moveTo(rect.x + r, rect.y);
  ctx.arcTo(rect.x + rect.w, rect.y, rect.x + rect.w, rect.y + rect.h, r);
  ctx.arcTo(rect.x + rect.w, rect.y + rect.h, rect.x, rect.y + rect.h, r);
  ctx.arcTo(rect.x, rect.y + rect.h, rect.x, rect.y, r);
  ctx.arcTo(rect.x, rect.y, rect.x + rect.w, rect.y, r);
  ctx.closePath();
};

/** lucide 图标路径见 `arrangeIconPaths`（单独成文件：路径是一长串指令，且会被 Tailwind 的
 *  「重复类名」规则误判，需要一条文件级的例外注释，不该夹在绘制逻辑中间） */

const iconPathCache = new Map<string, Path2D>();

/** 惰性构造并缓存图标路径（Path2D 的 SVG 解析只在首次付一次代价） */
const getIconPath = (d: string): Path2D | null => {
  if (typeof Path2D === 'undefined') return null;
  const cached = iconPathCache.get(d);
  if (cached) return cached;
  const path = new Path2D(d);
  iconPathCache.set(d, path);
  return path;
};

/** 在矩形中央画一枚 24 视口图标（视觉边长取矩形较短边的 `iconRatio` 倍） */
const drawIcon = (
  ctx: CanvasRenderingContext2D,
  d: string,
  rect: ArrangeRect,
  color: string,
  iconRatio: number
): void => {
  const path = getIconPath(d);
  if (!path) return;
  const size = Math.min(rect.w, rect.h) * iconRatio;
  const scale = size / 24;
  ctx.save();
  ctx.translate(rect.x + (rect.w - size) / 2, rect.y + (rect.h - size) / 2);
  ctx.scale(scale, scale);
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.stroke(path);
  ctx.restore();
};

// 字形文本（空格用不换行空格撑宽）与排版量宽共用同一份 glyphTextOf —— 见 arrangeLineLayout。
// 「是否歌词分隔符」见 model/lyricChars（主线程与导出 Worker 共用同一份判定）。

/** 指板图卡：底色 + 描边 + 三层合成的指板图 */
const drawCard = (
  ctx: CanvasRenderingContext2D,
  slot: ArrangeSlotBox,
  palette: ArrangePalette,
  options: ArrangePaintOptions
): void => {
  const { card } = slot;
  if (!card || !slot.chord) return;

  roundRectPath(ctx, card, 6);
  ctx.fillStyle = palette.cardBg;
  ctx.fill();
  ctx.strokeStyle = palette.cardBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  // 指板图按 `scale` 放大绘制：几何量（宽高）与 chordCardCanvasSizePx 同源，故内缩一圈描边后
  // 恰好铺满卡片。名字可用宽按「卡内宽 − 两侧留白」给出（与 FretboardCanvas 的 chordNameMaxWidth 同口径）
  const innerW = card.w - 2;
  ctx.save();
  ctx.translate(card.x + 1, card.y + 1);
  ctx.scale(options.cardScale, options.cardScale);
  renderFretboard(ctx, {
    chord: slot.chord,
    colors: resolveFretboardCanvasPalette(),
    shorthand: options.shorthand,
    showChordName: true,
    chordNameMaxWidth: innerW / options.cardScale - 8,
    showOpenStringNotes: true,
    showFretNumbers: true,
    showBoldNut: true,
    showBarre: options.showBarre,
    trimEmptyEdgeFrets: options.trimEmptyEdgeFrets,
  });
  ctx.restore();
};

/** 一个槽：hover 底色 → 卡片 → 字形 → 「+」/清除钮 → 落点框 / 面板目标框 */
const drawSlot = (
  ctx: CanvasRenderingContext2D,
  slot: ArrangeSlotBox,
  state: ArrangeLineVisualState,
  palette: ArrangePalette,
  options: ArrangePaintOptions
): void => {
  const isSource = state.dragSourceKey === slot.slotKey;
  const isHovered = state.hoveredSlotKey === slot.slotKey;

  ctx.save();
  // 拖拽源整体淡化（DOM 版是 opacity-35 + 一圈聚焦环，这里取淡化这一条：
  // 环形描边在 24px 宽的槽上会与落点框抢注意力，而落点框才是拖拽中唯一需要读的信息）
  if (isSource) ctx.globalAlpha = 0.35;

  if (isHovered && !isSource) {
    roundRectPath(ctx, slot.rect, 6);
    ctx.fillStyle = palette.slotHoverBg;
    ctx.fill();
  }

  drawCard(ctx, slot, palette, options);

  // 字形：分隔符降为常规字重 + 次级色，其余是标题色（hover 时染主题色）
  if (slot.glyph) {
    const separator = isLyricSeparator(slot.char);
    ctx.font = arrangeGlyphFont(options.fontScale, separator ? 400 : 600);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isHovered && !isSource ? palette.primary : separator ? palette.glyphMuted : palette.glyphText;
    ctx.fillText(glyphTextOf(slot.char), slot.glyph.x + slot.glyph.w / 2, slot.glyph.y + slot.glyph.h / 2);
  }

  // 添加槽的「+」：行悬停 / 落点行 / 无悬停能力的设备才可见（DOM 版由 CSS 的三档显隐表达）
  const isAddSlot = slot.kind === 'add-start' || slot.kind === 'add-end';
  /** 本槽是选器和弦面板的目标槽（「选中」态） */
  const isPickerTarget = state.pickerTargetKey === slot.slotKey;
  // 「+」的显隐：行悬停 / 落点行 / 无悬停能力的设备（DOM 版由 CSS 三档表达），**外加本槽是面板目标**。
  // 后者不是锦上添花：点击「+」打开面板后指针通常随即移开，只认行悬停的话按钮当场消失、只剩一圈
  // 虚线框，「这一格已被选中」就看不出来了。DOM 版靠点击后的焦点态（`group-focus-within`）承担这件事，
  // canvas 里没有可聚焦元素，故由这条补上 —— 选中即常显。
  if (isAddSlot && (state.addButtonVisible || isPickerTarget))
    drawIcon(ctx, PLUS_ICON_PATH, slot.rect, palette.primary, 0.62);

  // 槽上的清除钮：只在可见时画。**可见性按槽归约**（DOM 版里它是槽根上的 `group-hover`，只有指针
  // 所在的那一格浮现）—— 给成行级布尔的话，指针移到同行任意一个槽（含两枚「+」）上，整行和弦卡片的
  // 清除钮会一起冒出来，观感就是「闪一下」。无悬停能力的设备另走常驻档。
  const removeVisible = state.removeAlwaysVisible || state.removeVisibleKey === slot.slotKey;
  if (slot.removeButton && removeVisible && !isSource) {
    // 指针压住它时切到**实心危险底 + 反色图标**：与行末删除钮同一套悬停语言，
    // 也是「这一下点下去是删除」的即时承诺（DOM 版的 ActionButton 有 hover 底色，这里补上）
    const removeHovered = state.removeHoveredKey === slot.slotKey;
    roundRectPath(ctx, slot.removeButton, 6);
    ctx.fillStyle = removeHovered ? palette.danger : palette.removeButtonBg;
    ctx.globalAlpha = removeHovered ? 1 : 0.92;
    ctx.fill();
    ctx.globalAlpha = 1;
    drawIcon(ctx, TRASH_ICON_PATH, slot.removeButton, removeHovered ? palette.onSolid : palette.glyphMuted, 0.68);
  }

  // 长按蓄势：槽外圈主题色实环（DOM 版是 scale + box-shadow 环）
  if (state.pressArmingKey === slot.slotKey) {
    roundRectPath(ctx, slot.rect, 6);
    ctx.lineWidth = 2;
    ctx.strokeStyle = palette.primary;
    ctx.stroke();
  }

  // 落点框：实线主题色（DOM 版的 `.slot-drop-layer`）
  if (state.dropTargetKey === slot.slotKey) {
    const rect = { x: slot.rect.x + 2, y: slot.rect.y + 2, w: slot.rect.w - 4, h: slot.rect.h - 4 };
    roundRectPath(ctx, rect, 5);
    ctx.lineWidth = 2;
    ctx.strokeStyle = palette.primary;
    ctx.stroke();
  }

  // 面板目标框：虚线（DOM 版的 `.is-picker-target` 的 `outline-2 dashed -outline-offset-2`）。
  // 只认状态、不认悬停：面板开着、目标还是这一格，框就一直在。
  if (isPickerTarget) {
    const rect = { x: slot.rect.x - 2, y: slot.rect.y - 2, w: slot.rect.w + 4, h: slot.rect.h + 4 };
    roundRectPath(ctx, rect, 5);
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = palette.pickerOutline;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
};

/**
 * 画一整行。
 *
 * 调用方负责：把 ctx 变换到**行局部逻辑坐标**（含 DPR 与容器 zoom），并按 `layout.width` /
 * `layout.height` 准备画布尺寸。本函数不清屏、不做任何裁剪。
 */
export const paintArrangeLine = (
  ctx: CanvasRenderingContext2D,
  layout: ArrangeLineLayout,
  state: ArrangeLineVisualState,
  options: ArrangePaintOptions
): void => {
  const palette = resolveArrangePalette();

  // 行悬停：圆角底 + 边框（DOM 版的 `hover:bg-surface-panel-hover hover:border-border-base`）。
  // ⚠️ lineRect 铺满整张行画布，而 stroke 以路径为中心、半个线宽落在路径外侧 —— 直接对着
  // lineRect 描边，外半侧会被画布边界裁掉：四条直边只剩 0.5px 细线、四角弧却是完整 1px 粗线，
  // 两种宽度在弧与直边的衔接处突变，外侧包络还折出一个方角 —— 放大看就是四角的「猫耳」。
  // 整体内缩半个线宽让描边完整落在画布内（与 DOM border 画在盒内的口径一致），全周粗细一致。
  if (state.hoveredLine) {
    const halfBorder = 0.5;
    roundRectPath(
      ctx,
      {
        x: layout.lineRect.x + halfBorder,
        y: layout.lineRect.y + halfBorder,
        w: layout.lineRect.w - halfBorder * 2,
        h: layout.lineRect.h - halfBorder * 2,
      },
      10
    );
    ctx.fillStyle = palette.lineBg;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = palette.lineBorder;
    ctx.stroke();
  }

  // 拖拽落点**不在这里画行级框**：DOM 版是把落点行的槽撑到 min-h 108px，canvas 版一度改画整行一圈
  // 虚线，现已去掉（用户明确要求）—— 行级反馈交给上面那段行悬停（指针在行内时本就会亮），
  // 落点位置由落点槽自己那圈实线框给出（见 drawSlot）。
  for (const slot of layout.slots) drawSlot(ctx, slot, state, palette, options);

  // 行末删除钮（DOM 版是三档显隐，可见性由宿主折算成 deleteVisible）。
  // 悬停时与槽上清除钮同款：实心危险底 + 反色图标
  if (state.deleteVisible) {
    if (state.deleteHovered) {
      roundRectPath(ctx, layout.deleteRect, 6);
      ctx.fillStyle = palette.danger;
      ctx.fill();
    }
    drawIcon(ctx, TRASH_ICON_PATH, layout.deleteRect, state.deleteHovered ? palette.onSolid : palette.danger, 0.66);
  }

  // 行号：贴内容区底沿（DOM 版的 `items-end pb-0.5`），次级文字色。
  // 整段包在 save/restore 里：`font` / `textAlign` / `textBaseline` 是**画布级**状态，行号要
  // 'middle' 才居中在行号矩形上，不收回去就会污染同一张画布后续的绘制 —— 下一次重绘里的和弦名
  // （按 'alphabetic' 画的）会整体下移半个字高，而改画布尺寸会重置状态、把它又「修好」，
  // 于是表现为「拖动后正常、鼠标移出字符就错位」。画布级状态一律自己收口，不留跨调用的隐性契约。
  ctx.save();
  ctx.font = arrangeLineIndexFont();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = palette.lineText;
  ctx.fillText(layout.lineIndexText, layout.lineIndexRect.x, layout.lineIndexRect.y + layout.lineIndexRect.h / 2);
  ctx.restore();
};
