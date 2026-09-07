/**
 * 指板图 Canvas 渲染器（纯函数，无 Vue 依赖）
 * 被 FretboardCanvas.vue 和 WorkbenchExportPanel.vue 复用。
 */
import { parseChordNameTokens } from '@/domains/chord/theory/chordNameTokens';
import { getChordName } from '@/domains/chord/theory/theory';
import { DEFAULT_FRET_COUNT, FRETBOARD_CANVAS_CONFIG, MIN_FRET_COUNT } from '@/domains/fretboard/constants';

import type { Chord } from '@/domains/chord/types';
import type { FretboardCanvasPalette } from '@/domains/fretboard/fretboardCanvasPalette';

export type FretboardThemeColors = FretboardCanvasPalette;

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
}

/**
 * 按显隐状态动态计算指板布局：隐藏的元素不再占位，画布随之收紧。
 * 全部显示且零品粗弦枕时，结果与原有固定常量布局一致（左 14 / 顶 30）。
 */
export function computeFretboardLayout(opts: {
  stringCount: number;
  fretCount: number;
  fretOffset?: number;
  showChordName?: boolean;
  showOpenStringNotes?: boolean;
  showFretNumbers?: boolean;
  showBoldNut?: boolean;
}): FretboardLayout {
  const {
    stringCount,
    fretCount,
    fretOffset = 0,
    showChordName = true,
    showOpenStringNotes = true,
    showFretNumbers = true,
    showBoldNut = true,
  } = opts;

  const leftPad = showFretNumbers ? FRETBOARD_CANVAS_CONFIG.FRETBOARD_LEFT_PAD : MIN_LEFT_PAD;
  const boardWidth = (stringCount - 1) * FRETBOARD_CANVAS_CONFIG.STRING_SPACING;

  // 和弦名自带约 5~6px 上留白；不显示和弦名时，顶部以 GRID_PAD（6px）作为基础留白，保证画布始终有呼吸感
  let top = showChordName ? 0 : GRID_PAD;
  let chordNameBaselineY = 0;
  let markerCenterY = 0;
  if (showChordName) {
    chordNameBaselineY = top + FRETBOARD_CANVAS_CONFIG.CHORD_NAME_BASELINE_Y;
    top += CHORD_NAME_BLOCK_H;
  }
  if (showOpenStringNotes) {
    markerCenterY = top + MARKER_BLOCK_H / 2;
    top += MARKER_BLOCK_H;
  }
  top = Math.max(top, GRID_PAD);

  const hasTopElements = showChordName || showOpenStringNotes;
  // 1. 有上方元素（和弦名或空弦标记）时：零品到空弦距离保持恒定，始终预留加粗弦枕高度，切换 0-1 品与弦枕粗细时指板位置恒定不跳动
  // 2. 无上方元素时：去掉空弦预留距离，上下留白统一为 GRID_PAD 保持严格对称（若有加粗弦枕则加上弦枕高度，使弦枕顶部距上边缘恰好 GRID_PAD）
  const gridTop = hasTopElements
    ? top + FRETBOARD_CANVAS_CONFIG.NUT_HEIGHT
    : top + (fretOffset === 0 && showBoldNut ? FRETBOARD_CANVAS_CONFIG.NUT_HEIGHT : 0);

  return {
    width: leftPad * 2 + boardWidth,
    height: gridTop + fretCount * FRETBOARD_CANVAS_CONFIG.FRET_HEIGHT + GRID_PAD,
    gridTop,
    startStrX: leftPad,
    chordNameBaselineY,
    markerCenterY,
  };
}

/**
 * 在给定的 CanvasRenderingContext2D 上绘制完整指板图。
 * 调用者负责 clearRect、scale 等前置准备；此函数不清空画布，也不做背景填充。
 */
export function renderFretboard(ctx: CanvasRenderingContext2D, opts: RenderFretboardOptions): void {
  const {
    chord,
    colors,
    chordNameScale = 1.0,
    shorthand = true,
    showChordName = true,
    showOpenStringNotes = true,
    showFretNumbers = true,
    showBoldNut = true,
    showBarre = true,
  } = opts;
  const fc = Math.max(MIN_FRET_COUNT, chord.fretCount || DEFAULT_FRET_COUNT);
  const chordName = getChordName(chord, { shorthand });
  const stringCount = chord.strings?.length || 6;

  const layout = computeFretboardLayout({
    stringCount,
    fretCount: fc,
    fretOffset: chord.fretOffset ?? 0,
    showChordName,
    showOpenStringNotes,
    showFretNumbers,
    showBoldNut,
  });
  const { startStrX, gridTop, chordNameBaselineY, markerCenterY } = layout;
  const boardCenterX = startStrX + ((stringCount - 1) * FRETBOARD_CANVAS_CONFIG.STRING_SPACING) / 2;
  const gridBottom = gridTop + fc * FRETBOARD_CANVAS_CONFIG.FRET_HEIGHT;
  const gridRight = startStrX + (stringCount - 1) * FRETBOARD_CANVAS_CONFIG.STRING_SPACING;

  // 1. 和弦名称（基线取自配置，保证图内顶部留白）
  if (showChordName) {
    drawFormattedChordName(ctx, boardCenterX, chordNameBaselineY, chordName, colors.TEXT, chordNameScale);
  }

  // 2. 空弦 / 静音标记（○ 空弦圆点、× 静音叉号）
  if (showOpenStringNotes) {
    const markerY = markerCenterY;
    for (let s = 0; s < stringCount; s++) {
      const sx = startStrX + s * FRETBOARD_CANVAS_CONFIG.STRING_SPACING;
      const strData = chord.strings[s];
      const fret = strData ? strData[0] : 0;

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

  // 3. 网格线（琴弦竖线 + 品丝横线）
  ctx.strokeStyle = colors.FB_LINE;
  ctx.lineWidth = 1;
  for (let s = 0; s < stringCount; s++) {
    const sx = startStrX + s * FRETBOARD_CANVAS_CONFIG.STRING_SPACING;
    ctx.beginPath();
    ctx.moveTo(sx, gridTop);
    ctx.lineTo(sx, gridBottom);
    ctx.stroke();
  }
  for (let f = 0; f <= fc; f++) {
    const fy = gridTop + f * FRETBOARD_CANVAS_CONFIG.FRET_HEIGHT;
    ctx.beginPath();
    ctx.moveTo(startStrX, fy);
    ctx.lineTo(gridRight, fy);
    ctx.stroke();
  }

  // 4. 弦枕（仅零品绘制）：showBoldNut=true 画粗弦枕块；false 时零品仅留普通品丝线条粗细
  const offset = chord.fretOffset ?? 0;
  if (offset === 0 && showBoldNut) {
    ctx.fillStyle = colors.FB_NUT;
    ctx.fillRect(
      startStrX - 0.5,
      gridTop - FRETBOARD_CANVAS_CONFIG.NUT_HEIGHT,
      (stringCount - 1) * FRETBOARD_CANVAS_CONFIG.STRING_SPACING + 1,
      FRETBOARD_CANVAS_CONFIG.NUT_HEIGHT
    );
  }

  // 5. 品号
  if (showFretNumbers) {
    ctx.font = `bold ${FRETBOARD_CANVAS_CONFIG.CAPO_TEXT_FONT_SIZE}px system-ui, sans-serif`;
    ctx.fillStyle = colors.SUB_TEXT;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let f = 1; f < fc; f++) {
      const fy = gridTop + f * FRETBOARD_CANVAS_CONFIG.FRET_HEIGHT;
      const fretNumber = offset > 0 ? offset + f : f;
      ctx.fillText(String(fretNumber), startStrX - FRETBOARD_CANVAS_CONFIG.FRET_NUMBER_X_OFFSET, fy);
    }
    ctx.textBaseline = 'alphabetic';
  }

  // 6. 大横按（showBarre=false 时隐藏横按梁）
  if (showBarre && chord.barres && chord.barres.length > 0) {
    const barreHalfH = FRETBOARD_CANVAS_CONFIG.BARRE_THICKNESS / 2;
    for (const b of chord.barres) {
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

  // 7. 按弦圆点
  for (let s = 0; s < stringCount; s++) {
    const strData = chord.strings[s];
    const fret = strData ? strData[0] : 0;
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
    fretOffset: chord.fretOffset ?? 0,
    showChordName,
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

  const ctx = canvas.getContext('2d')!;
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
