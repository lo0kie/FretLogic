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

import {
  drawBarres,
  drawFretNumbers,
  drawGridLines,
  drawNut,
  drawOpenStringMarkers,
  drawPressedDots,
} from '@/domains/fretboard/fretboardDrawCore';
import { absoluteFretOffsetOf } from '@/domains/fretboard/model/fretGeometry';
import { createLruCache } from '@/platform/utils/cache';

import {
  capoFont,
  drawFormattedChordName,
  fbGeometry,
  fretWindowOfExportChord,
  geometryOfExportChord,
  LAYOUT,
  requireContext2D,
} from './scoreExportLayout';

import type { ExportChordData, ThemeColors } from './scoreExportTypes';
import type { FretboardDrawChord, FretboardDrawGeometry } from '@/domains/fretboard/fretboardDrawCore';

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

/**
 * 计算当前样式纪元：指板几何 + 配色。
 *
 * 几何那一段**只取 `scale`** —— 本侧几何一律是「基准 × 和弦缩放倍数」，基准是编译期常量，
 * 运行时唯一会变的几何输入就是这个倍数（实例由 applyLayoutScales 按它重建）。
 * 逐个列出派生量（留白 / 弦距 / 品高 / 各字号 / 圆点 / 线宽……）等于把这条派生关系抄第二遍：
 * 加一个几何项就要回来补一行，漏了还会静默命中旧样式位图。
 *
 * 前提是「没有任何重载引入与 scale 无关的运行时输入」（现有重载全是 `scaled(...)`
 * 或相对基准字号的比值）。哪天新增这类输入，必须把它一并拼进本键。
 */
function computeFretboardStyleKey(colors: ThemeColors): string {
  return [
    fbGeometry().scale,
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
  // 列数归一化到绘制实际使用的值：fretCount 3 与 0/1/2 画出来完全一样，不该各占一条。
  // 取的是**收紧后的实际列数**并另记首列右移量 —— 放收紧结果而非开关本身，于是几何本就
  // 无空列可裁的指法在切换开关时键不变、位图不重光栅化
  const { drawFretCount: fretCount, leadTrim } = fretWindowOfExportChord(chord);
  const offset = chord.fretOffset ?? 0;
  return `${chord.chordName}|${strings.length}|${fretCount}|${offset}|${leadTrim}|${fretSig}|${barreSig}|${showBarre ? 1 : 0}`;
}

/** 光栅化一张指板位图 */
function createFretboardRaster(chord: ExportChordData, colors: ThemeColors, showBarre: boolean): FretboardRaster {
  // 本张图的几何（弦枕画了才占位 ⇒ 偏移品窗少一条弦枕，见 geometryOfExportChord）
  const g = geometryOfExportChord(chord);
  // 尺寸按**实际品窗**算，否则收紧后右侧会多留一段空网格
  const { drawFretCount: fretCount } = fretWindowOfExportChord(chord);
  const stringCount = chord.strings?.length || 6;
  const fbWidth = g.boardWidth(stringCount);
  // 内容高度口径与 computeLineContentHeight 一致：板身高度（含底部留白 —— 留白收进基准后
  // 导出侧不再有「底部不留白」的特例，见 boardBottomPad）
  const contentH = g.boardBoxHeight(fretCount);

  // 上留白：名字文字实际占用的上边界（几何给出，见 chordNameTopY）；不越顶时留 1px 抗锯齿余量
  const padTop = Math.ceil(Math.max(0, -g.chordNameTopY)) + 1;

  // 左右留白：定值取本侧几何的 leftPad —— 品号右对齐在首弦左侧，由该留白容纳。
  // 不再随名字宽度扩留白：同行的相邻指板紧挨着排（边和弦间距 INLINE_CHORD_GAP = 0），
  // 一侧变宽就等于把位图压进邻居的版面 —— 名字超宽改由名字层缩字号解决
  // （见 drawFretboardVector 传给 drawFormattedChordName 的 maxWidth）。
  const padX = g.leftPad;

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
    raster = createFretboardRaster(chord, colors, showBarre);
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
  // 实际品窗：收紧时列数与窗口起点必须同步右移（见 fretboard/model/fretWindow 的 resolveFretWindowFromUsed）
  const { drawFretCount: fretCount, leadTrim } = fretWindowOfExportChord(chord);
  const stringCount = chord.strings?.length || 6;
  // 本张图的几何：网格顶 / 空弦标记位 / 板身高度都随「本图是否画弦枕」走（见 geometryOfExportChord）
  const g = geometryOfExportChord(chord);
  const fbWidth = g.boardWidth(stringCount);

  // 几何由本侧构造（已按和弦缩放重建的几何 + 内容原点）；绘制算法与主线程屏幕指板共用 fretboardDrawCore
  const geometry: FretboardDrawGeometry = {
    startStrX: x + g.leftPad,
    gridTop: y + g.gridTop,
    stringSpacing: g.stringSpacing,
    fretHeight: g.fretHeight,
    nutHeight: g.nutHeight,
    markerCenterY: y + g.markerCenterY,
    muteCrossRadius: g.muteCrossRadius,
    openCircleRadius: g.openCircleRadius,
    dotRadius: g.dotRadius,
    lineWidth: g.lineWidth,
    barreThickness: g.barreThickness,
    fretNumberXOffset: g.fretNumberXOffset,
    // 导出侧没有「不画加粗弦枕」这一档，恒画（与拆分前一致）
    showBoldNut: true,
  };
  const drawChord: FretboardDrawChord = { strings: chord.strings ?? [], barres: chord.barres };
  // 绝对品位偏移（和弦自身偏移 + 品窗收紧的列位移）：算式与主线程同源，见 model/fretGeometry
  const offset = absoluteFretOffsetOf(chord.fretOffset, leadTrim);

  // 1. 和弦名称（顶部加粗居中，升降号采用上标形式；基线与独立指板图渲染器保持一致）
  //    可用宽取**指板框宽**：同一行相邻指板紧挨着排（边和弦间距 INLINE_CHORD_GAP = 0，
  //    挂和弦字符列也只比框宽出 CHORD_COLUMN_EXTRA_PAD = 4、两侧各 2），名字一旦宽过框宽
  //    就必然压到邻居的名字上。故这里让它缩字号贴合，而不是像导出 PNG 那样把画布扩宽。
  drawFormattedChordName(ctx, x + fbWidth / 2, y + g.chordNameBaselineY, chord.chordName, colors.TEXT, fbWidth);

  // 2. 空弦 / 静音标记（中性色，不使用红色）
  drawOpenStringMarkers(ctx, drawChord, geometry, stringCount, colors);

  // 3. 指板网格线（琴弦竖线 + (fretCount + 1) 根品丝）
  drawGridLines(ctx, geometry, stringCount, fretCount, colors);

  // 4. 弦枕（offset 为 0 时绘制）与品号（除首末所有品，对齐品丝）
  // 品号层用「原窗口起点 + 首列右移量」标注绝对品位：收紧后新窗口首列对应的绝对品位随之上移，
  // 于是「收紧到不再从第 1 品开始」的指法会自动改画品号而非弦枕（drawNut 只认 offset === 0）
  drawNut(ctx, geometry, stringCount, offset, colors);
  drawFretNumbers(ctx, geometry, fretCount, offset, capoFont(), colors);

  // 5. 大横按（Barres）——两端带饱满圆角，完全覆盖音符点；showBarre=false 时隐藏横按梁
  if (showBarre) drawBarres(ctx, drawChord, geometry, fretCount, leadTrim, colors);

  // 6. 按弦圆点（Finger Dots）——统一音符色彩，不额外强调主音
  drawPressedDots(ctx, drawChord, geometry, stringCount, leadTrim, colors);
}
