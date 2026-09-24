/**
 * 指板几何**算式内核**：三处指板实现（交互指板 SVG、屏幕缩略图 Canvas、导出 Worker）共用的
 * 坐标算式与判据。
 *
 * 与 `model/fretboardGeometry` 的分工：那边是**装配**（底层数据 + scale → 本侧全部尺寸），
 * 这边是**算式**（给定原点与品高，算品格中心、横按梁矩形、绝对品号……）。装配结果自带这些方法，
 * 故调用方通常直接 `geometry.fretCenterY(fret)`，无需自己传原点。
 *
 * 背景：三个产出路径此前把同一批算式逐算子等价地各写一遍，改一处忘另一处
 * 就会「同一和弦在预览与导出图上不一样」。
 *
 * 三条设计口径：
 * 1. **原点与品高由调用方注入**（交互指板 `INTERACTIVE_GEOMETRY.gridTop` / ≈99.9px，
 *    Canvas 图 `CANVAS_GEOMETRY.gridTop` / 13.5px，导出图 `fbGeometry().gridTop` / 随和弦缩放）：
 *    两者的版式（弦距、留白）本就是各自介质自己的布局决策，不属于共享事实；
 * 2. **尺寸以离屏指板图为基准**，另两处按 scale 派生（见 model/fretboardGeometry 的工厂），
 *    本模块只提供公式与判据；
 * 3. **不碰任何渲染 API**（ctx / DOM / SVG），故主线程与导出 Worker 都能引。
 */

/** 品格中心 Y（fret 自 1 起；0 品与静音由调用方按自己的空弦标记行定位） */
export const fretCenterYOf = (fret: number, gridTop: number, fretHeight: number): number =>
  gridTop + (fret - 0.5) * fretHeight;

/** 品丝线 Y（index 为品丝边界序号：0 = 顶端零品线，fretCount = 末品丝线） */
export const fretLineYOf = (index: number, gridTop: number, fretHeight: number): number => gridTop + index * fretHeight;

/** 网格纵向底端（末品丝线 Y）：琴弦竖线的终点 */
export const gridBottomYOf = (fretCount: number, gridTop: number, fretHeight: number): number =>
  fretLineYOf(fretCount, gridTop, fretHeight);

/**
 * 横按梁矩形：圆角圆心对齐跨度两端（pad = 厚度一半），纵向对齐所在品中心。
 *
 * 跨度以两端 X 传入，而不是「弦位置数组 + 弦序」：Canvas 侧按 `起点 + 弦序 × 弦距` 算，手上没有位置数组。
 */
export const barreBeamRectOf = (
  fret: number,
  span: { fromX: number; toX: number },
  thickness: number,
  gridTop: number,
  fretHeight: number
): { x: number; y: number; width: number; height: number } => {
  const pad = thickness / 2;
  const left = Math.min(span.fromX, span.toX) - pad;
  const right = Math.max(span.fromX, span.toX) + pad;
  return {
    x: left,
    y: fretCenterYOf(fret, gridTop, fretHeight) - pad,
    // 两端各外扩 pad ⇒ 宽度 = 跨度 + 整个厚度（圆角圆心落在两端上）
    width: Math.max(0, right - left),
    height: thickness,
  };
};

/** 横按是否落在可视品窗内（1..fretCount）：越窗的横按两介质都不绘制 */
export const isBarreInWindow = (fret: number, fretCount: number): boolean => fret >= 1 && fret <= fretCount;

/** 绝对品号：偏移窗口下显示实际品位（fretOffset + 品序），零品窗口即品序本身 */
export const absoluteFretLabel = (fretOffset: number, index: number): number =>
  fretOffset > 0 ? fretOffset + index : index;

/** 是否绘制品号：首末两品不标（与 Canvas 的 `for (f = 1; f < fretCount; f++)` 同一判据） */
export const showsFretNumber = (index: number, fretCount: number): boolean => index >= 1 && index < fretCount;

/**
 * 是否处于零品窗口（fretOffset === 0）—— 加粗弦枕只在这一档绘制：偏移窗口下该位置留给品号。
 * SVG 的 `v-if` 与 Canvas 的 `drawNut` 此前各写一遍这条判据。
 */
export const isZeroFretWindow = (fretOffset: number): boolean => fretOffset === 0;

/**
 * 绘制用的**绝对**品位偏移 = 和弦自身偏移 + 品窗收紧的首列右移量（leadTrim）。
 *
 * 收紧后新窗口首列对应的绝对品位随之上移，于是「收紧到不再从第 1 品开始」的指法会自动改画品号
 * 而非弦枕（见 {@link isZeroFretWindow}）。主线程 renderFretboardCanvas 与导出 Worker
 * scoreExportFretboard 此前各写一遍同一算式。
 */
export const absoluteFretOffsetOf = (fretOffset: number | null | undefined, leadTrim: number): number =>
  (fretOffset ?? 0) + leadTrim;
