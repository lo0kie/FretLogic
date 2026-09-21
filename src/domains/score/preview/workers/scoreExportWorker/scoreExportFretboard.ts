/**
 * 乐谱导出 Worker 的指板图层：位图光栅化缓存 + 矢量绘制内核。
 *
 * 从 scoreExportWorker.ts 抽出（原 536~834 行）。
 * 依赖 layout（和弦名测量与绘制、字体）与 types，被 render / pages 单向依赖。
 *
 * 缓存策略：同一份指板状态在一首歌里通常重复出现几十次，每次都走完整矢量绘制是纯重复劳动。
 * 首次光栅化成离屏位图，其余出现位置直接 drawImage 合成——位图数量≈不同指板状态数（十几张），
 * 而绘制次数是它的数倍，页数越多、和弦重复越多，收益越大。
 */

import { clampDrawFretCount } from '@/domains/fretboard/constants';
import { isBarreStillValid } from '@/domains/fretboard/model/coordinates';
import { createLruCache } from '@/platform/utils/cache';

import { capoFont, drawFormattedChordName, LAYOUT, measureChordNameWidth, requireContext2D } from './scoreExportLayout';

import type { ExportChordData, ThemeColors } from './scoreExportTypes';

interface FretboardRaster {
  /** 光栅化结果（设备像素） */
  canvas: OffscreenCanvas;
  /** 位图逻辑尺寸（含留白）：合成时按此尺寸贴图，源与目标同为整设备像素，不重采样 */
  width: number;
  height: number;
  /** 内容原点（即矢量绘制时的 x / y）相对位图左上角的留白（逻辑 px） */
  padX: number;
  padY: number;
}

/** 位图条数上限：一首歌的不同指板状态通常十几个，64 条足够覆盖并留跨曲余量 */
const FRETBOARD_RASTER_LIMIT = 64;

/**
 * 渲染线程自己的指板位图实例，与主线程 FretboardCanvas.vue 的 '指板位图' 缓存**互不相干**：
 * 那边存的是不含和弦名/品号的主体层（固定参考分辨率，显示时缩放），这边存的是含和弦名与品号的
 * 整条光栅（键含 chordName / fretOffset / 缩放后几何，与页面 PIXEL_RATIO 1:1 贴图）。
 * 粒度与分辨率契约都不同，跨线程也只能传位图副本（transfer 会 detach 主线程那份），
 * 故同一指板在此各光栅化一次是既定设计，不要试图让两边共用一条缓存。
 */
const fretboardRasterCache = createLruCache<FretboardRaster>(FRETBOARD_RASTER_LIMIT, {
  // OffscreenCanvas 没有 close()：归零尺寸即可让底层缓冲当场归还，不必等 GC
  onEvict: (_, raster) => {
    raster.canvas.width = 0;
    raster.canvas.height = 0;
  },
});

/** 位图样式纪元：主题配色 + 指板缩放后的几何常量。变化即整体清空，不留旧样式位图占坑 */
let fretboardStyleKey = '';

/** 计算当前样式纪元：取参与指板绘制的全部配色与（已按缩放重算过的）几何常量 */
function computeFretboardStyleKey(colors: ThemeColors): string {
  const c = LAYOUT;
  return [
    c.FRETBOARD_LEFT_PAD,
    c.FRETBOARD_GRID_TOP,
    c.FRET_HEIGHT,
    c.STRING_SPACING,
    c.FRETBOARD_WIDTH,
    // 指板框宽度是函数（随缩放重算），取一个代表值入键，保证它变化时纪元也跟着变
    c.getExportFretboardWidth(6),
    c.NUT_HEIGHT,
    c.DOT_RADIUS,
    c.BARRE_THICKNESS,
    c.MARKER_CENTER_Y,
    c.MUTE_CROSS_RADIUS,
    c.OPEN_CIRCLE_RADIUS,
    c.CHORD_NAME_BASELINE_Y,
    c.CHORD_NAME_FONT_SIZE,
    c.ACCIDENTAL_FONT_SIZE,
    c.ACCIDENTAL_SUPERSCRIPT_OFFSET,
    c.CAPO_TEXT_FONT_SIZE,
    c.FRET_NUMBER_X_OFFSET,
    colors.TEXT,
    colors.SUB_TEXT,
    colors.FB_LINE,
    colors.FB_NUT,
    colors.FB_NOTE,
    colors.FB_OPEN,
    colors.FB_BARRE,
    colors.FB_MUTE,
  ].join('|');
}

/**
 * 样式纪元同步（每条渲染消息开头调用）：主题配色或缩放后几何变化即清空位图缓存，
 * 旧位图画法已不成立，留着只会被 LRU 顶替而白占内存（缩放滑块连续拖动会产生一串新纪元）。
 * 纪元状态原本是模块级裸变量，拆分为模块后以函数收敛读写，消息入口无需再直接触碰它。
 */
export const syncFretboardStyleKey = (colors: ThemeColors): void => {
  const styleKey = computeFretboardStyleKey(colors);
  if (styleKey === fretboardStyleKey) return;
  fretboardStyleKey = styleKey;
  fretboardRasterCache.clear();
};

/** 指板位图键：决定位图内容的全部输入（主题与缩放维度由 fretboardStyleKey 承担） */
function buildChordRasterKey(chord: ExportChordData, showBarre: boolean): string {
  const strings = chord.strings ?? [];
  // 弦位只需 fret 值：弦数据的第 2 个布尔位不参与绘制（导出图统一音符色，不区分主音）
  let fretSig = '';
  for (const s of strings) fretSig += `${s ? s[0] : 0},`;
  let barreSig = '';
  if (chord.barres) for (const b of chord.barres) barreSig += `${b.fret}:${b.fromString}-${b.toString},`;
  // 品数归一化到绘制实际使用的值：fretCount 3 与 0/1/2 画出来完全一样，不该各占一条
  const fretCount = clampDrawFretCount(chord.fretCount);
  const offset = chord.fretOffset ?? 0;
  return `${chord.chordName}|${strings.length}|${fretCount}|${offset}|${fretSig}|${barreSig}|${showBarre ? 1 : 0}`;
}

/** 光栅化一张指板位图（ctx 仅用于测量和弦名宽度，measureText 不受 ctx 变换影响） */
function createFretboardRaster(
  ctx: OffscreenCanvasRenderingContext2D,
  chord: ExportChordData,
  colors: ThemeColors,
  showBarre: boolean
): FretboardRaster {
  const fretCount = clampDrawFretCount(chord.fretCount);
  const stringCount = chord.strings?.length || 6;
  const fbWidth = LAYOUT.getExportFretboardWidth(stringCount);
  // 内容高度口径与 computeLineContentHeight 一致：网格顶部偏移 + 品数 × 品高
  const contentH = LAYOUT.FRETBOARD_GRID_TOP + fretCount * LAYOUT.FRET_HEIGHT;

  // 上留白：和弦名正文基线与上标升降号基线各上推一个字号，取更靠上者；不越顶时留 1px 抗锯齿余量
  const nameTop = Math.min(
    LAYOUT.CHORD_NAME_BASELINE_Y - LAYOUT.CHORD_NAME_FONT_SIZE,
    LAYOUT.CHORD_NAME_BASELINE_Y + LAYOUT.ACCIDENTAL_SUPERSCRIPT_OFFSET - LAYOUT.ACCIDENTAL_FONT_SIZE
  );
  const padTop = Math.ceil(Math.max(0, -nameTop)) + 1;

  // 左右留白：和弦名比指板框宽时两侧同时溢出（长名 / 多扩展音 / 斜杠低音），留白不足会被裁掉；
  // 溢出量的一半各归一侧，另加 2px 抗锯齿余量。左侧下限取 FRETBOARD_LEFT_PAD
  // —— 品号是右对齐在首弦左侧的，已由该留白容纳。
  const nameW = measureChordNameWidth(ctx, chord.chordName);
  const padX = Math.max(LAYOUT.FRETBOARD_LEFT_PAD, Math.ceil(Math.max(0, nameW - fbWidth) / 2) + 2);

  const width = Math.ceil(fbWidth) + padX * 2;
  // 下边只到网格底（无内容低于网格），留 1px 抗锯齿余量即可
  const height = Math.ceil(contentH) + padTop + 1;
  const deviceW = Math.ceil(width * LAYOUT.PIXEL_RATIO);
  const deviceH = Math.ceil(height * LAYOUT.PIXEL_RATIO);

  const canvas = new OffscreenCanvas(deviceW, deviceH);
  const rasterCtx = requireContext2D(canvas);
  rasterCtx.setTransform(LAYOUT.PIXEL_RATIO, 0, 0, LAYOUT.PIXEL_RATIO, 0, 0);
  // 内容原点平移到留白内：此后 drawFretboardVector 的 (0,0) 即矢量绘制时的 (x,y)
  rasterCtx.translate(padX, padTop);
  drawFretboardVector(rasterCtx, 0, 0, chord, colors, showBarre);

  // 逻辑尺寸按设备像素反推（deviceW / RATIO），保证合成时源与目标同为整设备像素
  return {
    canvas,
    width: deviceW / LAYOUT.PIXEL_RATIO,
    height: deviceH / LAYOUT.PIXEL_RATIO,
    padX,
    padY: padTop,
  };
}

/** 绘制单个吉他和弦指板图到 Canvas：命中位图缓存直接合成，未命中先光栅化再合成 */
export function drawFretboard(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  chord: ExportChordData,
  colors: ThemeColors,
  showBarre: boolean
) {
  const key = `${fretboardStyleKey}|${buildChordRasterKey(chord, showBarre)}`;
  let raster = fretboardRasterCache.get(key);
  if (!raster) {
    raster = createFretboardRaster(ctx, chord, colors, showBarre);
    fretboardRasterCache.set(key, raster);
  }
  // 目标位置对齐到整设备像素：避免半像素相位差让 drawImage 走重采样而糊边
  const ratio = LAYOUT.PIXEL_RATIO;
  const dx = Math.round((x - raster.padX) * ratio) / ratio;
  const dy = Math.round((y - raster.padY) * ratio) / ratio;
  ctx.drawImage(raster.canvas, dx, dy, raster.width, raster.height);
}

/** 单个和弦指板图的矢量绘制（原实现，现作为位图光栅化内核；坐标系以 (x, y) 为内容原点） */
function drawFretboardVector(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  chord: ExportChordData,
  colors: ThemeColors,
  showBarre: boolean
) {
  const fretCount = clampDrawFretCount(chord.fretCount);
  const stringCount = chord.strings?.length || 6;
  const fbWidth = LAYOUT.getExportFretboardWidth(stringCount);
  const startStrX = x + LAYOUT.FRETBOARD_LEFT_PAD;
  const gridTop = y + LAYOUT.FRETBOARD_GRID_TOP;
  const gridBottom = gridTop + fretCount * LAYOUT.FRET_HEIGHT;
  const gridRight = startStrX + (stringCount - 1) * LAYOUT.STRING_SPACING;

  // 1. 和弦名称（顶部加粗居中，升降号采用上标形式；基线与独立指板图渲染器保持一致）
  drawFormattedChordName(ctx, x + fbWidth / 2, y + LAYOUT.CHORD_NAME_BASELINE_Y, chord.chordName, colors.TEXT);

  // 2. 空弦 / 静音标记（中性色，不使用红色）
  const markerY = y + LAYOUT.MARKER_CENTER_Y;
  for (let s = 0; s < stringCount; s++) {
    const sx = startStrX + s * LAYOUT.STRING_SPACING;
    const strData = chord.strings[s];
    const fret = strData ? strData[0] : 0;

    if (fret === -1) {
      // ✕ 静音标记（中性灰，不喧宾夺主）
      ctx.strokeStyle = colors.FB_MUTE;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(sx - LAYOUT.MUTE_CROSS_RADIUS, markerY - LAYOUT.MUTE_CROSS_RADIUS);
      ctx.lineTo(sx + LAYOUT.MUTE_CROSS_RADIUS, markerY + LAYOUT.MUTE_CROSS_RADIUS);
      ctx.moveTo(sx + LAYOUT.MUTE_CROSS_RADIUS, markerY - LAYOUT.MUTE_CROSS_RADIUS);
      ctx.lineTo(sx - LAYOUT.MUTE_CROSS_RADIUS, markerY + LAYOUT.MUTE_CROSS_RADIUS);
      ctx.stroke();
    } else if (fret === 0) {
      // ○ 空弦标记（独立于按品音符颜色的 FB_OPEN，可单独配置）
      ctx.strokeStyle = colors.FB_OPEN;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(sx, markerY, LAYOUT.OPEN_CIRCLE_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // 3. 指板网格线（琴弦竖线 + (fretCount + 1) 根品丝）
  ctx.strokeStyle = colors.FB_LINE;
  ctx.lineWidth = 1;

  // 竖线（琴弦）
  for (let s = 0; s < stringCount; s++) {
    const sx = startStrX + s * LAYOUT.STRING_SPACING;
    ctx.beginPath();
    ctx.moveTo(sx, gridTop);
    ctx.lineTo(sx, gridBottom);
    ctx.stroke();
  }

  // 横线（品格）
  for (let f = 0; f <= fretCount; f++) {
    const fy = gridTop + f * LAYOUT.FRET_HEIGHT;
    ctx.beginPath();
    ctx.moveTo(startStrX, fy);
    ctx.lineTo(gridRight, fy);
    ctx.stroke();
  }

  // 4. 弦枕（offset 为 0 时绘制）与品号（除首末所有品，对齐品丝）
  const offset = chord.fretOffset ?? 0;
  if (offset === 0) {
    // 0 品位偏移即从 1 品起步，绘制加粗枕条
    ctx.fillStyle = colors.FB_NUT;
    ctx.fillRect(
      startStrX - 0.5,
      gridTop - LAYOUT.NUT_HEIGHT,
      (stringCount - 1) * LAYOUT.STRING_SPACING + 1,
      LAYOUT.NUT_HEIGHT
    );
  }

  // 左侧显示除首末（0品与最后一品）的所有品号，严格垂直居中对齐品丝
  // 品号字体在绘制循环外预构造（走字体缓存，缩放纪元变化才重建）
  ctx.font = capoFont();
  ctx.fillStyle = colors.SUB_TEXT;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let f = 1; f < fretCount; f++) {
    const fy = gridTop + f * LAYOUT.FRET_HEIGHT;
    const fretNumber = offset > 0 ? offset + f : f;
    ctx.fillText(String(fretNumber), startStrX - LAYOUT.FRET_NUMBER_X_OFFSET, fy);
  }
  ctx.textBaseline = 'alphabetic';

  // 5. 大横按（Barres）——两端带饱满圆角，完全覆盖音符点；showBarre=false 时隐藏横按梁
  if (showBarre && chord.barres && chord.barres.length > 0) {
    const barreHalfH = LAYOUT.BARRE_THICKNESS / 2;
    // 与两处屏幕渲染器同判据（computeDisplayBarres / drawBarresOnCanvas）：越出可视品位窗口或已被
    // 指法破坏的横按不绘制。线格式是 [fret, preferFlat] 元组，判据要琴弦模型，按原值还原即可。
    const stringModel = (chord.strings ?? []).map(s => ({ fret: s ? s[0] : 0, preferFlat: s ? s[1] : false }));
    for (const b of chord.barres) {
      if (b.fret < 1 || b.fret > fretCount) continue;
      if (!isBarreStillValid(stringModel, b)) continue;
      const bx1 = startStrX + b.fromString * LAYOUT.STRING_SPACING;
      const bx2 = startStrX + b.toString * LAYOUT.STRING_SPACING;
      const by = gridTop + (b.fret - 0.5) * LAYOUT.FRET_HEIGHT;
      const minX = Math.min(bx1, bx2) - barreHalfH;
      const w = Math.abs(bx2 - bx1) + LAYOUT.BARRE_THICKNESS;

      ctx.fillStyle = colors.FB_BARRE;
      ctx.beginPath();
      ctx.roundRect(minX, by - barreHalfH, w, LAYOUT.BARRE_THICKNESS, barreHalfH);
      ctx.fill();
    }
  }

  // 6. 按弦圆点（Finger Dots）——统一音符色彩，不额外强调主音
  for (let s = 0; s < stringCount; s++) {
    const strData = chord.strings[s];
    const fret = strData ? strData[0] : 0;
    if (fret > 0) {
      const cx = startStrX + s * LAYOUT.STRING_SPACING;
      const cy = gridTop + (fret - 0.5) * LAYOUT.FRET_HEIGHT;

      ctx.beginPath();
      ctx.arc(cx, cy, LAYOUT.DOT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = colors.FB_NOTE;
      ctx.fill();
    }
  }
}
