/**
 * 指板图 Canvas 渲染器（纯函数，无 Vue 依赖）
 * 被 FretboardCanvas.vue 和 WorkbenchExportPanel.vue 复用。
 */
import { parseChordNameTokens } from '@/domains/chord/theory/chordNameTokens';
import { getChordName } from '@/domains/chord/theory/theory';
import {
  drawBarres,
  drawFretNumbers,
  drawGridLines,
  drawMeasuredChordName,
  drawNut,
  drawOpenStringMarkers,
  drawPressedDots,
  measureChordNameTokens,
} from '@/domains/fretboard/fretboardDrawCore';
import { BASE_FRETBOARD_GEOMETRY, baseGeometryFor } from '@/domains/fretboard/model/fretboardGeometry';
import { absoluteFretOffsetOf, isZeroFretWindow } from '@/domains/fretboard/model/fretGeometry';
import { resolveFretWindowFromUsed } from '@/domains/fretboard/model/fretWindow';

import type { Chord } from '@/domains/chord/types';
import type { FretboardCanvasPalette } from '@/domains/fretboard/fretboardCanvasPalette';
import type { FretboardDrawChord, FretboardDrawGeometry } from '@/domains/fretboard/fretboardDrawCore';
import type { FretWindow } from '@/domains/fretboard/model/fretWindow';

export type FretboardThemeColors = FretboardCanvasPalette;

/**
 * 离屏指板图（屏幕缩略图 / 导出 PNG）的几何声明 —— 三处指板实现中的「处」之一。
 *
 * **scale = 1**：底层几何数据（FRETBOARD_CANVAS_CONFIG）就是照它定的，故这里**没有重载任何字段** ——
 * 它是基准本身，另两处都是它的等比放大（交互指板 7.4×、乐谱导出随「和弦缩放」）。
 * 本文件其余尺寸一律取自本对象，不再直读基准常量。
 *
 * 本对象即工厂模块导出的基准单例（不另 create）：别的消费方也要读「图自身的留白」时
 * （如承载卡片的边距），拿到的必须是同一份，否则日后改基准会漏改。
 */
const CANVAS_GEOMETRY = BASE_FRETBOARD_GEOMETRY;

/**
 * 整图渲染选项。三层（名字 / 主体 / 品号）共用同一份选项对象，各层只读自己需要的字段，
 * 故调用方无需按层裁剪；字段归属见下面三个分层函数的注释。
 */
export interface RenderFretboardOptions {
  chord: Chord;
  /** 主题配色（LIGHT / DARK 或自定义） */
  colors: FretboardThemeColors;
  /** 是否使用简写符号（M/°/+） */
  shorthand?: boolean;
  /** 是否绘制和弦名（默认 true） */
  showChordName?: boolean;
  /**
   * 和弦名的可用宽度（逻辑 px）。**只有可用宽度由布局定死、不能再加宽的消费方才传**
   * （DOM 侧固定尺寸缩略图即是；它的可用宽 = 画布宽 − 两侧留白）。
   *
   * 传了即启用名字层自适应：**只等比缩字号**到放得下为止，保证超长名字不会越出该宽度被硬裁；
   * 不传则按请求字号原样绘制 —— 前提是画布已按名字宽度准备好（导出 PNG 正是这样扩画布的，
   * 若把本项也传给它，反而会把本可完整显示的名字无谓地压小）。
   */
  chordNameMaxWidth?: number;
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
  /**
   * 是否忽略首末的空品格（默认 false）：按「实际用到的品位范围」收紧品窗，见 resolveFretWindow。
   *
   * 注意它属**几何**（改变网格列数与窗口起点），因此必须进位图键；但键里要放
   * FretWindow 的 drawFretCount / leadTrim 而不是本开关 —— 这样几何本就无空列可裁的指法
   * 在切换开关时键不变、不重绘。
   */
  trimEmptyEdgeFrets?: boolean;
}

// ---- 内部辅助 ----

/**
 * 和弦名与容器边的水平留白（逻辑 px）。两个消费方共用同一口径：
 *  - 导出（renderFretboardToCanvas）：名字超宽时按它把画布**对称扩宽**（画布自包含，宽度随便加）；
 *  - DOM 侧（FretboardCanvas → chordNameMaxWidth）：固定尺寸缩略图不扩宽，按它给出可用宽、
 *    让名字层**缩字号贴合**（picker 三列网格 / 谱面行内槽位都靠等宽几何对齐，不能随名字变长改宽）。
 *
 * 注：乐谱导出 Worker 不读本常量 —— 挨着的两张指板之间没有余量（INLINE_CHORD_GAP = 0），
 * 它的名字上限只能是**指板框本身**（见 scoreExportFretboard 的 raster padX）。
 */
export const CHORD_NAME_EDGE_PAD = 4;

/** 品号字体：与和弦名同走系统字体栈（屏幕指板不参与等宽栅格排版，故不加载 Sarasa 子集；
 *  导出 Worker 侧改走 scoreFont，两侧字体差异由 fretboardDrawCore 的字体注入承担） */
const CAPO_FONT = `bold ${CANVAS_GEOMETRY.capoTextFontSize}px system-ui, sans-serif`;

/**
 * 按字号缩放比推导名字层的字体度量：测量与绘制共用，避免两处各算一份字体串。
 *
 * **字号只有两个来源**：几何给出的 `chordNameFontSize`（= 基准字号，缩放比 1），
 * 以及放不下时的贴合收缩（`fitChordNameLayout` 逐轮把缩放比压小）。外部不再有「名字缩放」入口 ——
 * 名字大小与指板其余尺寸同源，别处无从单独调小它。
 *
 * 字号只保 1px 底（不许缩没），**不再设 9px / 7px 的「可读性下限」**：画布宽度由布局定死，
 * 名字放不下时唯一不越界的手段就是继续缩字号，下限只会把收缩卡死、逼出横向压缩（已废止）。
 * 下限的另一副作用是让字号与上标偏移脱钩（字号被夹住、superOffset 仍按请求比缩），
 * 去掉之后两者同比例，升降号不会再从「上标」沉成「大号平排」。
 */
function resolveChordNameFonts(fontScale: number) {
  const baseFontSize = Math.max(1, Math.round(CANVAS_GEOMETRY.chordNameFontSize * fontScale));
  const accFontSize = Math.max(1, Math.round(CANVAS_GEOMETRY.accidentalFontSize * fontScale));
  return {
    baseFont: `bold ${baseFontSize}px system-ui, -apple-system, sans-serif`,
    accFont: `bold ${accFontSize}px system-ui, -apple-system, sans-serif`,
    /** 升降号上标相对基线的垂直偏移（Canvas 坐标系向下为正，上标为负） */
    superOffset: Math.round(CANVAS_GEOMETRY.accidentalSuperscriptOffset * fontScale),
  };
}

/**
 * 逐 token 度量和弦名宽度：主名与升降号上标使用不同字号，需分别测量后累加。
 * 字号只有 1px 底（见 resolveChordNameFonts），故宽度对 fontScale 单调且近似线性 ——
 * drawFormattedChordName 的「缩字号贴合」正是靠这条性质迭代收敛。
 */
function measureChordNameLayout(ctx: CanvasRenderingContext2D, chordName: string, fontScale = 1.0) {
  const fonts = resolveChordNameFonts(fontScale);
  // 量宽叶子与导出 Worker 共用（见 fretboardDrawCore）；字体由本侧注入
  const { measured, totalWidth } = measureChordNameTokens(
    ctx,
    parseChordNameTokens(chordName),
    fonts.baseFont,
    fonts.accFont
  );
  return { measured, totalWidth, fonts };
}

/** 贴合迭代上限：宽度对字号近似线性，一轮即落到目标附近；字号取整会留「分片数 × 0.5px」的残差，再收 1~2 轮 */
const NAME_FIT_MAX_ROUNDS = 4;
/** 每轮留 0.5% 余量：宁可小一丝，也不要卡在浮点边界上正好越出零点几像素 */
const NAME_FIT_SAFETY = 0.995;
/** 整档下探步数上限：覆盖 16px → 1px 的极端收缩，正常名字一两步即收敛 */
const NAME_FIT_MAX_STEPS = 24;

/**
 * 求解贴合 maxWidth 的等比字号（调用方保证进入时确实放不下），返回该字号下的度量。
 *
 * 只缩字号、不做横向压缩：画布宽度定死时，缩字号是唯一不越界又不改字形的手段。
 * 两步收敛：先按「目标宽 / 实测宽」线性估（宽度对字号近似线性，一轮即到位），再按整数字号
 * 逐档下探补足 —— 字号取整会产生台阶，等比估算可能差口气地停在目标上方，而取整后再乘比例
 * 已经压不动了；下探以整数字号为单位，步数有限，必然收敛。
 */
function fitChordNameLayout(ctx: CanvasRenderingContext2D, chordName: string, maxWidth: number) {
  const nominal = CANVAS_GEOMETRY.chordNameFontSize;
  /** 起始缩放比恒为 1：请求字号就是几何给出的名字字号，本函数只负责把它压小到放得下 */
  let scale = 1;
  let layout = measureChordNameLayout(ctx, chordName, scale);

  for (let round = 0; round < NAME_FIT_MAX_ROUNDS && layout.totalWidth > maxWidth; round++) {
    scale *= (maxWidth / layout.totalWidth) * NAME_FIT_SAFETY;
    const next = measureChordNameLayout(ctx, chordName, scale);
    // 取整台阶已卡住：再乘同一个比例也只是空转，交给下面按整档下探
    if (next.totalWidth >= layout.totalWidth) break;
    layout = next;
  }

  // 整档下探：字号按整数步长递减（由字号反算 scale，取整后恰好等于该整数），
  // 上标偏移在 resolveChordNameFonts 内同源推导，故比例关系不会被破坏
  let basePx = Math.round(nominal * scale);
  for (let step = 0; step < NAME_FIT_MAX_STEPS && layout.totalWidth > maxWidth && basePx > 1; step++) {
    basePx -= 1;
    layout = measureChordNameLayout(ctx, chordName, basePx / nominal);
  }

  return layout;
}

/**
 * 绘制带格式的和弦名（水平居中于 centerX）。
 *
 * 传了 maxWidth（名字可用宽度，逻辑 px）即启用自适应：**只等比缩字号**到放得下为止。
 * 刻意不做横向压缩 —— canvas 的 `fillText(..., maxWidth)` 是只压 X 轴的非等比缩放，字形会被
 * 压扁（笔画变细、字腔闭合），且压缩量没有下限（名字越长压得越扁），极端情况糊成一团，
 * 比「字小一号」更糟。字号可缩但只保 1px 底，不会缩没。
 * 不传则按请求字号原样绘制，此时调用方必须自行保证画布够宽（导出 PNG 是按名字宽度扩画布的），
 * 否则越界部分会被画布边界**硬裁**（canvas 画不出自身位图之外的像素，两端直接丢字）。
 */
function drawFormattedChordName(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  baselineY: number,
  chordName: string,
  color: string,
  maxWidth?: number
) {
  const base = measureChordNameLayout(ctx, chordName);
  if (base.measured.length === 0) return;

  // 放不下才启用「缩字号贴合」（只缩字号，不做横向压缩）；贴合结果与原布局同形
  const fitted =
    maxWidth !== undefined && maxWidth > 0 && base.totalWidth > maxWidth
      ? fitChordNameLayout(ctx, chordName, maxWidth)
      : base;

  drawMeasuredChordName(ctx, centerX, baselineY, fitted.measured, fitted.fonts.superOffset, color);
}

// ---- 布局计算 ----

// 隐藏品号时的最小水平留白（MIN_LEFT_PAD）与上下留白（EDGE_PAD）都不在本文件声明：
// 它们是底层几何数据（FRETBOARD_CANVAS_CONFIG）的项，由工厂读取（本文件内即 g.minLeftPad / g.edgePad）。

/** 从和弦抽出占用列号（弦品位 + 横按品位），套用 `model/fretWindow` 的收紧口径 */
export function resolveFretWindow(chord: Chord, trimEmptyEdgeFrets = false): FretWindow {
  const used: number[] = [];
  for (const s of chord.strings ?? []) if (s && s.fret >= 1) used.push(s.fret);
  for (const b of chord.barres ?? []) if (b.fret >= 1) used.push(b.fret);
  return resolveFretWindowFromUsed(chord.fretCount, used, trimEmptyEdgeFrets);
}

/**
 * 本图是否**真的画出**加粗弦枕 = 显示开关打开 **且** 落在零品窗口。
 *
 * 这是「弦枕占不占位」的唯一判据（绘制侧的判据见 fretboardDrawCore 的 `drawNut`，同一条件）。
 * 两者必须同源：**画了才占位**——不画却占位，空弦标记下方就多出一段谁也解释不了的空白，
 * 表现为「空弦区上下 padding 明明同值，上边距看起来却比下边距少」（差额恰好是一条弦枕）。
 *
 * 绝对品位偏移必须由 `absoluteFretOffsetOf` 给出（和弦自身偏移 + 品窗收紧的首列右移量）：
 * 收紧到不再从第 1 品开始的指法同样不该画弦枕。
 */
export const nutIsDrawn = (showBoldNut: boolean, absoluteFretOffset: number): boolean =>
  showBoldNut && isZeroFretWindow(absoluteFretOffset);

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
   * 由「预留布局 gridTop − 紧凑布局 gridTop」精确算出（两布局下缘同为底部留白，故高度差 ≡ gridTop 差）。
   * 常规显隐组合下即 `CANVAS_GEOMETRY.chordNameBlockH - CANVAS_GEOMETRY.edgePad`（= 名字字号）
   * —— 两套布局的**顶部留白同为 `edgePad`**，故差额恰好只剩「名字内容」那一段。
   * 消费方把位图整体上移这么多并减去同量高度，即可让「不画名字」的视觉与改造前逐像素一致。
   */
  nameReserveH: number;
}

/**
 * 按显隐状态动态计算指板布局：隐藏的元素不再占位，画布随之收紧。
 * 全部显示且零品粗弦枕时，结果与原有固定常量布局一致。
 *
 * 本函数只处理「占位」，不处理「绘制」—— 两个维度各自与「画不画」解耦，都为了同一件事：
 * 让主体层位图与这些显示参数无关，从而可跨消费方共用。
 *  1. 名字位：由 reserveChordName 决定（缺省跟随 showChordName）。预留但未绘制时几何与「显示名字」
 *     逐像素一致，调用方按 nameReserveH 裁掉顶部空白即视觉不变；
 *  2. 弦枕位：由 `boldNut` 决定 —— **画了才占位**（判据见 nutIsDrawn）。零品窗口那张图里弦枕是
 *     指板的顶边、占一条弦枕；偏移窗口不画，那一段就不占位。于是「空弦标记到指板顶」在两张图里
 *     都是空弦区的下 padding，观感上下对称。代价是画布高度随品位窗口差一条弦枕（几何与位图键
 *     因此要带上这个开关，见 FretboardCanvas）。
 *
 * 骨架与尺寸都不在本文件重算，一律取自工厂（`topSkeleton` / `sizeOf`）—— 三处指板、画布与虚拟占位
 * 因此共用同一份算式；本函数只把工厂的输出**改名**成渲染层要的形状（并保留 startStrX 等派生量）。
 */
export function computeFretboardLayout(opts: {
  stringCount: number;
  fretCount: number;
  showChordName?: boolean;
  /** 是否预留名字版面（缺省跟随 showChordName）；见 RenderFretboardOptions.reserveChordName */
  reserveChordName?: boolean;
  showOpenStringNotes?: boolean;
  showFretNumbers?: boolean;
  /** 本图是否真的画出加粗弦枕（缺省 true）；判据见 nutIsDrawn */
  boldNut?: boolean;
}): FretboardLayout {
  const {
    stringCount,
    fretCount,
    showChordName = true,
    reserveChordName,
    showOpenStringNotes = true,
    showFretNumbers = true,
    boldNut = true,
  } = opts;

  const g = baseGeometryFor(boldNut);

  // 名字位由「预留」而非「绘制」决定（缺省跟随 showChordName，故既有调用行为不变）：
  // 预留时顶部自 0 起算并计入名字区块，于是「不画名字但留位」的几何与「显示名字」逐像素一致 ——
  // 这是「不画名字的消费方仍能命中同一张主体层位图」的前提（名字像素本就不在主体层）。
  const reserveName = reserveChordName ?? showChordName;
  const reserved = g.topSkeleton({ reserveName: true, showOpenStrings: showOpenStringNotes });
  const compact = g.topSkeleton({ reserveName: false, showOpenStrings: showOpenStringNotes });
  const active = reserveName ? reserved : compact;
  const size = g.sizeOf({
    showChordName,
    reserveChordName: reserveName,
    showOpenStrings: showOpenStringNotes,
    showFretNumbers,
    stringCount,
    fretCount,
  });

  return {
    width: size.width,
    height: size.height,
    gridTop: active.gridTop,
    startStrX: showFretNumbers ? g.leftPad : g.minLeftPad,
    chordNameBaselineY: active.chordNameBaselineY,
    markerCenterY: active.markerCenterY,
    // 「预留了名字位但未绘制」时顶部多出的高度：取两套骨架的网格顶之差 —— 两种布局下缘同为
    // 底部留白，故高度差 ≡ 网格顶差。
    nameReserveH: reserveName && !showChordName ? reserved.gridTop - compact.gridTop : 0,
  };
}

/** 由渲染选项推出几何：三层渲染共用同一套推导（纯算术，重复调用无成本）。
 *  fretCount 一律取**实际品窗**（resolveFretWindow 收紧后的结果），故三层共享同一套几何。 */
function resolveGeometry(chord: Chord, opts: RenderFretboardOptions) {
  const { showChordName = true, showOpenStringNotes = true, showFretNumbers = true, showBoldNut = true } = opts;
  const { drawFretCount: fretCount, leadTrim } = resolveFretWindow(chord, opts.trimEmptyEdgeFrets);
  const stringCount = chord.strings?.length || 6;
  // 弦枕占位跟随弦枕是否真画：绝对品位偏移（含收紧的首列右移）落在零品窗口且开关打开时才有那一段
  const boldNut = nutIsDrawn(showBoldNut, absoluteFretOffsetOf(chord.fretOffset, leadTrim));
  const layout = computeFretboardLayout({
    stringCount,
    fretCount,
    showChordName,
    // 未传时由 computeFretboardLayout 回退到「跟随 showChordName」：名字层/品号层因此总是按
    // 「实际可见布局」计算（showChordName=false 的消费方贴裁切后的紧凑布局，故这里必须是紧凑值）
    reserveChordName: opts.reserveChordName,
    showOpenStringNotes,
    showFretNumbers,
    boldNut,
  });
  const g = CANVAS_GEOMETRY;
  // 弦区跨度（首弦到末弦）—— 与绘制内核同式，见 FretboardGeometry.stringsSpan
  const boardWidth = g.stringsSpan(stringCount);
  // 跨线程共享内核的入参：几何 + 归一弦数据（与导出 Worker 共用同一套绘制原语，见 fretboardDrawCore）
  const drawGeometry: FretboardDrawGeometry = {
    startStrX: layout.startStrX,
    gridTop: layout.gridTop,
    stringSpacing: g.stringSpacing,
    fretHeight: g.fretHeight,
    nutHeight: g.nutHeight,
    markerCenterY: layout.markerCenterY,
    muteCrossRadius: g.muteCrossRadius,
    openCircleRadius: g.openCircleRadius,
    dotRadius: g.dotRadius,
    lineWidth: g.lineWidth,
    barreThickness: g.barreThickness,
    fretNumberXOffset: g.fretNumberXOffset,
    showBoldNut,
  };
  const drawChord: FretboardDrawChord = {
    strings: (chord.strings ?? []).map(s => (s ? ([s.fret, s.preferFlat] as const) : undefined)),
    barres: chord.barres,
  };
  return {
    fretCount,
    leadTrim,
    stringCount,
    layout,
    // 指板水平中心（和弦名居中基准）
    boardCenterX: layout.startStrX + boardWidth / 2,
    drawGeometry,
    drawChord,
  };
}

/** `resolveGeometry` 的返回类型。三层渲染共享同一份几何（由 `renderFretboard` 算一次下传），
 *  避免每层各调一次 `resolveGeometry`（内含遍历 strings+barres 的 resolveFretWindow）。 */
export type FretboardGeometry = ReturnType<typeof resolveGeometry>;

/**
 * 名字层：和弦名（含简写）。
 *
 * 字号取几何给出的 `chordNameFontSize`（基准字号），**外部没有缩放入口** ——
 * 名字大小与指板其余尺寸同源，要改就改基准表，而不是在某处单独缩它。
 *
 * 依赖和弦名文本，故不进位图缓存，每次绘制现画 —— 改名、切「符号简写」
 * 都只重画这几个字，指板主体（位图）不受影响。
 *
 * 整图渲染时本层必须最先画：它位于顶部区块，与空弦/静音标记纵向相邻但先画，
 * 保证任何重叠处标记压住名字下伸部（与改造前的绘制顺序一致）。
 */
export function renderFretboardChordName(
  ctx: CanvasRenderingContext2D,
  opts: RenderFretboardOptions,
  geometry?: FretboardGeometry
): void {
  const { chord, colors, shorthand = false, showChordName = true, chordNameMaxWidth } = opts;
  if (!showChordName) return;
  const { boardCenterX, layout } = geometry ?? resolveGeometry(chord, opts);
  drawFormattedChordName(
    ctx,
    boardCenterX,
    layout.chordNameBaselineY,
    getChordName(chord, { shorthand }),
    colors.TEXT,
    chordNameMaxWidth
  );
}

/**
 * 主体层：空弦/静音标记 + 网格线 + 横按梁 + 按弦圆点。
 *
 * 只取决于指板状态（品位/横按/弦数/实际品窗/配色/显隐开关），与和弦名、名字缩放、简写、
 * fretOffset 都无关 —— 因此它正是「指板位图」缓存的内容（见 FretboardCanvas.vue）：
 * 同一指法无论显示多大、配哪个名字、落在哪个品位窗口，都共用这一张图。
 * （「实际品窗」由 resolveFretWindow 给出，含是否开启收紧空品格的档位。）
 */
export function renderFretboardBody(
  ctx: CanvasRenderingContext2D,
  opts: RenderFretboardOptions,
  geometry?: FretboardGeometry
): void {
  const { chord, colors, showOpenStringNotes = true, showBarre = true } = opts;
  const { stringCount, fretCount, leadTrim, drawGeometry, drawChord } = geometry ?? resolveGeometry(chord, opts);

  if (showOpenStringNotes) drawOpenStringMarkers(ctx, drawChord, drawGeometry, stringCount, colors);

  drawGridLines(ctx, drawGeometry, stringCount, fretCount, colors);
  if (showBarre) drawBarres(ctx, drawChord, drawGeometry, fretCount, leadTrim, colors);

  drawPressedDots(ctx, drawChord, drawGeometry, stringCount, leadTrim, colors);
}

/**
 * 品号层：零品弦枕 + 左侧品号（偏移时按 fretOffset 显示实际品位）。
 *
 * 依赖 fretOffset，故同样不进位图缓存，每次绘制现画。弦枕占位在网格顶线之上、
 * 按弦圆点与横按梁都在其下，故本层整层压在主体层之上不会遮挡任何内容。
 */
export function renderFretboardFretMarks(
  ctx: CanvasRenderingContext2D,
  opts: RenderFretboardOptions,
  geometry?: FretboardGeometry
): void {
  const { chord, colors, showFretNumbers = true } = opts;
  const { stringCount, fretCount, leadTrim, drawGeometry } = geometry ?? resolveGeometry(chord, opts);
  // 品号层用「原窗口起点 + 首列右移量」标注绝对品位：收紧后新窗口首列对应的绝对品位随之上移，
  // 于是「收紧到不再从第 1 品开始」的指法会自动改画品号而非弦枕（drawNut 只认零品窗口）
  const fretOffset = absoluteFretOffsetOf(chord.fretOffset, leadTrim);

  drawNut(ctx, drawGeometry, stringCount, fretOffset, colors);
  if (showFretNumbers) drawFretNumbers(ctx, drawGeometry, fretCount, fretOffset, CAPO_FONT, colors);
}

/**
 * 在给定的 CanvasRenderingContext2D 上绘制完整指板图（三层合成，顺序见各层注释）。
 * 调用者负责 clearRect、scale 等前置准备；此函数不清空画布，也不做背景填充。
 */
export function renderFretboard(ctx: CanvasRenderingContext2D, opts: RenderFretboardOptions): void {
  // 三层共享同一份几何：此前每层各调一次 resolveGeometry（内含 resolveFretWindow 遍历
  // strings+barres 与 computeFretboardLayout），一次整图渲染白算 2 遍。
  const geometry = resolveGeometry(opts.chord, opts);
  renderFretboardChordName(ctx, opts, geometry);
  renderFretboardBody(ctx, opts, geometry);
  renderFretboardFretMarks(ctx, opts, geometry);
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
    bgColor,
    showChordName = true,
    showOpenStringNotes = true,
    showFretNumbers = true,
    showBoldNut = true,
    showBarre = true,
    trimEmptyEdgeFrets = false,
  } = opts;

  // 画布尺寸必须按**实际品窗**算：否则收紧后画布仍按原列数留白，右侧会多出一段空网格
  const { drawFretCount: fc, leadTrim } = resolveFretWindow(chord, trimEmptyEdgeFrets);
  /** 顶部留白（px，逻辑坐标）：让导出图上方有充足呼吸感 */
  const TOP_PAD = 2;
  const layout = computeFretboardLayout({
    stringCount: chord.strings?.length || 6,
    fretCount: fc,
    showChordName,
    // 导出图是自包含画布（按 layout.height 直接定尺寸、无人裁剪），故这里固定让名字位跟随
    // showChordName：传 reserveChordName=true 只会在图顶留一段裁不掉的空白
    reserveChordName: showChordName,
    showOpenStringNotes,
    showFretNumbers,
    boldNut: nutIsDrawn(showBoldNut, absoluteFretOffsetOf(chord.fretOffset, leadTrim)),
  });
  const baseWidth: number = layout.width;
  const baseHeight = layout.height;

  // 名称宽度测量：按几何给出的名字字号实测渲染宽度，超出标准容器宽时对称扩宽画布
  const chordName = getChordName(chord, { shorthand });
  const measureCtx = document.createElement('canvas').getContext('2d');
  let canvasWidth = baseWidth;
  if (measureCtx && chordName && showChordName) {
    const { totalWidth } = measureChordNameLayout(measureCtx, chordName);
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
  if (!ctx) throw new Error('无法创建 2D 绘图上下文，指板图导出中止');

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
    shorthand,
    showChordName,
    showOpenStringNotes,
    showFretNumbers,
    showBoldNut,
    showBarre,
    trimEmptyEdgeFrets,
  });
  ctx.restore();

  return canvas;
}
