/**
 * 指板图 Canvas 渲染器（纯函数，无 Vue 依赖）
 * 被 FretboardCanvas.vue 和 WorkbenchExportPanel.vue 复用。
 */
import { parseChordNameTokens } from '@/domains/chord/theory/chordNameTokens';
import { getChordName } from '@/domains/chord/theory/theory';
import { clampDrawFretCount, FRETBOARD_CANVAS_CONFIG, MIN_FRET_COUNT } from '@/domains/fretboard/constants';
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

/**
 * 按字号缩放比推导名字层的字体度量：测量与绘制共用，避免两处各算一份字体串。
 *
 * 字号只保 1px 底（不许缩没），**不再设 9px / 7px 的「可读性下限」**：画布宽度由布局定死，
 * 名字放不下时唯一不越界的手段就是继续缩字号，下限只会把收缩卡死、逼出横向压缩（已废止）。
 * 下限的另一副作用是让字号与上标偏移脱钩（字号被夹住、superOffset 仍按请求比缩），
 * 去掉之后两者同比例，升降号不会再从「上标」沉成「大号平排」。
 * 现有消费方传入的缩放比为 0.7~1.0，取整结果远在旧下限之上，故本项对它们零影响。
 */
function resolveChordNameFonts(fontScale: number) {
  const baseFontSize = Math.max(1, Math.round(FRETBOARD_CANVAS_CONFIG.CHORD_NAME_FONT_SIZE * fontScale));
  const accFontSize = Math.max(1, Math.round(FRETBOARD_CANVAS_CONFIG.ACCIDENTAL_FONT_SIZE * fontScale));
  return {
    baseFont: `bold ${baseFontSize}px system-ui, -apple-system, sans-serif`,
    accFont: `bold ${accFontSize}px system-ui, -apple-system, sans-serif`,
    /** 升降号上标相对基线的垂直偏移（Canvas 坐标系向下为正，上标为负） */
    superOffset: Math.round(FRETBOARD_CANVAS_CONFIG.ACCIDENTAL_SUPERSCRIPT_OFFSET * fontScale),
  };
}

/**
 * 逐 token 度量和弦名宽度：主名与升降号上标使用不同字号，需分别测量后累加。
 * 字号只有 1px 底（见 resolveChordNameFonts），故宽度对 fontScale 单调且近似线性 ——
 * drawFormattedChordName 的「缩字号贴合」正是靠这条性质迭代收敛。
 */
function measureChordNameLayout(ctx: CanvasRenderingContext2D, chordName: string, fontScale = 1.0) {
  const fonts = resolveChordNameFonts(fontScale);
  let totalWidth = 0;
  const measured = parseChordNameTokens(chordName).map(token => {
    ctx.font = token.isAccidental ? fonts.accFont : fonts.baseFont;
    const { width } = ctx.measureText(token.text);
    totalWidth += width;
    return { ...token, width };
  });
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
function fitChordNameLayout(ctx: CanvasRenderingContext2D, chordName: string, fontScale: number, maxWidth: number) {
  const nominal = FRETBOARD_CANVAS_CONFIG.CHORD_NAME_FONT_SIZE;
  let scale = fontScale;
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
  fontScale = 1.0,
  maxWidth?: number
) {
  let { measured, totalWidth, fonts } = measureChordNameLayout(ctx, chordName, fontScale);
  if (measured.length === 0) return;

  if (maxWidth !== undefined && maxWidth > 0 && totalWidth > maxWidth)
    ({ measured, totalWidth, fonts } = fitChordNameLayout(ctx, chordName, fontScale, maxWidth));

  let curX = centerX - totalWidth / 2;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  for (const item of measured) {
    ctx.font = item.isAccidental ? fonts.accFont : fonts.baseFont;
    const y = item.isAccidental ? baselineY + fonts.superOffset : baselineY;
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

/**
 * 实际绘制的品窗 —— 相对和弦自身存储的 fretCount 窗口收紧后的结果。
 *
 * 口径：`chord.strings[].fret` 是**窗口内相对品位**（`fretOffset` 决定窗口起点，品号层按
 * `fretOffset + f` 标注绝对品位）。所以收紧品窗 = 减列数 **且**把窗口起点一起右移，
 * 二者必须同步，否则圆点与横按梁会落到错误的品上。
 */
export interface FretWindow {
  /** 实际绘制列数（≥ MIN_FRET_COUNT） */
  drawFretCount: number;
  /** 窗口首列相对原窗口右移的列数（= 裁掉的首部空列数）；0 表示首部未裁 */
  leadTrim: number;
  /**
   * 收紧是否真的改变了几何。
   *
   * false ⇒ 本指法的位图与「未开启收紧」时逐像素相同。消费方的位图键应放
   * drawFretCount / leadTrim 而**不是**开关本身，于是切换开关时只有几何真会变的指法才作废重画
   * —— 这就是「阻止本身没有空品格的指法重渲染」的落点。
   */
  trimmed: boolean;
}

/**
 * 收紧口径的**唯一实现**：由「存储列数 + 占用列号」算出实际品窗。
 *
 * 与 Chord 的具体形态解耦，是为了让导出 Worker 共用同一份口径 —— 它的和弦是紧凑元组形态
 * （`strings: [fret, preferFlat][]`），若各写一套，两处的收紧规则迟早分叉。
 *
 * 未开启收紧、无占用列、或窗口首末本就无空列时原样返回。列数下限取 MIN_FRET_COUNT：
 * 单列/双列的指板图会显得残缺（如全部音都落在同一品），且与现有品数标尺同口径；
 * 下限只约束**列数**、不阻止起点右移 —— 例：fretCount=5 而只用到第 4 品时，
 * 结果为「起点右移 1 列 + 共 3 列」，即第 2~4 品。
 *
 * **必须显式开启才生效**：`trimEmptyEdgeFrets` 缺省 false，即默认仍画满存储列数（全指板）。
 */
export function resolveFretWindowFromUsed(
  storedFretCount: number,
  usedFrets: Iterable<number>,
  trimEmptyEdgeFrets = false
): FretWindow {
  const storedCount = clampDrawFretCount(storedFretCount);
  const intact: FretWindow = { drawFretCount: storedCount, leadTrim: 0, trimmed: false };
  if (!trimEmptyEdgeFrets) return intact;

  // 占用的窗口内列号（1 基）：空弦(0) / 静音(-1) 不占列
  const used = [...usedFrets].filter(f => f >= 1);
  if (used.length === 0) return intact;

  const first = Math.min(...used);
  const last = Math.max(...used);
  if (first === 1 && last === storedCount) return intact;

  // 起点右移到首个占用列，但不晚于「末列往前数 MIN_FRET_COUNT 列」：下限只抬高起点，
  // 不会让窗口越过最后一个占用列
  const leadTrim = Math.min(first - 1, Math.max(0, last - MIN_FRET_COUNT));
  const drawFretCount = Math.min(storedCount - leadTrim, Math.max(MIN_FRET_COUNT, last - leadTrim));
  return { drawFretCount, leadTrim, trimmed: leadTrim !== 0 || drawFretCount !== storedCount };
}

/** 从和弦抽出占用列号（弦品位 + 横按品位），套用上面的收紧口径 */
export function resolveFretWindow(chord: Chord, trimEmptyEdgeFrets = false): FretWindow {
  const used: number[] = [];
  for (const s of chord.strings ?? []) if (s && s.fret >= 1) used.push(s.fret);
  for (const b of chord.barres ?? []) if (b.fret >= 1) used.push(b.fret);
  return resolveFretWindowFromUsed(chord.fretCount, used, trimEmptyEdgeFrets);
}

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

/** 大横按梁（圆角矩形）。leadTrim = 品窗收紧时首列右移的列数，用于把存储的相对品位换算到新窗口 */
function drawBarres(
  ctx: CanvasRenderingContext2D,
  chord: Chord,
  startStrX: number,
  gridTop: number,
  fretCount: number,
  leadTrim: number,
  colors: FretboardCanvasPalette
): void {
  if (!chord.barres || chord.barres.length === 0) return;
  const barreHalfH = FRETBOARD_CANVAS_CONFIG.BARRE_THICKNESS / 2;
  for (const b of chord.barres) {
    // 与 SVG 侧同判据（computeDisplayBarres）：无效横按或越出可见品位窗口的不绘制，
    // 避免库卡/乐谱/导出画出编辑器里不显示的越界梁
    const relFret = b.fret - leadTrim;
    if (relFret < 1 || relFret > fretCount) continue;
    if (!isBarreStillValid(chord.strings, b)) continue;
    const bx1 = startStrX + b.fromString * FRETBOARD_CANVAS_CONFIG.STRING_SPACING;
    const bx2 = startStrX + b.toString * FRETBOARD_CANVAS_CONFIG.STRING_SPACING;
    const by = gridTop + (relFret - 0.5) * FRETBOARD_CANVAS_CONFIG.FRET_HEIGHT;
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
  leadTrim: number,
  colors: FretboardCanvasPalette
): void {
  for (let s = 0; s < stringCount; s++) {
    const strData = chord.strings[s];
    // 存储的品位是原窗口内的相对品位；品窗收紧后需减去首列右移量，才落在新窗口的正确行上
    const fret = (strData ? strData.fret : 0) - leadTrim;
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

/** 由渲染选项推出几何：三层渲染共用同一套推导（纯算术，重复调用无成本）。
 *  fretCount 一律取**实际品窗**（resolveFretWindow 收紧后的结果），故三层共享同一套几何。 */
function resolveGeometry(chord: Chord, opts: RenderFretboardOptions) {
  const { showChordName = true, showOpenStringNotes = true, showFretNumbers = true, showBoldNut = true } = opts;
  const { drawFretCount: fretCount, leadTrim } = resolveFretWindow(chord, opts.trimEmptyEdgeFrets);
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
    leadTrim,
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
  const { chord, colors, chordNameScale = 1.0, shorthand = false, showChordName = true, chordNameMaxWidth } = opts;
  if (!showChordName) return;
  const { boardCenterX, layout } = resolveGeometry(chord, opts);
  drawFormattedChordName(
    ctx,
    boardCenterX,
    layout.chordNameBaselineY,
    getChordName(chord, { shorthand }),
    colors.TEXT,
    chordNameScale,
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
export function renderFretboardBody(ctx: CanvasRenderingContext2D, opts: RenderFretboardOptions): void {
  const { chord, colors, showOpenStringNotes = true, showBarre = true } = opts;
  const { stringCount, fretCount, leadTrim, layout, gridBottom, gridRight } = resolveGeometry(chord, opts);

  if (showOpenStringNotes)
    drawOpenStringMarkers(ctx, chord, layout.startStrX, layout.markerCenterY, stringCount, colors);

  drawGridLines(ctx, layout.startStrX, layout.gridTop, gridBottom, gridRight, stringCount, fretCount, colors);
  if (showBarre) drawBarres(ctx, chord, layout.startStrX, layout.gridTop, fretCount, leadTrim, colors);

  drawPressedDots(ctx, chord, layout.startStrX, layout.gridTop, stringCount, leadTrim, colors);
}

/**
 * 品号层：零品弦枕 + 左侧品号（偏移时按 fretOffset 显示实际品位）。
 *
 * 依赖 fretOffset，故同样不进位图缓存，每次绘制现画。弦枕占位在网格顶线之上、
 * 按弦圆点与横按梁都在其下，故本层整层压在主体层之上不会遮挡任何内容。
 */
export function renderFretboardFretMarks(ctx: CanvasRenderingContext2D, opts: RenderFretboardOptions): void {
  const { chord, colors, showFretNumbers = true, showBoldNut = true } = opts;
  const { stringCount, fretCount, leadTrim, layout } = resolveGeometry(chord, opts);
  // 品号层用「原窗口起点 + 首列右移量」标注绝对品位：收紧后新窗口首列对应的绝对品位随之上移，
  // 于是「收紧到不再从第 1 品开始」的指法会自动改画品号而非弦枕（drawNut 只认 offset === 0）
  const fretOffset = (chord.fretOffset ?? 0) + leadTrim;

  drawNut(ctx, layout.startStrX, layout.gridTop, stringCount, fretOffset, showBoldNut, colors);
  if (showFretNumbers) drawFretNumbers(ctx, layout.startStrX, layout.gridTop, fretCount, fretOffset, colors);
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
    trimEmptyEdgeFrets = false,
  } = opts;

  // 画布尺寸必须按**实际品窗**算：否则收紧后画布仍按原列数留白，右侧会多出一段空网格
  const { drawFretCount: fc } = resolveFretWindow(chord, trimEmptyEdgeFrets);
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
    chordNameScale,
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
