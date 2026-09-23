/**
 * 指板绘制的跨线程共享内核。
 *
 * 主线程（`components/renderFretboardCanvas`，HTMLCanvas：屏幕指板 + 单和弦导出 PNG）与导出 Worker
 * （`score/preview/workers/scoreExportWorker/scoreExportFretboard`，OffscreenCanvas：长图 / A4 分页）
 * 此前各写一份**逐段相同**的绘制原语（空弦/静音标记、网格线、弦枕、品号、横按梁、按弦圆点）与
 * 和弦名分片量宽/绘制。本模块是它们的唯一来源。
 *
 * 【复用口径】照 `score/preview/services/footerOverlay` 的现成范式：**只共享算法，把差异全部注入**。
 * - 上下文取 `CanvasRenderingContext2D` 与 `OffscreenCanvasRenderingContext2D` 的公共子集（`Pick<…>`），
 *   两种 ctx 都能直接传入，调用方无需断言；
 * - 几何由调用方构造（主线程取 `computeFretboardLayout` 的布局对象 + `FRETBOARD_CANVAS_CONFIG`，
 *   Worker 取缩放后的 `LAYOUT`）——本模块不读任何常量表；
 * - 字体由调用方注入（主线程走系统字体栈，导出 Worker 走随包分发的 Sarasa 子集）。
 *   **两侧字体环境本就不同，不要统一**：屏幕指板不参与等宽栅格排版，列宽不依赖字形推进宽，
 *   故无需加载那 1MB 子集；只有导出图的歌词栅格按 Sarasa 实测的 0.5em 推进宽算死，必须装。
 * - 弦数据归一成 `[fret, preferFlat]` 元组（主线程侧由 `Chord` 实体 map 一次）。
 *
 * 【为什么两套「缩字号贴合」不并进来】主线程按 `fontScale` 倍率缩放，Worker 按绝对 px 逐档下探，
 * 数值口径不同（收敛结果可能差 1px）。并进来会静默改变长名的字号，收益不抵风险 —— 故只共享它们
 * 共同的量宽 / 绘制叶子（`measureChordNameTokens` / `drawMeasuredChordName`），贴合求解各留各的。
 */
import { isBarreStillValid } from './model/coordinates';

import type { FretboardCanvasPalette } from './fretboardCanvasPalette';
import type { BarreEntity } from './types';
import type { ChordNameToken } from '@/domains/chord/theory/chordNameTokens';

/**
 * 跨线程绘制上下文：主线程 `CanvasRenderingContext2D` 与渲染线程 `OffscreenCanvasRenderingContext2D`
 * 的公共子集。两者对下列成员的签名一致，故两种 ctx 都能直接传入。
 */
export type FretboardDrawContext = Pick<
  CanvasRenderingContext2D,
  | 'strokeStyle'
  | 'lineWidth'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'stroke'
  | 'arc'
  | 'fillStyle'
  | 'fill'
  | 'fillRect'
  | 'roundRect'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
  | 'fillText'
  | 'measureText'
>;

/**
 * 归一后的弦数据：`[品位, 是否偏好降号]`；`undefined` 视为空弦（品位 0）。
 * 主线程的 `Chord.strings` 是 `GuitarStringEntity[]`，导出侧是元组 —— 统一在调用方 map 成这一形态。
 */
export type DrawStringTuple = readonly [number, boolean] | undefined;

/** 绘制原语需要的和弦最小视图（不含名字 / 调弦等绘制无关字段） */
export interface FretboardDrawChord {
  strings: readonly DrawStringTuple[];
  barres?: readonly BarreEntity[];
}

/**
 * 绘制几何：两侧各自构造。
 * `startStrX` / `gridTop` / `markerCenterY` 是**绝对坐标**（主线程取布局对象的同名值、
 * Worker 取「内容原点 + LAYOUT 偏移」），其余取自各自的常量表。
 */
export interface FretboardDrawGeometry {
  /** 第 0 弦 X */
  startStrX: number;
  /** 网格顶线 Y */
  gridTop: number;
  /** 相邻弦间距 */
  stringSpacing: number;
  /** 单个品格高度 */
  fretHeight: number;
  /** 弦枕枕条高度 */
  nutHeight: number;
  /** 空弦 / 静音标记中心 Y */
  markerCenterY: number;
  /** 静音叉号半径 */
  muteCrossRadius: number;
  /** 空弦圆圈半径 */
  openCircleRadius: number;
  /** 按弦圆点半径 */
  dotRadius: number;
  /** 大横按梁厚度 */
  barreThickness: number;
  /** 品号文字自首弦向左的 X 偏移 */
  fretNumberXOffset: number;
  /** 是否绘制加粗弦枕（false 时零品只留普通品丝线） */
  showBoldNut: boolean;
}

/** 空弦（○）与静音（✕）标记 */
export const drawOpenStringMarkers = (
  ctx: FretboardDrawContext,
  chord: FretboardDrawChord,
  geometry: FretboardDrawGeometry,
  stringCount: number,
  colors: FretboardCanvasPalette
): void => {
  const { startStrX, stringSpacing, markerCenterY, muteCrossRadius, openCircleRadius } = geometry;
  for (let s = 0; s < stringCount; s++) {
    const sx = startStrX + s * stringSpacing;
    const strData = chord.strings[s];
    const fret = strData ? strData[0] : 0;

    if (fret === -1) {
      ctx.strokeStyle = colors.FB_MUTE;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(sx - muteCrossRadius, markerCenterY - muteCrossRadius);
      ctx.lineTo(sx + muteCrossRadius, markerCenterY + muteCrossRadius);
      ctx.moveTo(sx + muteCrossRadius, markerCenterY - muteCrossRadius);
      ctx.lineTo(sx - muteCrossRadius, markerCenterY + muteCrossRadius);
      ctx.stroke();
    } else if (fret === 0) {
      ctx.strokeStyle = colors.FB_OPEN;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(sx, markerCenterY, openCircleRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
};

/** 网格线（琴弦竖线 + fretCount + 1 根品丝横线） */
export const drawGridLines = (
  ctx: FretboardDrawContext,
  geometry: FretboardDrawGeometry,
  stringCount: number,
  fretCount: number,
  colors: FretboardCanvasPalette
): void => {
  const { startStrX, gridTop, stringSpacing, fretHeight } = geometry;
  const gridBottom = gridTop + fretCount * fretHeight;
  const gridRight = startStrX + (stringCount - 1) * stringSpacing;

  ctx.strokeStyle = colors.FB_LINE;
  ctx.lineWidth = 1;
  for (let s = 0; s < stringCount; s++) {
    const sx = startStrX + s * stringSpacing;
    ctx.beginPath();
    ctx.moveTo(sx, gridTop);
    ctx.lineTo(sx, gridBottom);
    ctx.stroke();
  }
  for (let f = 0; f <= fretCount; f++) {
    const fy = gridTop + f * fretHeight;
    ctx.beginPath();
    ctx.moveTo(startStrX, fy);
    ctx.lineTo(gridRight, fy);
    ctx.stroke();
  }
};

/**
 * 弦枕（仅零品窗口绘制）：`fretOffset !== 0` 时品号层已改画品号，不画弦枕；
 * `showBoldNut=false` 时零品只留普通品丝线条。
 */
export const drawNut = (
  ctx: FretboardDrawContext,
  geometry: FretboardDrawGeometry,
  stringCount: number,
  fretOffset: number,
  colors: FretboardCanvasPalette
): void => {
  if (fretOffset !== 0 || !geometry.showBoldNut) return;
  const { startStrX, gridTop, nutHeight, stringSpacing } = geometry;
  ctx.fillStyle = colors.FB_NUT;
  ctx.fillRect(startStrX - 0.5, gridTop - nutHeight, (stringCount - 1) * stringSpacing + 1, nutHeight);
};

/** 品号（偏移时显示实际品位 = fretOffset + 品序；首末两品不标） */
export const drawFretNumbers = (
  ctx: FretboardDrawContext,
  geometry: FretboardDrawGeometry,
  fretCount: number,
  fretOffset: number,
  font: string,
  colors: FretboardCanvasPalette
): void => {
  const { startStrX, gridTop, fretHeight, fretNumberXOffset } = geometry;
  ctx.font = font;
  ctx.fillStyle = colors.SUB_TEXT;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let f = 1; f < fretCount; f++) {
    const fy = gridTop + f * fretHeight;
    const fretNumber = fretOffset > 0 ? fretOffset + f : f;
    ctx.fillText(String(fretNumber), startStrX - fretNumberXOffset, fy);
  }
  ctx.textBaseline = 'alphabetic';
};

/**
 * 大横按梁（圆角矩形）。`leadTrim` = 品窗收紧时首列右移的列数，把存储的相对品位换算到新窗口。
 * 越出可视品位窗口、或已被指法破坏的横按不绘制（判据与 SVG 侧 `computeDisplayBarres` 同源）。
 */
export const drawBarres = (
  ctx: FretboardDrawContext,
  chord: FretboardDrawChord,
  geometry: FretboardDrawGeometry,
  fretCount: number,
  leadTrim: number,
  colors: FretboardCanvasPalette
): void => {
  if (!chord.barres || chord.barres.length === 0) return;
  const { startStrX, gridTop, stringSpacing, fretHeight, barreThickness } = geometry;
  const barreHalfH = barreThickness / 2;
  // 判据要琴弦模型（fret 值），元组第 2 位不参与；按原值还原
  const stringModel = (chord.strings ?? []).map(s => ({ fret: s ? s[0] : 0, preferFlat: s ? s[1] : false }));

  for (const b of chord.barres) {
    const relFret = b.fret - leadTrim;
    if (relFret < 1 || relFret > fretCount) continue;
    if (!isBarreStillValid(stringModel, b)) continue;
    const bx1 = startStrX + b.fromString * stringSpacing;
    const bx2 = startStrX + b.toString * stringSpacing;
    const by = gridTop + (relFret - 0.5) * fretHeight;
    const minX = Math.min(bx1, bx2) - barreHalfH;
    const w = Math.abs(bx2 - bx1) + barreThickness;
    ctx.fillStyle = colors.FB_BARRE;
    ctx.beginPath();
    ctx.roundRect(minX, by - barreHalfH, w, barreThickness, barreHalfH);
    ctx.fill();
  }
};

/** 按弦圆点（统一音符色，不额外强调主音）。存储品位为原窗口相对值，收紧后减去 leadTrim */
export const drawPressedDots = (
  ctx: FretboardDrawContext,
  chord: FretboardDrawChord,
  geometry: FretboardDrawGeometry,
  stringCount: number,
  leadTrim: number,
  colors: FretboardCanvasPalette
): void => {
  const { startStrX, gridTop, stringSpacing, fretHeight, dotRadius } = geometry;
  for (let s = 0; s < stringCount; s++) {
    const strData = chord.strings[s];
    const fret = (strData ? strData[0] : 0) - leadTrim;
    if (fret > 0) {
      const cx = startStrX + s * stringSpacing;
      const cy = gridTop + (fret - 0.5) * fretHeight;
      ctx.beginPath();
      ctx.arc(cx, cy, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = colors.FB_NOTE;
      ctx.fill();
    }
  }
};

/** 已量宽的和弦名分片：绘制阶段直接取 `font`，不再重做 isAccidental 判定与字体选择 */
export interface MeasuredChordToken {
  text: string;
  isAccidental: boolean;
  width: number;
  font: string;
}

/**
 * 逐 token 量宽（主名与上标升降号各用其字体），返回分片与总宽。
 * 两侧的贴合求解与居中绘制共用这一处，避免量宽口径分叉。
 */
export const measureChordNameTokens = (
  ctx: FretboardDrawContext,
  tokens: readonly ChordNameToken[],
  baseFont: string,
  accFont: string
): { measured: MeasuredChordToken[]; totalWidth: number } => {
  let totalWidth = 0;
  const measured = tokens.map(token => {
    const font = token.isAccidental ? accFont : baseFont;
    ctx.font = font;
    const { width } = ctx.measureText(token.text);
    totalWidth += width;
    return { text: token.text, isAccidental: token.isAccidental, width, font };
  });
  return { measured, totalWidth };
};

/** 居中绘制已量宽的分片（升降号按 `superOffset` 上标）。 */
export const drawMeasuredChordName = (
  ctx: FretboardDrawContext,
  centerX: number,
  baselineY: number,
  measured: readonly MeasuredChordToken[],
  superOffset: number,
  color: string
): void => {
  if (measured.length === 0) return;
  let totalWidth = 0;
  for (const item of measured) totalWidth += item.width;

  let curX = centerX - totalWidth / 2;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  for (const item of measured) {
    ctx.font = item.font;
    ctx.fillText(item.text, curX, item.isAccidental ? baselineY + superOffset : baselineY);
    curX += item.width;
  }
};
