/**
 * 指板图 Canvas 渲染器（纯函数，无 Vue 依赖）
 * 被 FretboardCanvas.vue 和 WorkbenchExportPanel.vue 复用。
 */
import { parseChordNameTokens } from '@/domains/chord/theory/chordNameTokens';
import { getChordName } from '@/domains/chord/theory/theory';
import { DEFAULT_FRET_COUNT, FRETBOARD_CANVAS_CONFIG, MIN_FRET_COUNT } from '@/domains/fretboard/constants';
import { isBarreStillValid } from '@/domains/fretboard/model/coordinates';

import type { Chord } from '@/domains/chord/types';
import type { FretboardCanvasPalette } from '@/domains/fretboard/fretboardCanvasPalette';

export type FretboardThemeColors = FretboardCanvasPalette;

/**
 * 整图渲染选项。三层（名字 / 主体 / 品号）共用同一份选项对象，各层只读自己需要的字段，
 * 故调用方无需按层裁剪；字段归属见下面三个分层函数的注释。
 */
export interface RenderFretboardOptions {
  chord: Chord;
  /** 主题配色（LIGHT / DARK 或自定义） */
  colors: FretboardThemeColors;
  /** 和弦名字号缩放比（默认 1.0） */
  chordNameScale?: number;
  /** 是否使用简写符号（M/°/+） */
  shorthand?: boolean;
  /** 是否绘制和弦名（默认 true） */
  showChordName?: boolean;
  /**
   * 是否**预留**和弦名版面（缺省跟随 showChordName）。
   *
   * 与 showChordName 的分工：showChordName 只决定「画不画那几个字」（名字层，不进位图），
   * 本项决定「名字位占不占位」（影响画布几何）。传 true 且 showChordName=false 时，画布几何
   * 与「显示名字」时逐像素一致 —— 主体层位图因此可与 picker 这类显示名字的消费方共用同一张。
   * 消费方按 layout.nameReserveH 裁掉顶部空白即可保持视觉不变。
   */
  reserveChordName?: boolean;
  /** 是否显示空弦○与静音×标记（默认 true） */
  showOpenStringNotes?: boolean;
  /** 是否显示左侧品号数字（默认 true） */
  showFretNumbers?: boolean;
  /** 是否显示加粗弦枕（默认 true；false 时零品仅留普通品丝线条） */
  showBoldNut?: boolean;
  /** 是否绘制大横按（默认 true；false 时隐藏横按梁，仅保留按弦圆点） */
  showBarre?: boolean;
}

// ---- 内部辅助 ----

/** 逐 token 度量和弦名宽度：主名与升降号上标使用不同字号，需分别测量后累加 */
function measureChordNameLayout(ctx: CanvasRenderingContext2D, chordName: string, fontScale = 1.0) {
  const baseFontSize = Math.max(9, Math.round(FRETBOARD_CANVAS_CONFIG.CHORD_NAME_FONT_SIZE * fontScale));
  const accFontSize = Math.max(7, Math.round(FRETBOARD_CANVAS_CONFIG.ACCIDENTAL_FONT_SIZE * fontScale));
  const baseFont = `bold ${baseFontSize}px system-ui, -apple-system, sans-serif`;
  const accFont = `bold ${accFontSize}px system-ui, -apple-system, sans-serif`;

  let totalWidth = 0;
  const measured = parseChordNameTokens(chordName).map(token => {
    ctx.font = token.isAccidental ? accFont : baseFont;
    const width = ctx.measureText(token.text).width;
    totalWidth += width;
    return { ...token, width };
  });
  return { measured, totalWidth };
}

function drawFormattedChordName(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  baselineY: number,
  chordName: string,
  color: string,
  fontScale = 1.0
) {
  const { measured, totalWidth } = measureChordNameLayout(ctx, chordName, fontScale);
  if (measured.length === 0) return;

  const accFontSize = Math.max(7, Math.round(FRETBOARD_CANVAS_CONFIG.ACCIDENTAL_FONT_SIZE * fontScale));
  const accFont = `bold ${accFontSize}px system-ui, -apple-system, sans-serif`;
  const baseFont = `bold ${Math.max(9, Math.round(FRETBOARD_CANVAS_CONFIG.CHORD_NAME_FONT_SIZE * fontScale))}px system-ui, -apple-system, sans-serif`;
  const superOffset = Math.round(FRETBOARD_CANVAS_CONFIG.ACCIDENTAL_SUPERSCRIPT_OFFSET * fontScale);

  let curX = centerX - totalWidth / 2;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  for (const item of measured) {
    ctx.font = item.isAccidental ? accFont : baseFont;
    const y = item.isAccidental ? baselineY + superOffset : baselineY;
    ctx.fillText(item.text, curX, y);
    curX += item.width;
  }
}

// ---- 布局计算 ----

/** 隐藏品号时的最小水平留白（px，须大于大横按端头半宽 4.2px 及按弦圆点半径 3.8px，避免边缘音符被裁切） */
const MIN_LEFT_PAD = 7;
/** 网格上下统一留白（px），保证上下边距一致 */
const GRID_PAD = 6;
/** 和弦名区块高度（px，含基线与字高） */
const CHORD_NAME_BLOCK_H = 18;
/** 空弦/静音标记区块高度（px，直径 + 上下间隙） */
const MARKER_BLOCK_H = 8.4;

export interface FretboardLayout {
  /** 画布宽度（左右对称留白 + 指板宽） */
  width: number;
  /** 画布高度 */
  height: number;
  /** 网格顶部 Y */
  gridTop: number;
  /** 第一根弦 X */
  startStrX: number;
  /** 和弦名基线 Y */
  chordNameBaselineY: number;
  /** 空弦/静音标记中心 Y */
  markerCenterY: number;
  /**
   * 「预留了名字位但未绘制」时顶部多出的高度（逻辑px；其余情况为 0）。
   *
   * 由「预留布局 gridTop − 紧凑布局 gridTop」精确算出（两布局下缘同为 GRID_PAD，故高度差 ≡ gridTop 差）。
   * 常规显隐组合下即 `CHORD_NAME_BLOCK_H - GRID_PAD = 12`。消费方把位图整体上移这么多并减去同量高度，
   * 即可让「不画名字」的视觉与改造前逐像素一致。
   */
  nameReserveH: number;
}

/**
 * 按显隐状态动态计算指板布局：隐藏的元素不再占位，画布随之收紧。
 * 全部显示且零品粗弦枕时，结果与原有固定常量布局一致（左 14 / 顶 30）。
 *
 * 本函数只处理「占位」，不处理「绘制」—— 两个维度各自与「画不画」解耦，都为了同一件事：
 * 让主体层位图与这些显示参数无关，从而可跨消费方共用。
 *  1. 名字位：由 reserveChordName 决定（缺省跟随 showChordName）。预留但未绘制时几何与「显示名字」
 *     逐像素一致，调用方按 nameReserveH 裁掉顶部空白即视觉不变；
 *  2. 弦枕位：零品弦枕虽只在 fretOffset === 0 时绘制（属品号层，见 renderFretboardFretMarks），
 *     但 NUT_HEIGHT 在 hasTopElements 时**无条件预留**，故 offset=0（画弦枕）与 offset≠0（不画）
 *     的画布几何完全一致。于是同一指法无论落在哪个品位窗口、是否画弦枕，都可共用同一张主体层位图。
 */
export function computeFretboardLayout(opts: {
  stringCount: number;
  fretCount: number;
  showChordName?: boolean;
  /** 是否预留名字版面（缺省跟随 showChordName）；见 RenderFretboardOptions.reserveChordName */
  reserveChordName?: boolean;
  showOpenStringNotes?: boolean;
  showFretNumbers?: boolean;
  showBoldNut?: boolean;
}): FretboardLayout {
  const {
    stringCount,
    fretCount,
    showChordName = true,
    reserveChordName,
    showOpenStringNotes = true,
    showFretNumbers = true,
    showBoldNut = true,
  } = opts;

  const leftPad = showFretNumbers ? FRETBOARD_CANVAS_CONFIG.FRETBOARD_LEFT_PAD : MIN_LEFT_PAD;
  const boardWidth = (stringCount - 1) * FRETBOARD_CANVAS_CONFIG.STRING_SPACING;

  // 名字位由「预留」而非「绘制」决定（缺省跟随 showChordName，故既有调用行为不变）：
  // 预留时顶部自 0 起算并计入名字区块，于是「不画名字但留位」的几何与「显示名字」逐像素一致 ——
  // 这是「不画名字的消费方仍能命中同一张主体层位图」的前提（名字像素本就不在主体层）。
  const reserveName = reserveChordName ?? showChordName;

  /**
   * 按「是否预留名字位」算一套顶部几何。hasTopElements 也随预留走（而非 showChordName），
   * 否则「预留但未绘制」与「显示名字」会在 showOpenStringNotes=false 时差出一个弦枕高，
   * 从而出现「同 key 不同几何」的碰撞。
   */
  const buildTop = (reserve: boolean) => {
    // 和弦名自带约 5~6px 上留白；不预留名字位时，顶部以 GRID_PAD（6px）作为基础留白，保证画布始终有呼吸感
    let top = reserve ? 0 : GRID_PAD;
    const chordNameBaselineY = reserve ? top + FRETBOARD_CANVAS_CONFIG.CHORD_NAME_BASELINE_Y : 0;
    if (reserve) top += CHORD_NAME_BLOCK_H;
    let markerCenterY = 0;
    if (showOpenStringNotes) {
      markerCenterY = top + MARKER_BLOCK_H / 2;
      top += MARKER_BLOCK_H;
    }
    top = Math.max(top, GRID_PAD);

    // 1. 有上方元素（名字位或空弦标记）时：零品到空弦距离保持恒定，始终预留加粗弦枕高度，
    //    切换 0-1 品与弦枕粗细时指板位置恒定不跳动
    // 2. 无上方元素时：去掉空弦预留距离，上下留白统一为 GRID_PAD 保持严格对称（有加粗弦枕则再加弦枕高度，
    //    使弦枕顶部距上边缘恰好 GRID_PAD）。这里只看 showBoldNut 不看 fretOffset —— 见函数头注释
    const hasTopElements = reserve || showOpenStringNotes;
    const gridTop = hasTopElements
      ? top + FRETBOARD_CANVAS_CONFIG.NUT_HEIGHT
      : top + (showBoldNut ? FRETBOARD_CANVAS_CONFIG.NUT_HEIGHT : 0);
    return { top, chordNameBaselineY, markerCenterY, gridTop };
  };

  const reserved = buildTop(true);
  const compact = buildTop(false);
  const active = reserveName ? reserved : compact;

  return {
    width: leftPad * 2 + boardWidth,
    height: active.gridTop + fretCount * FRETBOARD_CANVAS_CONFIG.FRET_HEIGHT + GRID_PAD,
    gridTop: active.gridTop,
    startStrX: leftPad,
    chordNameBaselineY: active.chordNameBaselineY,
    markerCenterY: active.markerCenterY,
    nameReserveH: reserveName && !showChordName ? reserved.gridTop - compact.gridTop : 0,
  };
}

/** 空弦 / 静音标记（○ 空弦圆点、× 静音叉号） */
function drawOpenStringMarkers(
  ctx: CanvasRenderingContext2D,
  chord: Chord,
  startStrX: number,
  markerCenterY: number,
  stringCount: number,
  colors: FretboardCanvasPalette
): void {
  const markerY = markerCenterY;
  for (let s = 0; s < stringCount; s++) {
    const sx = startStrX + s * FRETBOARD_CANVAS_CONFIG.STRING_SPACING;
    const strData = chord.strings[s];
    const fret = strData ? strData.fret : 0;

    if (fret === -1) {
      ctx.strokeStyle = colors.FB_MUTE;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(sx - FRETBOARD_CANVAS_CONFIG.MUTE_CROSS_RADIUS, markerY - FRETBOARD_CANVAS_CONFIG.MUTE_CROSS_RADIUS);
      ctx.lineTo(sx + FRETBOARD_CANVAS_CONFIG.MUTE_CROSS_RADIUS, markerY + FRETBOARD_CANVAS_CONFIG.MUTE_CROSS_RADIUS);
      ctx.moveTo(sx + FRETBOARD_CANVAS_CONFIG.MUTE_CROSS_RADIUS, markerY - FRETBOARD_CANVAS_CONFIG.MUTE_CROSS_RADIUS);
      ctx.lineTo(sx - FRETBOARD_CANVAS_CONFIG.MUTE_CROSS_RADIUS, markerY + FRETBOARD_CANVAS_CONFIG.MUTE_CROSS_RADIUS);
      ctx.stroke();
    } else if (fret === 0) {
      ctx.strokeStyle = colors.FB_OPEN;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(sx, markerY, FRETBOARD_CANVAS_CONFIG.OPEN_CIRCLE_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

/** 网格线（琴弦竖线 + 品丝横线） */
function drawGridLines(
  ctx: CanvasRenderingContext2D,
  startStrX: number,
  gridTop: number,
  gridBottom: number,
  gridRight: number,
  stringCount: number,
  fretCount: number,
  colors: FretboardCanvasPalette
): void {
  ctx.strokeStyle = colors.FB_LINE;
  ctx.lineWidth = 1;
  for (let s = 0; s < stringCount; s++) {
    const sx = startStrX + s * FRETBOARD_CANVAS_CONFIG.STRING_SPACING;
    ctx.beginPath();
    ctx.moveTo(sx, gridTop);
    ctx.lineTo(sx, gridBottom);
    ctx.stroke();
  }
  for (let f = 0; f <= fretCount; f++) {
    const fy = gridTop + f * FRETBOARD_CANVAS_CONFIG.FRET_HEIGHT;
    ctx.beginPath();
    ctx.moveTo(startStrX, fy);
    ctx.lineTo(gridRight, fy);
    ctx.stroke();
  }
}

/** 弦枕（仅零品绘制）：showBoldNut=true 画粗弦枕块；false 时零品仅留普通品丝线条粗细 */
function drawNut(
  ctx: CanvasRenderingContext2D,
  startStrX: number,
  gridTop: number,
  stringCount: number,
  fretOffset: number,
  showBoldNut: boolean,
  colors: FretboardCanvasPalette
): void {
  if (fretOffset !== 0 || !showBoldNut) return;
  ctx.fillStyle = colors.FB_NUT;
  ctx.fillRect(
    startStrX - 0.5,
    gridTop - FRETBOARD_CANVAS_CONFIG.NUT_HEIGHT,
    (stringCount - 1) * FRETBOARD_CANVAS_CONFIG.STRING_SPACING + 1,
    FRETBOARD_CANVAS_CONFIG.NUT_HEIGHT
  );
}

/** 品号（偏移时显示实际品位 = offset + 品序） */
function drawFretNumbers(
  ctx: CanvasRenderingContext2D,
  startStrX: number,
  gridTop: number,
  fretCount: number,
  fretOffset: number,
  colors: FretboardCanvasPalette
): void {
  ctx.font = `bold ${FRETBOARD_CANVAS_CONFIG.CAPO_TEXT_FONT_SIZE}px system-ui, sans-serif`;
  ctx.fillStyle = colors.SUB_TEXT;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let f = 1; f < fretCount; f++) {
    const fy = gridTop + f * FRETBOARD_CANVAS_CONFIG.FRET_HEIGHT;
    const fretNumber = fretOffset > 0 ? fretOffset + f : f;
    ctx.fillText(String(fretNumber), startStrX - FRETBOARD_CANVAS_CONFIG.FRET_NUMBER_X_OFFSET, fy);
  }
  ctx.textBaseline = 'alphabetic';
}

/** 大横按梁（圆角矩形） */
function drawBarres(
  ctx: CanvasRenderingContext2D,
  chord: Chord,
  startStrX: number,
  gridTop: number,
  fretCount: number,
  colors: FretboardCanvasPalette
): void {
  if (!chord.barres || chord.barres.length === 0) return;
  const barreHalfH = FRETBOARD_CANVAS_CONFIG.BARRE_THICKNESS / 2;
  for (const b of chord.barres) {
    // 与 SVG 侧同判据（computeDisplayBarres）：无效横按或越出可见品位窗口的不绘制，
    // 避免库卡/乐谱/导出画出编辑器里不显示的越界梁
    if (b.fret < 1 || b.fret > fretCount) continue;
    if (!isBarreStillValid(chord.strings, b)) continue;
    const bx1 = startStrX + b.fromString * FRETBOARD_CANVAS_CONFIG.STRING_SPACING;
    const bx2 = startStrX + b.toString * FRETBOARD_CANVAS_CONFIG.STRING_SPACING;
    const by = gridTop + (b.fret - 0.5) * FRETBOARD_CANVAS_CONFIG.FRET_HEIGHT;
    const minX = Math.min(bx1, bx2) - barreHalfH;
    const w = Math.abs(bx2 - bx1) + FRETBOARD_CANVAS_CONFIG.BARRE_THICKNESS;
    ctx.fillStyle = colors.FB_BARRE;
    ctx.beginPath();
    ctx.roundRect(minX, by - barreHalfH, w, FRETBOARD_CANVAS_CONFIG.BARRE_THICKNESS, barreHalfH);
    ctx.fill();
  }
}

/** 按弦圆点 */
function drawPressedDots(
  ctx: CanvasRenderingContext2D,
  chord: Chord,
  startStrX: number,
  gridTop: number,
  stringCount: number,
  colors: FretboardCanvasPalette
): void {
  for (let s = 0; s < stringCount; s++) {
    const strData = chord.strings[s];
    const fret = strData ? strData.fret : 0;
    if (fret > 0) {
      const cx = startStrX + s * FRETBOARD_CANVAS_CONFIG.STRING_SPACING;
      const cy = gridTop + (fret - 0.5) * FRETBOARD_CANVAS_CONFIG.FRET_HEIGHT;
      ctx.beginPath();
      ctx.arc(cx, cy, FRETBOARD_CANVAS_CONFIG.DOT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = colors.FB_NOTE;
      ctx.fill();
    }
  }
}

/** 由渲染选项推出几何：三层渲染共用同一套推导（纯算术，重复调用无成本） */
function resolveGeometry(chord: Chord, opts: RenderFretboardOptions) {
  const { showChordName = true, showOpenStringNotes = true, showFretNumbers = true, showBoldNut = true } = opts;
  const fretCount = Math.max(MIN_FRET_COUNT, chord.fretCount || DEFAULT_FRET_COUNT);
  const stringCount = chord.strings?.length || 6;
  const layout = computeFretboardLayout({
    stringCount,
    fretCount,
    showChordName,
    // 未传时由 computeFretboardLayout 回退到「跟随 showChordName」：名字层/品号层因此总是按
    // 「实际可见布局」计算（showChordName=false 的消费方贴裁切后的紧凑布局，故这里必须是紧凑值）
    reserveChordName: opts.reserveChordName,
    showOpenStringNotes,
    showFretNumbers,
    showBoldNut,
  });
  const boardWidth = (stringCount - 1) * FRETBOARD_CANVAS_CONFIG.STRING_SPACING;
  return {
    fretCount,
    stringCount,
    layout,
    // 指板水平中心（和弦名居中基准）
    boardCenterX: layout.startStrX + boardWidth / 2,
    gridBottom: layout.gridTop + fretCount * FRETBOARD_CANVAS_CONFIG.FRET_HEIGHT,
    gridRight: layout.startStrX + boardWidth,
  };
}

/**
 * 名字层：和弦名（含简写与名字缩放）。
 *
 * 依赖和弦名文本，故不进位图缓存，每次绘制现画 —— 改名、切「符号简写」、调名字缩放
 * 都只重画这几个字，指板主体（位图）不受影响。
 *
 * 整图渲染时本层必须最先画：它位于顶部区块，与空弦/静音标记纵向相邻但先画，
 * 保证任何重叠处标记压住名字下伸部（与改造前的绘制顺序一致）。
 */
export function renderFretboardChordName(ctx: CanvasRenderingContext2D, opts: RenderFretboardOptions): void {
  const { chord, colors, chordNameScale = 1.0, shorthand = false, showChordName = true } = opts;
  if (!showChordName) return;
  const { boardCenterX, layout } = resolveGeometry(chord, opts);
  drawFormattedChordName(
    ctx,
    boardCenterX,
    layout.chordNameBaselineY,
    getChordName(chord, { shorthand }),
    colors.TEXT,
    chordNameScale
  );
}

/**
 * 主体层：空弦/静音标记 + 网格线 + 横按梁 + 按弦圆点。
 *
 * 只取决于指板状态（品位/横按/弦数/品数/配色/显隐开关），与和弦名、名字缩放、简写、
 * fretOffset 都无关 —— 因此它正是「指板位图」缓存的内容（见 FretboardCanvas.vue）：
 * 同一指法无论显示多大、配哪个名字、落在哪个品位窗口，都共用这一张图。
 */
export function renderFretboardBody(ctx: CanvasRenderingContext2D, opts: RenderFretboardOptions): void {
  const { chord, colors, showOpenStringNotes = true, showBarre = true } = opts;
  const { stringCount, fretCount, layout, gridBottom, gridRight } = resolveGeometry(chord, opts);

  if (showOpenStringNotes) {
    drawOpenStringMarkers(ctx, chord, layout.startStrX, layout.markerCenterY, stringCount, colors);
  }
  drawGridLines(ctx, layout.startStrX, layout.gridTop, gridBottom, gridRight, stringCount, fretCount, colors);
  if (showBarre) {
    drawBarres(ctx, chord, layout.startStrX, layout.gridTop, fretCount, colors);
  }
  drawPressedDots(ctx, chord, layout.startStrX, layout.gridTop, stringCount, colors);
}

/**
 * 品号层：零品弦枕 + 左侧品号（偏移时按 fretOffset 显示实际品位）。
 *
 * 依赖 fretOffset，故同样不进位图缓存，每次绘制现画。弦枕占位在网格顶线之上、
 * 按弦圆点与横按梁都在其下，故本层整层压在主体层之上不会遮挡任何内容。
 */
export function renderFretboardFretMarks(ctx: CanvasRenderingContext2D, opts: RenderFretboardOptions): void {
  const { chord, colors, showFretNumbers = true, showBoldNut = true } = opts;
  const { stringCount, fretCount, layout } = resolveGeometry(chord, opts);
  const fretOffset = chord.fretOffset ?? 0;

  drawNut(ctx, layout.startStrX, layout.gridTop, stringCount, fretOffset, showBoldNut, colors);
  if (showFretNumbers) {
    drawFretNumbers(ctx, layout.startStrX, layout.gridTop, fretCount, fretOffset, colors);
  }
}

/**
 * 在给定的 CanvasRenderingContext2D 上绘制完整指板图（三层合成，顺序见各层注释）。
 * 调用者负责 clearRect、scale 等前置准备；此函数不清空画布，也不做背景填充。
 */
export function renderFretboard(ctx: CanvasRenderingContext2D, opts: RenderFretboardOptions): void {
  renderFretboardChordName(ctx, opts);
  renderFretboardBody(ctx, opts);
  renderFretboardFretMarks(ctx, opts);
}

/** 导出渲染参数：复用 RenderFretboardOptions 的公共字段，仅扩展导出专属项 */
export type RenderFretboardToCanvasOptions = Omit<RenderFretboardOptions, 'chord' | 'colors'> & {
  /** 导出缩放倍数（默认 3） */
  scale?: number;
  /** 画布配色（tokens.scss 的 --fbc-* 变量运行时解析结果，见 resolveFretboardCanvasPalette） */
  colors: FretboardCanvasPalette;
  /** 背景色（undefined = 透明） */
  bgColor?: string;
};

/**
 * 导出用：将指板图渲染到一个新的离屏 HTMLCanvasElement 并返回。
 */
export function renderFretboardToCanvas(chord: Chord, opts: RenderFretboardToCanvasOptions): HTMLCanvasElement {
  const {
    scale = 3,
    colors,
    shorthand = false,
    chordNameScale = 1.0,
    bgColor,
    showChordName = true,
    showOpenStringNotes = true,
    showFretNumbers = true,
    showBoldNut = true,
    showBarre = true,
  } = opts;

  const fc = Math.max(MIN_FRET_COUNT, chord.fretCount || DEFAULT_FRET_COUNT);
  /** 顶部留白（px，逻辑坐标）：让导出图上方有充足呼吸感 */
  const TOP_PAD = 2;
  /** 和弦名两侧最小留白（px）：名称测宽后按此值扩宽画布，避免长名（如 C♯maj7♯11）被左右裁切 */
  const CHORD_NAME_EDGE_PAD = 4;
  const layout = computeFretboardLayout({
    stringCount: chord.strings?.length || 6,
    fretCount: fc,
    showChordName,
    // 导出图是自包含画布（按 layout.height 直接定尺寸、无人裁剪），故这里固定让名字位跟随
    // showChordName：传 reserveChordName=true 只会在图顶留一段裁不掉的空白
    reserveChordName: showChordName,
    showOpenStringNotes,
    showFretNumbers,
    showBoldNut,
  });
  const baseWidth: number = layout.width;
  const baseHeight = layout.height;

  // 名称宽度测量：按同一字体与缩放测量实际渲染宽度，超出标准容器宽时对称扩宽画布
  const chordName = getChordName(chord, { shorthand });
  const measureCtx = document.createElement('canvas').getContext('2d');
  let canvasWidth = baseWidth;
  if (measureCtx && chordName && showChordName) {
    const { totalWidth } = measureChordNameLayout(measureCtx, chordName, chordNameScale);
    canvasWidth = Math.max(baseWidth, Math.ceil(totalWidth) + CHORD_NAME_EDGE_PAD * 2);
  }

  const physW = Math.round(canvasWidth * scale);
  // 高度加上顶部留白
  const physH = Math.round((baseHeight + TOP_PAD) * scale);

  const canvas = document.createElement('canvas');
  canvas.width = physW;
  canvas.height = physH;

  // getContext('2d') 在极端情况下返回 null（上下文配额耗尽 / canvas 被策略禁用），而下方全部
  // 绘制都依赖它。原先以 `!` 断言吞掉这个分支，届时抛出的是「Cannot set properties of null」
  // 这类指不出原因的错误；这里显式判空并给出可诊断的信息（同文件上方 measureCtx 即此写法）。
  // 不用「返回空白画布」兜底：那会让调用方把一张空图当成功结果保存或上传，事故更隐蔽。
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('无法创建 2D 绘图上下文，指板图导出中止');
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (bgColor) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, physW, physH);
  }

  ctx.save();
  ctx.scale(scale, scale);
  // 整体下移 TOP_PAD，同时处理水平居中偏移（名称撑宽时）
  ctx.translate((canvasWidth - baseWidth) / 2, TOP_PAD);
  renderFretboard(ctx, {
    chord,
    colors,
    chordNameScale,
    shorthand,
    showChordName,
    showOpenStringNotes,
    showFretNumbers,
    showBoldNut,
    showBarre,
  });
  ctx.restore();

  return canvas;
}
