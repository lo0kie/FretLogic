/**
 * 指板图 Canvas 渲染器（纯函数，无 Vue 依赖）
 * 被 FretboardCanvas.vue 和 WorkbenchExportPanel.vue 复用。
 */
import { parseChordNameTokens } from '@/domains/chord/theory/chordNameTokens';
import { getChordName } from '@/domains/chord/theory/theory';
import type { Chord } from '@/domains/chord/types';
import { FRETBOARD_CANVAS_CONFIG } from '@/domains/fretboard/constants';

export type FretboardThemeColors = (typeof FRETBOARD_CANVAS_CONFIG.THEME)['LIGHT' | 'DARK'];

export interface RenderFretboardOptions {
  chord: Chord;
  /** 主题配色（LIGHT / DARK 或自定义） */
  colors: FretboardThemeColors;
  /** 和弦名字号缩放比（默认 1.0） */
  chordNameScale?: number;
  /** 是否使用简写符号（M/°/+） */
  shorthand?: boolean;
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

/**
 * 在给定的 CanvasRenderingContext2D 上绘制完整指板图。
 * 调用者负责 clearRect、scale 等前置准备；此函数不清空画布，也不做背景填充。
 */
export function renderFretboard(ctx: CanvasRenderingContext2D, opts: RenderFretboardOptions): void {
  const { chord, colors, chordNameScale = 1.0, shorthand = false } = opts;
  const fc = Math.max(3, chord.fretCount || 4);
  const chordName = getChordName(chord, { shorthand });
  const stringCount = chord.strings?.length || 6;
  const fretboardWidth = FRETBOARD_CANVAS_CONFIG.getExportFretboardWidth(stringCount);

  const startStrX = FRETBOARD_CANVAS_CONFIG.FRETBOARD_LEFT_PAD;
  const gridTop = FRETBOARD_CANVAS_CONFIG.FRETBOARD_GRID_TOP;
  const gridBottom = gridTop + fc * FRETBOARD_CANVAS_CONFIG.FRET_HEIGHT;
  const gridRight = startStrX + (stringCount - 1) * FRETBOARD_CANVAS_CONFIG.STRING_SPACING;

  // 1. 和弦名称（基线取自配置，保证图内顶部留白）
  drawFormattedChordName(
    ctx,
    fretboardWidth / 2,
    FRETBOARD_CANVAS_CONFIG.CHORD_NAME_BASELINE_Y,
    chordName,
    colors.TEXT,
    chordNameScale
  );

  // 2. 空弦 / 静音标记
  const markerY = FRETBOARD_CANVAS_CONFIG.MARKER_CENTER_Y;
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

  // 4. 弦枕
  const offset = chord.fretOffset ?? 0;
  if (offset === 0) {
    ctx.fillStyle = colors.FB_NUT;
    ctx.fillRect(
      startStrX - 0.5,
      gridTop - FRETBOARD_CANVAS_CONFIG.NUT_HEIGHT,
      (stringCount - 1) * FRETBOARD_CANVAS_CONFIG.STRING_SPACING + 1,
      FRETBOARD_CANVAS_CONFIG.NUT_HEIGHT
    );
  }

  // 5. 品号
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

  // 6. 大横按
  if (chord.barres && chord.barres.length > 0) {
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

/**
 * 导出用：将指板图渲染到一个新的离屏 HTMLCanvasElement 并返回。
 * @param bgColor 背景色（undefined = 透明）
 */
export function renderFretboardToCanvas(
  chord: Chord,
  opts: {
    scale?: number;
    isDarkMode?: boolean;
    shorthand?: boolean;
    chordNameScale?: number;
    bgColor?: string;
  } = {}
): HTMLCanvasElement {
  const { scale = 3, isDarkMode = false, shorthand = false, chordNameScale = 1.0, bgColor } = opts;

  const fc = Math.max(3, chord.fretCount || 4);
  /** 顶部留白（px，逻辑坐标）：让导出图上方有充足呼吸感 */
  const TOP_PAD = 2;
  const BOTTOM_PAD = 6;
  /** 和弦名两侧最小留白（px）：名称测宽后按此值扩宽画布，避免长名（如 C♯maj7♯11）被左右裁切 */
  const CHORD_NAME_EDGE_PAD = 4;
  const baseWidth: number = FRETBOARD_CANVAS_CONFIG.getExportFretboardWidth(chord.strings?.length || 6);
  const baseHeight = FRETBOARD_CANVAS_CONFIG.FRETBOARD_GRID_TOP + fc * FRETBOARD_CANVAS_CONFIG.FRET_HEIGHT + BOTTOM_PAD;

  // 名称宽度测量：按同一字体与缩放测量实际渲染宽度，超出标准容器宽时对称扩宽画布
  const chordName = getChordName(chord, { shorthand });
  const measureCtx = document.createElement('canvas').getContext('2d');
  let canvasWidth = baseWidth;
  if (measureCtx && chordName) {
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

  const colors = isDarkMode ? FRETBOARD_CANVAS_CONFIG.THEME.DARK : FRETBOARD_CANVAS_CONFIG.THEME.LIGHT;
  ctx.save();
  ctx.scale(scale, scale);
  // 整体下移 TOP_PAD，同时处理水平居中偏移（名称撑宽时）
  ctx.translate((canvasWidth - baseWidth) / 2, TOP_PAD);
  renderFretboard(ctx, { chord, colors, chordNameScale, shorthand });
  ctx.restore();

  return canvas;
}
