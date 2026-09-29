/**
 * 乐谱导出 Worker 的排版层：布局缩放、字体体系、字符量测与软折行。
 *
 * 从 scoreExportWorker.ts 抽出（原 103~534 行）。
 *
 * 职责边界：只做「算」不做「画」——字符列宽、和弦组宽度、行内容高度、软折行分段都在这里，
 * 绘制指板与行/表头分别在 scoreExportFretboard / scoreExportRender。
 * 依赖严格单向：types ← layout ← {fretboard, render, pages}。
 */

import { parseChordNameTokens as parseChordNameTokensCore } from '@/domains/chord/theory/chordNameTokens';
import { drawMeasuredChordName, measureChordNameTokens } from '@/domains/fretboard/fretboardDrawCore';
import { FretboardGeometry } from '@/domains/fretboard/model/fretboardGeometry';
import { absoluteFretOffsetOf, isZeroFretWindow } from '@/domains/fretboard/model/fretGeometry';
import { resolveFretWindowFromParts } from '@/domains/fretboard/model/fretWindow';
import { SCORE_EXPORT_CONFIG } from '@/domains/score/constants';
import { scoreFont } from '@/domains/score/preview/services/scoreFonts';
import { createLruCache } from '@/platform/utils/cache';

import type { ExportCharItem, ExportChordData, ExportLineItem, RenderSegment } from './scoreExportTypes';
import type { ChordNameToken } from '@/domains/chord/theory/chordNameTokens';
import type { FretWindow } from '@/domains/fretboard/model/fretWindow';

/** 输出图 JPEG 质量的**兜底值**：导出质量设置仍全程生效（`payload.exportQuality` 优先，
 *  见 scoreExportPages 的 `payload.exportQuality ?? EXPORT_JPEG_QUALITY`），只有载荷未携带该项时才用此默认。
 *  （此前注释写作「导出质量设置已移除」，与事实相反——设置项在 HeaderConfigPopover → 渲染载荷 → 本模块一直在用。） */
export const EXPORT_JPEG_QUALITY = 0.95;

// ---- 导出侧指板几何：本侧声明（三处指板实现之一） ----

/**
 * 导出字号体系相对屏幕指板渲染的**刻意差异**（导出排版更小更密，故这四项各自另定，
 * 不随基准那四项走）。其余尺寸一律由 FretboardGeometry 按 scale 从基准几何派生。
 *
 * 升降号两项写的是**相对正名字号的比**（基准那份也是一对比值，本侧取更小），而不是绝对 px：
 * 绝对 px 是贴着当时的字号调的，字号一改就不跟 —— 上标会反超正名。
 * 上标垂直偏移必须在此显式重载，哪怕比值与基准相同：基准的抬升比是「缩略图口径」，
 * 一旦有人为缩略图调它，导出图不该跟着动（这正是拆出本侧重载的意义）。
 */
const EXPORT_CAPO_TEXT_FONT_SIZE = 10;
const EXPORT_ACCIDENTAL_FONT_RATIO = 0.6875;
const EXPORT_ACCIDENTAL_RAISE_RATIO = 0.3125;
const EXPORT_FRET_NUMBER_X_OFFSET = 3.8;

/**
 * 乐谱导出（Worker / OffscreenCanvas）的指板几何声明。
 *
 * 除下列四处字号 / 偏移重载外全部派生自基准几何（**上下留白、左右留白与空弦区上下 padding
 * 一律不重载**：曾经这里是「底部不留白 = 0」的第二个来源，留白收进基准后撤销）；
 * scale 随「和弦缩放」在每条渲染消息入口重算（见 applyLayoutScales），
 * 故本类由该函数重建实例，而不是就地改字段。
 *
 * 弦枕那一段（`boldNut`）也随实例给：本侧有「画弦枕 / 不画弦枕」两张图，各由 applyLayoutScales
 * 重建一份，按和弦的品窗取用（见 geometryOfExportChord）。
 */
class ExportFretboardGeometry extends FretboardGeometry {
  /** 重载：导出品号字号 */
  override get capoTextFontSize(): number {
    return this.scaled(EXPORT_CAPO_TEXT_FONT_SIZE);
  }

  /** 重载：导出升降号上标字号（= 正名字号 × 导出比，随正名等比） */
  override get accidentalFontSize(): number {
    return this.chordNameFontSize * EXPORT_ACCIDENTAL_FONT_RATIO;
  }

  /** 重载：导出升降号上标垂直偏移（见上方常量注释：同值也要重载） */
  override get accidentalSuperscriptOffset(): number {
    return -this.chordNameFontSize * EXPORT_ACCIDENTAL_RAISE_RATIO;
  }

  /** 重载：导出品号的左偏移 */
  override get fretNumberXOffset(): number {
    return this.scaled(EXPORT_FRET_NUMBER_X_OFFSET);
  }
}

/**
 * 本次渲染的导出指板几何 —— **两张图各一份**：零品窗口那张画加粗弦枕、偏移窗口那张不画，
 * 指板顶与板身高度相差一条弦枕（弦枕画了才占位，见 FretboardGeometry 的 boldNut）。
 * 与 LAYOUT 同为「一次渲染一份」的模块级状态，由 applyLayoutScales 一并重建。
 */
let exportGeometryWithNut = new ExportFretboardGeometry(1, true);
let exportGeometryNoNut = new ExportFretboardGeometry(1, false);

/**
 * 取当前导出指板几何（量测与绘制一律经此读取，不再直读任何指板常量）。
 *
 * `boldNut` 按**本张图**给：纵向定位（网格顶 / 板身高度 / 空弦标记位）必须传
 * `nutIsDrawn(true, absoluteFretOffsetOf(chord.fretOffset, leadTrim))` 的结果；导出侧恒画弦枕
 * （没有「不画加粗弦枕」这一档），故判据只剩品窗那一半。字号 / 弦距 / 留白等与弦枕无关的量
 * 取缺省即可。
 */
export const fbGeometry = (boldNut = true): FretboardGeometry =>
  boldNut ? exportGeometryWithNut : exportGeometryNoNut;

// ---- 布局缩放（来自排列和弦配置：字号缩放 / 和弦缩放，作用于预览与导出图片生成） ----

/** 随「和弦缩放」联动的布局键：**指板之外的**和弦列间距（指板自身由 fbGeometry 承担） */
const CHORD_SCALED_KEYS = [
  'INLINE_CHORD_GAP',
  'CHORD_COLUMN_EXTRA_PAD',
  'EDGE_CHORD_SECTION_GAP',
  'CHORD_TO_LYRICS_GAP',
] as const;
/** 随「字号缩放」联动的布局键：歌词字号 / 字宽估算 / 行距 / 续行缩进 */
const FONT_SCALED_KEYS = [
  'LYRICS_FONT_SIZE',
  'SPACE_CHAR_WIDTH',
  'REGULAR_CHAR_WIDTH',
  'WRAPPED_LINE_INDENT',
  'WRAPPED_LINE_ROW_GAP',
  'LINE_ROW_GAP',
] as const;

/** 参与缩放的布局键：与两组键表编译期对齐，新增缩放键必须归入其中一组 */
type LayoutScaledKey = (typeof CHORD_SCALED_KEYS)[number] | (typeof FONT_SCALED_KEYS)[number];

/** 出厂基准值（每次渲染先按基准重算，避免缩放累积漂移） */
const BASE_LAYOUT_VALUES: { [K in LayoutScaledKey]: number } = (() => {
  const snapshot = {} as { [K in LayoutScaledKey]: number };
  for (const key of [...CHORD_SCALED_KEYS, ...FONT_SCALED_KEYS]) snapshot[key] = SCORE_EXPORT_CONFIG[key];

  return snapshot;
})();

/** 布局视图的可写形态：去掉 readonly，并把字面量数值宽化成 number（缩放结果不再是出厂整数） */
type MutableLayoutConfig = {
  -readonly [K in keyof typeof SCORE_EXPORT_CONFIG]: (typeof SCORE_EXPORT_CONFIG)[K] extends number
    ? number
    : (typeof SCORE_EXPORT_CONFIG)[K];
};

/**
 * Worker 排版层唯一的布局来源：SCORE_EXPORT_CONFIG 的私有可变副本。
 *
 * 缩放不能就地改出厂常量——它是主线程与 Worker 各自模块图里的同一份导出，
 * 导出路径以外的读取方（页脚合成、配置弹窗预览）会拿到「上一次渲染缩放后」的残值；
 * 而且它带 as const，逐键写入只能靠双重断言绕过类型层。副本只在渲染消息入口按基准重算，
 * Worker 内的量测与绘制一律读这里。
 */
export const LAYOUT: MutableLayoutConfig = { ...SCORE_EXPORT_CONFIG };

/** 取 2d 上下文：getContext 在显存压力/上下文丢失下会返回 null，此处一次性转成显式失败，
 *  否则后续绘制处以 "Cannot read properties of null" 的形式爆开，看不出是画布没拿到 */
export const requireContext2D = (canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D => {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('OffscreenCanvas 2D 上下文创建失败');
  return ctx;
};

/** 字体纪元：applyLayoutScales 每次执行自增，作为字体字符串缓存的失效信号 */
let fontEpoch = 0;

/** 按缩放系数重算布局常量（Worker 每收到渲染消息先调用；表头标题/元信息体系保持不缩放）。
 *  fontScale/fretboardScale 以百分制传入（100 = 100%），此处换算为倍率后乘基准布局值 */
export const applyLayoutScales = (fontScale: number, fretboardScale: number): void => {
  const fontFactor = fontScale / 100;
  const fretboardFactor = fretboardScale / 100;

  // 指板几何整体重建：本侧唯一的声明口 —— 一切尺寸 = 基准几何 × 和弦缩放倍数
  exportGeometryWithNut = new ExportFretboardGeometry(fretboardFactor, true);
  exportGeometryNoNut = new ExportFretboardGeometry(fretboardFactor, false);

  for (const key of CHORD_SCALED_KEYS) LAYOUT[key] = BASE_LAYOUT_VALUES[key] * fretboardFactor;

  for (const key of FONT_SCALED_KEYS) LAYOUT[key] = BASE_LAYOUT_VALUES[key] * fontFactor;

  // 字体纪元自增：字号类布局键已重算，任何缓存的字体字符串（含弦名 / 升降号 / 品号 / 歌词）就此失效
  fontEpoch++;
};

/**
 * 本次渲染是否忽略首末的空品格 —— 与 LAYOUT 同为「一次渲染一份」的模块级状态：
 * 渲染消息入口设定，Worker 内所有量测与绘制都读它。
 *
 * 为什么不逐函数透传：品窗收紧会同时改变**行内容高**（computeLineContentHeight，5 处装箱 / 分段
 * 调用点都在本文件内）与**指板绘制**，逐层透传要动整条装箱链；而 Worker 一次只处理一条渲染消息，
 * 本状态的生命周期与 LAYOUT 完全一致。
 */
let trimEmptyEdgeFretsMode = false;

/** 设定本次渲染的品窗收紧档位（渲染消息入口调用，与 applyLayoutScales 同一时机） */
export const setTrimEmptyEdgeFrets = (enabled: boolean): void => {
  trimEmptyEdgeFretsMode = enabled;
};

/**
 * 实际品窗 —— 导出侧唯一入口：与主线程共用 resolveFretWindowFromParts 的收紧口径，两侧不各写一套。
 *
 * 行内容高、指板绘制的 Y、栅格键三处**必须**取同一个值：否则会出现「位图变矮但垂直位置不动」
 * ——行高与 Y 按原列数算、绘制按收紧列数画，位图底边被钉在原地、与歌词之间留缝。
 */
export const fretWindowOfExportChord = (chord: ExportChordData): FretWindow => {
  // 弦品位按导出侧的紧凑形态取（元组首项）；空弦 / 静音的过滤归 resolveFretWindowFromUsed
  const stringFrets: number[] = [];
  for (const s of chord.strings ?? []) if (s) stringFrets.push(s[0]);
  return resolveFretWindowFromParts(chord.fretCount, stringFrets, chord.barres, trimEmptyEdgeFretsMode);
};

/**
 * 取某个导出和弦所属**那张图**的几何（按「本图是否画加粗弦枕」）。
 *
 * 弦枕画了才占位：零品窗口那张图比偏移窗口那张多一条弦枕，网格顶与板身高度都不同。故凡按和弦
 * 算纵向量的地方（板身高度、贴图 Y、行内容高）都要经这里取几何，不能读 `fbGeometry()` 的缺省档。
 * 导出侧恒画弦枕（没有「不画加粗弦枕」这一档，见 scoreExportFretboard 的 drawFretboardVector），
 * 故判据只剩品窗那一半 —— 与绘制侧 `drawNut` 读的绝对偏移同源。
 */
export const geometryOfExportChord = (chord: ExportChordData): FretboardGeometry =>
  fbGeometry(isZeroFretWindow(absoluteFretOffsetOf(chord.fretOffset, fretWindowOfExportChord(chord).leadTrim)));

/** 模块级 Token 解析缓存，避免同曲目内重复出现的和弦名反复正则分割。
 *  上限 1024：Worker 现在跨次渲染常驻，跨曲目累积的分片结果需要兜底回收（此前每次渲完即销毁，无需上限）。
 *  单条仅几十字节，1024 条可忽略不计，足够覆盖一整个乐库的去重和弦名。 */
const tokenCache = createLruCache<ChordNameToken[]>(1024);

/** 带缓存的和弦名分片解析（核心实现见 utils/score/chordNameTokens） */
export function parseChordNameTokens(chordName: string): ChordNameToken[] {
  const cached = tokenCache.get(chordName);
  if (cached) return cached;
  const tokens = parseChordNameTokensCore(chordName);
  tokenCache.set(chordName, tokens);
  return tokens;
}

/** 分片文字绘制（居中，升降号上标）。当前唯一调用方是 drawFormattedChordName。
 *  注意：表头元信息不经过这里 —— 它走 renderHeader 内独立的 measureValueTokens + 自带绘制循环，
 *  修改本函数不会影响元信息排版。 */
export function drawTokenizedText(
  ctx: OffscreenCanvasRenderingContext2D,
  centerX: number,
  baselineY: number,
  text: string,
  color: string,
  baseFont: string,
  accFont: string,
  superscriptOffset: number
) {
  // 量宽 + 居中绘制两个叶子与主线程屏幕指板共用（见 fretboardDrawCore），字体由本侧注入
  const { measured } = measureChordNameTokens(ctx, parseChordNameTokens(text), baseFont, accFont);
  drawMeasuredChordName(ctx, centerX, baselineY, measured, superscriptOffset, color);
}

/** 乐谱字体（族名 / 族栈 / 按需装载）见 services/scoreFonts —— **跨环境唯一来源**：预览层（页面的
 *  document.fonts）与渲染 Worker（self.fonts）装同一份子集、同一个族名。本模块内所有字体串都由
 *  scoreFont 拼出，族栈改一处即全谱生效。 */

/** 乐谱固定用到的**字体文件字重**：标题 / 和弦名 / capo 与品号取 700，元信息标签取 400，歌手与
 *  元信息正文取 500（按 CSS 匹配落到 400）。歌词字重随导出参数变化，由入口补入。
 *
 *  供入口**按需装载**（见 services/scoreFonts）：Sarasa 的 Light（300）只在歌词字重选 light 时才
 *  需要，默认导出不必为它多下 1MB、多解一份字体。新增 scoreFont 调用点时同步此表。 */
export const SCORE_BASE_FONT_WEIGHTS = [400, 700] as const;

/**
 * 字体字符串缓存（按「字体纪元」失效）。
 *
 * 字体串里只有 LAYOUT 的字号参与拼接，而这些字号仅在 applyLayoutScales 执行时变化；
 * 该方法在每条渲染消息开头都会调用一次（缩放不变时写入的是同样的值），因此在其中自增纪元，
 * 由这里按纪元重建缓存即可。收益集中在高频路径：常规字号下的和弦名（正名 + 上标）每绘制一次
 * 就要取一次字体，缓存后不再重复拼模板串。
 *
 * 注 1：表头（标题 / 歌手 / 元信息）字体不随本缓存 —— 它们每次 renderHeader 只构造一次、
 * 不在分片循环内，缓存收益可忽略，保持就地构造更直观。
 * 注 2：**贴合求解**（长名缩字号）那一路字号逐轮变化，本就无从缓存，走 chordNameFontOfSize 现拼。
 */
let fontsEpoch = -1;
const fontCache = {
  chordNameBase: '',
  chordNameAccidental: '',
  capo: '',
};

/** 按字号拼和弦名字体串：纪元缓存与「贴合缩字号」现拼共用同一模板，避免两处字号口径漂移 */
const chordNameFontOfSize = (size: number): string => scoreFont('bold', size);

/** 取当前纪元的字体集（纪元未变则直接复用缓存对象） */
const refreshFonts = () => {
  if (fontsEpoch === fontEpoch) return fontCache;
  const g = fbGeometry();
  fontCache.chordNameBase = chordNameFontOfSize(g.chordNameFontSize);
  fontCache.chordNameAccidental = chordNameFontOfSize(g.accidentalFontSize);
  fontCache.capo = scoreFont('bold', g.capoTextFontSize);
  fontsEpoch = fontEpoch;
  return fontCache;
};

/** 和弦名正文字体（绘制与测量共用同一来源，避免两处字号漂移） */
export const chordNameBaseFont = (): string => refreshFonts().chordNameBase;

/** 和弦名上标升降号字体（同上） */
export const chordNameAccidentalFont = (): string => refreshFonts().chordNameAccidental;

/** 变调夹文本字体（指板图内 capo 标注使用） */
export const capoFont = (): string => refreshFonts().capo;

/** 歌词字体缓存：字号随「字号缩放」变化（纪元），字重随导出参数变化，故按二者联合记忆。
 *  歌词与全谱共用同一份族栈（见 scoreFont），这里的缓存只为省掉逐行重复拼串。 */
let lyricsFontKey = '';
let lyricsFontValue = '';
export const getLyricsFont = (weight: number): string => {
  const key = `${fontEpoch}:${weight}`;
  if (key !== lyricsFontKey) {
    lyricsFontKey = key;
    lyricsFontValue = scoreFont(weight, LAYOUT.LYRICS_FONT_SIZE);
  }
  return lyricsFontValue;
};

/**
 * 量出和弦名分片后的总宽度（含上标升降号）：供贴合求解与居中绘制共用。
 * 字号缺省取当前纪元的全局值（绝大多数调用走这一档）；显式传值即按该字号实测，
 * 供贴合求解逐轮试算（见 fitChordNameFonts）。
 */
function measureChordNameWidth(
  ctx: OffscreenCanvasRenderingContext2D,
  chordName: string,
  baseFontSize = fbGeometry().chordNameFontSize,
  accidentalFontSize = fbGeometry().accidentalFontSize
): number {
  const { totalWidth } = measureChordNameTokens(
    ctx,
    parseChordNameTokens(chordName),
    chordNameFontOfSize(baseFontSize),
    chordNameFontOfSize(accidentalFontSize)
  );
  return totalWidth;
}

/** 贴合迭代上限：宽度对字号近似线性，一轮即落到目标附近；字号取整会留「分片数 × 0.5px」的残差，再收 1~2 轮 */
const NAME_FIT_MAX_ROUNDS = 4;
/** 每轮留 0.5% 余量：宁可小一丝，也不要卡在浮点边界上正好越出零点几像素 */
const NAME_FIT_SAFETY = 0.995;
/** 整档下探步数上限：覆盖 11.2px → 1px 的极端收缩，正常名字一两步即收敛 */
const NAME_FIT_MAX_STEPS = 24;

/**
 * 求解贴合 maxWidth 的和弦名字号（调用方保证进入时确实放不下）：**只缩字号，不做横向压缩**。
 *
 * 上标偏移按**最终实际字号**等比推导 —— 若仍按原始比例算，字号缩小时升降号会从「上标」
 * 沉成「大号平排」（两者同源才成立）。
 * 两步收敛：先按「目标宽 / 实测宽」线性估（宽度对字号近似线性，一轮即到位），再按整数字号
 * 逐档下探补足 —— 字号取整会产生台阶，等比估算可能差口气地停在目标上方，而取整后再乘比例
 * 已经压不动了；下探以整数字号为单位，步数有限，必然收敛。
 */
function fitChordNameFonts(
  ctx: OffscreenCanvasRenderingContext2D,
  chordName: string,
  maxWidth: number
): { baseFont: string; accFont: string; superOffset: number } {
  /** 上标字号与正名字号的名义比（下探时按它同步收窄，保持两者的比例关系） */
  const g = fbGeometry();
  const accidentalRatio = g.accidentalFontSize / g.chordNameFontSize;
  let basePx = g.chordNameFontSize;
  let accPx = g.accidentalFontSize;
  // 首轮用纪元字体测（与「够放」快速路径同源），故判定口径完全一致
  let width = measureChordNameWidth(ctx, chordName);

  for (let round = 0; round < NAME_FIT_MAX_ROUNDS && width > maxWidth; round++) {
    const ratio = (maxWidth / width) * NAME_FIT_SAFETY;
    const nextBase = Math.max(1, Math.round(basePx * ratio));
    const nextAcc = Math.max(1, Math.round(accPx * ratio));
    const nextWidth = measureChordNameWidth(ctx, chordName, nextBase, nextAcc);
    // 取整台阶已卡住：再乘同一个比例也只是空转，交给下面按整档下探
    if (nextWidth >= width) break;
    basePx = nextBase;
    accPx = nextAcc;
    width = nextWidth;
  }

  for (let step = 0; step < NAME_FIT_MAX_STEPS && width > maxWidth && basePx > 1; step++) {
    basePx = Math.max(1, Math.round(basePx) - 1);
    accPx = Math.max(1, Math.round(basePx * accidentalRatio));
    width = measureChordNameWidth(ctx, chordName, basePx, accPx);
  }

  return {
    baseFont: chordNameFontOfSize(basePx),
    accFont: chordNameFontOfSize(accPx),
    superOffset: Math.round(fbGeometry().accidentalSuperscriptOffset * (basePx / fbGeometry().chordNameFontSize)),
  };
}

/**
 * 绘制带上标升降号（# / b / ♯ / ♭）的和弦名称，严格水平居中对齐。
 *
 * 传了 maxWidth（名字可用宽度，逻辑 px）即启用自适应：**只等比缩字号**到放得下为止。
 * 刻意不做横向压缩 —— canvas 的 `fillText(..., maxWidth)` 是只压 X 轴的非等比缩放，字形会被
 * 压扁，且压缩量没有下限（名字越长压得越扁），极端情况糊成一团，比字小一号更糟。
 * 不传则按全局字号原样绘制，此时调用方必须自行保证留白够宽，否则越界部分会被位图边界硬裁。
 */
export function drawFormattedChordName(
  ctx: OffscreenCanvasRenderingContext2D,
  centerX: number,
  baselineY: number,
  chordName: string,
  color: string,
  maxWidth?: number
) {
  if (maxWidth !== undefined && maxWidth > 0 && measureChordNameWidth(ctx, chordName) > maxWidth) {
    const fit = fitChordNameFonts(ctx, chordName, maxWidth);
    drawTokenizedText(ctx, centerX, baselineY, chordName, color, fit.baseFont, fit.accFont, fit.superOffset);
    return;
  }
  // 够放：走纪元缓存字体，逐像素与「无 maxWidth」的历史行为一致
  drawTokenizedText(
    ctx,
    centerX,
    baselineY,
    chordName,
    color,
    chordNameBaseFont(),
    chordNameAccidentalFont(),
    fbGeometry().accidentalSuperscriptOffset
  );
}

/** 中文排版避头尾：禁止出现在行首的标点符号集合 */
const NO_LINE_START_CHARS = new Set([
  '，',
  '。',
  '！',
  '？',
  '、',
  '；',
  '：',
  '）',
  '》',
  '」',
  '』',
  '”',
  '’',
  '…',
  '—',
  ',',
  '.',
  // 下一行是排版标点常量而非 Tailwind 类名，important 位置检查在此为误报
  // eslint-disable-next-line better-tailwindcss/enforce-consistent-important-position
  '!',
  '?',
  ';',
  ':',
  ')',
  ']',
  '}',
  '>',
]);

/** 半角 ASCII 字形的推进宽比例：歌词主用等宽字体（见 SCORE_FONT_FAMILY），等宽族的推进宽是
 *  恒定的设计值而非均值。首选 Sarasa Mono SC 实测为 0.5em（upem=1000，ASCII 全为 500），故取
 *  0.5 —— 与汉字那 1em 恰好 2:1，两种文字的列内空隙因此逐字相同。
 *
 *  取小是安全的：列宽 = 0.5em 字号 + 字间隙（30 − 23 = 7px，即 0.304em 字号）≈ 0.804em，
 *  高于任何常见等宽字形的推进宽（上限约 0.6em）。故 Sarasa 取不到（离线且缓存未命中）而回落
 *  到 Consolas（0.55em）或 Menlo / SF Mono（0.6em）时也不会叠字，只是字距比汉字那份略紧。 */
const HALF_WIDTH_ADVANCE_RATIO = 0.5;

/** 半角 ASCII 字符的列宽 = 典型字形推进宽 + 与全角汉字**同一个**字间隙。
 *
 *  汉字列宽里的字间隙 = REGULAR_CHAR_WIDTH − LYRICS_FONT_SIZE（全角字推进宽恰为 1em，即字号
 *  本身），这里直接沿用同一个空隙，使两种文字的肉眼字距一致。此前是「汉字列宽 × 0.58」的定值
 *  比例，它把字形宽与字间隙一并按比例压掉：23px 字号 + 30px 列宽下每字只剩 17px，而小写实测
 *  推进宽就有 12~13px、大写与 m / w 到 16~20px —— 后者已超出自己的列宽，相邻字母直接贴住，
 *  观感上「英文比汉字挤很多」。列宽与字间隙分离后，宽字形最多吃掉自己的那份空隙，不再压邻居；
 *  歌词换等宽（SCORE_FONT_FAMILY）后 ASCII 推进宽恒等，字距进一步变成逐字相同 ——
 *  词内再按 `getWordKern` 折掉半个字间隙，同一档内两两相等、且词内是词界的一半。
 *
 *  每次求值、不提成模块常量：两个入参都在 FONT_SCALED_KEYS 里，随「字号缩放」在
 *  applyLayoutScales 内重算，提前算死会把缩放后的值冻在出厂基准上。 */
const halfWidthCharWidth = (): number =>
  LAYOUT.LYRICS_FONT_SIZE * HALF_WIDTH_ADVANCE_RATIO + (LAYOUT.REGULAR_CHAR_WIDTH - LAYOUT.LYRICS_FONT_SIZE);

/** 默认 6 弦指板的框宽：和弦列宽与边和弦组宽度按它计算（与绘制侧 boardWidth(6) 同值） */
export const fretboardBoxWidth = (): number => fbGeometry().boardWidth(6);

/** 空格（半角 / 全角）：两者在排版上同为「一格空位」，列宽与「连续空格」的判定必须同一口径 */
const isSpaceChar = (char: string): boolean => char === ' ' || char === '　';

/** 半角 ASCII 判定（`code <= 127`）：列宽分档与「词内折减」共用同一判据，不各写一份码点比较 */
const isHalfWidthChar = (char: string): boolean => char.charCodeAt(0) <= 127;

/** 歌词分隔符（半角 / 全角竖线）：视觉上当标点、不当正文字（与绘制端的弱化色同源）。
 *  绘制端（renderScoreLine）另有一份内联的同义判定，未一并收拢 —— 那是独立的既有代码，
 *  本次不动它，留待下次碰那条路径时合并。 */
const isLyricBarChar = (char: string): boolean => char === '|' || char === '｜';

/**
 * 「词内字符」的判定：**半角、不是空格、不是歌词分隔符**。
 *
 * 歌词里只有两类东西会真正打断一个词：空格（分词）与分隔符（分段竖线）。其余半角字符一律算词内 ——
 * 数字（`capo 2`）、撇号（`don't`）、连字符（`rock-'n'-roll`）、逗号与括号都是紧贴相邻字母写的。
 * 若按「只认 A-Za-z」把标点排除，`don't` 会变成 `don ' t`（撇号两侧各留一份全间距），
 * 比不处理更难看；而全角汉字本就不参与折减（列宽走 REGULAR_CHAR_WIDTH），
 * 中英混排时汉字两侧仍是全间距。
 */
const isWordChar = (char: string): boolean => isHalfWidthChar(char) && !isSpaceChar(char) && !isLyricBarChar(char);

/**
 * **词内折减**（px）：相邻两个词内字符之间的间距收一半 —— 它们之间减掉「半个字间隙」。
 *
 * 两个字之间的**可视间距** = 两格各自让出的那半个字间隙之和 = 一个字间隙
 * （`REGULAR_CHAR_WIDTH − LYRICS_FONT_SIZE`，出厂值 30 − 23 = 7px；半角格 19px 里字形推进宽
 * 占 11.5px，余下的由两侧均分）。把后一个字的推进量减掉半个字间隙，两字之间就只剩一半，
 * 一段连续字母于是读起来是一个整体而不是「一列孤立的字」。
 *
 * 只在**词内**折减：词与词之间隔着空格格（`SPACE_CHAR_WIDTH`），空格两侧各留一个字间隙，
 * 词界宽度与改前逐像素相同 —— 收紧的只有「没有分隔符、本该连读」的那一段。
 *
 * **挂和弦不再豁免**（2026-09-28 口径变更）：旧口径里挂和弦的字不参与折减，理由是「那一列宽到
 * 由指板框决定，收半个字间隙在观感上什么也没发生」—— 那条理由随「和弦图不再撑宽字符格」
 * （见 LyricFlow）一起失效了。现在图与图之间的间隔由 `chordFigurePush` 独立保证，
 * 折减只作用在字形上，两者互不干扰：`A6` 因此是紧挨着的两个字形，而不是被和弦图撑开的两截。
 *
 * 每次求值、不提成模块常量：两个入参都在 FONT_SCALED_KEYS 里，随「字号缩放」在 applyLayoutScales
 * 内重算，提前算死会把缩放后的值冻在出厂基准上（与 halfWidthCharWidth 同因）。
 */
export const getWordKern = (prev: ExportCharItem, next: ExportCharItem): number =>
  isWordChar(prev.char) && isWordChar(next.char) ? (LAYOUT.REGULAR_CHAR_WIDTH - LAYOUT.LYRICS_FONT_SIZE) / 2 : 0;

/** 字形推进宽（px）：本字在歌词流里占的横向宽度，**不含和弦占位**。
 *
 *  ⚠️ 与旧口径的区别：这里**不再**为挂和弦的字符返回「指板框宽 + pad」。和弦图不撑宽它所在的
 *  字符格 —— 图锚定字形中心，只在与上一张图相撞时把内容右推（见 `LyricFlow` / `chordFigurePush`）。
 *  折行累加与绘制推进都必须按「本函数 + 词内折减 + 推挤量」算，两处口径不一致会让「量到的宽」与
 *  「画出来的宽」分叉（折行位置与实际绘制错开）；`placeLyricChar` 就是这两处的共用入口。
 *
 *  「忽略空格」不在本函数里：那一档已在排版入口把连续空格压进 chars（见 compressConsecutiveSpaces），
 *  折行与绘制读到的字符列表本就同源，因此不再需要「两侧必须传同一个开关」这条纸面约定 ——
 *  它此前是折行宽度与绘制宽度错位的唯一防线，任一侧漏传就错位。 */
export function getGlyphAdvanceWidth(item: ExportCharItem): number {
  if (isSpaceChar(item.char)) return LAYOUT.SPACE_CHAR_WIDTH;
  return isHalfWidthChar(item.char) ? Math.round(halfWidthCharWidth()) : LAYOUT.REGULAR_CHAR_WIDTH;
}

/** 计算连续边和弦组所占用的总宽度 */
export function getChordsGroupWidth(chords?: ExportChordData[]): number {
  if (!chords || chords.length === 0) return 0;
  return (
    chords.length * fretboardBoxWidth() + (chords.length - 1) * LAYOUT.INLINE_CHORD_GAP + LAYOUT.EDGE_CHORD_SECTION_GAP
  );
}

// ---- 歌词横向排版：字形流 + 和弦图占位（两条口径） ----

/**
 * 歌词行的横向排版状态：**字形与和弦图分成两条口径**。
 *
 * - **字形**按 `getGlyphAdvanceWidth` 逐字推进，词内相邻两字再收半个字间隙（`getWordKern`）——
 *   一段连续字母因此是「一个整体」，不会被挂在上面的和弦图撑开；
 * - **和弦图**锚定**所在字符的字形中心**（水平居中于自己的字），只受一条约束：与上一张图的中心
 *   至少相距「指板框宽 + `CHORD_COLUMN_EXTRA_PAD`」，不够就把本字连同其后内容右推
 *   （见 `chordFigurePush`）—— 于是「隔开两段字」的只有和弦本身，没有别的。
 *
 * 旧口径是「挂和弦的字符占一整列（`max(指板框宽 + pad, 字宽)`）、字形居中于列」：字被推到
 * 自己列的正中，而那一列宽到装得下一整张指板图，于是和弦挂在词首字时整个词从首字起就被推开
 * （`A6` 被排成 `A⎵⎵⎵6`）。
 *
 * `x` 是字形流游标（下一个字形格的左边缘，**未含**它与前一字之间的词内折减）；
 * `figureCenter` 是本段已放置的最后一张和弦图的中心 —— 只有它参与「图不重叠」的推挤。
 * 两者都以**段首为原点**：绘制端画的时候统一加 `startX`，于是段落宽度与折行端的预计算同口径。
 */
export interface LyricFlow {
  x: number;
  figureCenter: number;
}

/**
 * 段内还没有和弦图时 `figureCenter` 的初值。
 *
 * 取「−框宽/2 − pad/2」而不是 −∞：第一张图因此也被同一条推挤规则约束 —— 它的左边缘会落在
 * 段首之后 pad/2 处，与旧口径「图居中于列、列两侧各 pad/2」的观感一致（段首不贴边）。
 */
const NO_PREVIOUS_FIGURE_CENTER = (): number => -fretboardBoxWidth() / 2 - LAYOUT.CHORD_COLUMN_EXTRA_PAD / 2;

/** 起一条歌词流（段首为原点）；`startChords` 非空时游标接在边和弦组之后，推挤也从最后一张图起算 */
export const beginLyricFlow = (startChords?: ExportChordData[]): LyricFlow => {
  const count = startChords?.length ?? 0;
  return {
    x: count > 0 ? getChordsGroupWidth(startChords) : 0,
    figureCenter:
      count > 0
        ? (count - 1) * (fretboardBoxWidth() + LAYOUT.INLINE_CHORD_GAP) + fretboardBoxWidth() / 2
        : NO_PREVIOUS_FIGURE_CENTER(),
  };
};

/**
 * 挂和弦的字符需要为「图不与上一张相撞」右推多少（px）；不挂和弦恒为 0。
 *
 * 判据是**图的中心**而不是左边缘：图恒宽（`fretboardBoxWidth`），两中心相距 ≥ 框宽 + pad
 * 等价于两图之间留出 pad 的缝 —— 与旧口径「挂和弦的列宽 = 框宽 + pad」逐像素同值。
 */
const chordFigurePush = (glyphCenter: number, prevFigureCenter: number): number =>
  Math.max(0, prevFigureCenter + fretboardBoxWidth() + LAYOUT.CHORD_COLUMN_EXTRA_PAD - glyphCenter);

/**
 * 把本字放进流并返回它的**字形中心 x**（相对段首；和弦图也画在这个 x 上），就地推进流。
 *
 * 绘制端与折行端共用它 —— 折行端先把本字放进一条**影子流**预演一次落位（见 wrapScoreLines），
 * 于是「放不放得下」的判定与真正落位走的是同一条代码路径，不可能分叉。
 */
export const placeLyricChar = (flow: LyricFlow, item: ExportCharItem, kern: number): number => {
  const glyphAdv = getGlyphAdvanceWidth(item);
  let center = flow.x - kern + glyphAdv / 2;
  if (item.chord) {
    center += chordFigurePush(center, flow.figureCenter);
    flow.figureCenter = center;
  }
  flow.x = center + glyphAdv / 2;
  return center;
};

/**
 * 本段当前的**实际右边界**（px，相对段首）：字形游标与最后一张和弦图的右边缘取大者。
 *
 * 图比字宽（框宽 72 vs 半角字 19），末尾那个字挂了和弦时图会探出游标之外 —— 段落宽度必须把它
 * 算进去，否则居中排版按「字的右边缘」居中，整行看着偏左。
 */
export const lyricFlowWidth = (flow: LyricFlow): number =>
  Math.max(flow.x, flow.figureCenter + fretboardBoxWidth() / 2);

/**
 * 边和弦组入列前把游标推过最后一张图（图与图之间恒留 `CHORD_COLUMN_EXTRA_PAD`）。
 *
 * 段尾那张图同样会探出游标（见 `lyricFlowWidth`），而边和弦组是紧接游标画的，不推就会压到图上。
 * 段内还没有图时本式给出负值（`NO_PREVIOUS_FIGURE_CENTER` 的推论），是空操作 —— 不必特判。
 */
export const reserveBeforeEndChords = (flow: LyricFlow): void => {
  const need =
    flow.figureCenter + fretboardBoxWidth() / 2 + LAYOUT.CHORD_COLUMN_EXTRA_PAD - LAYOUT.EDGE_CHORD_SECTION_GAP;
  if (need > flow.x) flow.x = need;
};

/** 根据段的字符列表与边和弦计算纯内容高度（不含行间距）。使用迭代代替 spread + map 避免临时数组分配 */
export function computeLineContentHeight(
  chars: ExportCharItem[],
  startChords?: ExportChordData[],
  endChords?: ExportChordData[]
): number {
  let hasChords = false;
  // 行高取行内各和弦**板身高度的最大值**：板身高度随「本图是否画弦枕」差一条弦枕，
  // 而同一行里可以既有零品和弦又有偏移和弦，故不能只取最大品数再算一次高度。
  let maxFbHeight = 0;

  // 列数取**实际品窗**（收紧后的），与指板绘制、栅格键同一来源：否则行高按原列数算，
  // 收紧后位图变矮却仍按原高度占位，底边被钉在原地、与歌词之间留缝
  const accumFret = (c: ExportChordData) => {
    hasChords = true;
    const fbHeight = geometryOfExportChord(c).boardBoxHeight(fretWindowOfExportChord(c).drawFretCount);
    if (fbHeight > maxFbHeight) maxFbHeight = fbHeight;
  };

  if (startChords) for (const c of startChords) accumFret(c);
  if (endChords) for (const c of endChords) accumFret(c);
  for (const item of chars) if (item.chord) accumFret(item.chord);

  if (!hasChords) return LAYOUT.LYRICS_FONT_SIZE;
  return maxFbHeight + LAYOUT.CHORD_TO_LYRICS_GAP + LAYOUT.LYRICS_FONT_SIZE;
}

/**
 * 「忽略空格」档的字符压缩：把**连续的空格**收成一个（2026-09-28 口径变更）。
 *
 * 旧口径是「未挂和弦的空格不占列宽」—— 等价于把空格整批抹掉：单个空格也一起没了，
 * 词与词之间只要用一个空格分隔就会粘住。新口径只动**连续**的那一段：
 * 单个空格照旧占一格（它本来就是排版的成分），一串空格收成一格，整行因此更紧凑而不粘连。
 *
 * 挂和弦的空格**不参与压缩**：那一格要承载指板图，收掉等于把和弦图弄丢；
 * 它同时打断连续性，两侧的空格各自重新起算（`空格 空格(挂和弦) 空格` 三段原样保留）。
 *
 * 压缩返回**新数组**而不是原地改写：段 chars 会被绘制端逐项消费，长度变了也无妨 ——
 * 绘制与折行都按 chars 顺序累加 x、不按索引记忆位置（见 renderScoreLine），
 * 故字符列表的增删不会让任何一处的位置假设失效。反过来，只有长度真的短了，
 * 段宽才是实际占用（留着空壳字符会让段宽虚高、折行提前换行）。
 */
const compressConsecutiveSpaces = (chars: ExportCharItem[]): ExportCharItem[] => {
  const compressed: ExportCharItem[] = [];
  let prevWasCompressibleSpace = false;
  for (const item of chars) {
    if (isSpaceChar(item.char) && !item.chord) {
      if (prevWasCompressibleSpace) continue;
      prevWasCompressibleSpace = true;
    } else prevWasCompressibleSpace = false;
    compressed.push(item);
  }
  return compressed;
};

/** 将原始歌词行根据最大可用宽度自动切分为软折行段落（含避头尾禁则与孤字控制）。
 *
 *  ignoreEmptySpace 表示压缩连续空格（见 compressConsecutiveSpaces）。压缩在这里**一次落地**：
 *  段落的 chars 就是绘制端读的那一份，故「量到的宽」与「画出来的宽」不可能分叉。 */
export function wrapScoreLines(
  lines: ExportLineItem[],
  maxAvailableWidth: number,
  ignoreEmptySpace = false
): RenderSegment[] {
  const allSegments: RenderSegment[] = [];

  for (const line of lines) {
    const lineChars = ignoreEmptySpace ? compressConsecutiveSpaces(line.chars) : line.chars;

    if (lineChars.length === 0) {
      allSegments.push({
        lineIdx: line.lineIdx,
        chars: [],
        startChords: line.startChords,
        endChords: line.endChords,
        isContinuation: false,
        isLastSubLine: true,
        contentHeight: computeLineContentHeight([], line.startChords, line.endChords),
        width: getChordsGroupWidth(line.startChords) + getChordsGroupWidth(line.endChords),
      });
      continue;
    }

    const lineSegments: RenderSegment[] = [];
    let curChars: ExportCharItem[] = [];
    let isFirstSubLine = true;

    // 当前段的排版状态：字形游标 + 最后一张和弦图的中心（见 LyricFlow）。首行接在段首和弦组之后，
    // 续行从原点起算（缩进在段落入列时补上，与渲染侧「续行缩进 + 字符推进 + 边和弦」的口径一致），
    // 随字符入段同步推进，因此段落宽度无需在渲染阶段再遍历一遍 chars 重算。
    let flow = beginLyricFlow(line.startChords);
    // 最近一段**入列时**的排版状态（`flow` 入列后即被换成下一条，故此处存的是不再变动的那个对象）。
    // 孤字回借要从它末字处撤回推进量，而段宽是「游标与最后一张图右边缘取大者」，不能直接减。
    let lastSegFlow: LyricFlow | null = null;
    const maxWForFirst = maxAvailableWidth;
    const maxWForContinuation = maxAvailableWidth - LAYOUT.WRAPPED_LINE_INDENT;

    for (let cIdx = 0; cIdx < lineChars.length; cIdx++) {
      const charItem = lineChars[cIdx]!;
      // 本字与**同段前一字**之间的词内折减。判据取「当前段的末字」而不是 lineChars[cIdx - 1]：
      // 折行后本字落在段首（curChars 为空），与前一字已不在同一行，折减自然归零 ——
      // 与绘制端同一口径（绘制端也只按 chars 数组内部的相邻对折减）。
      const prevSameSeg = curChars.length > 0 ? curChars.at(-1) : undefined;
      const charKern = prevSameSeg ? getWordKern(prevSameSeg, charItem) : 0;
      const maxW = isFirstSubLine ? maxWForFirst : maxWForContinuation;

      const isLastChar = cIdx === lineChars.length - 1;
      const endChordsW = isLastChar ? getChordsGroupWidth(line.endChords) : 0;

      // 试排：把本字放进一条**影子流**，按与落列完全相同的算式读出本段会变成多宽。判定必须用
      // 「放进去之后的段右边界」而不是游标 —— 末尾那张图会探出游标半个框宽（见 lyricFlowWidth），
      // 只用游标会让段宽越出可用宽度（实测窄宽 + 密集和弦下超 20px）。影子流与真实流同构，
      // 每字一次小对象，可忽略。
      const shadow: LyricFlow = { x: flow.x, figureCenter: flow.figureCenter };
      placeLyricChar(shadow, charItem, charKern);
      if (endChordsW > 0) reserveBeforeEndChords(shadow);
      const nextWidth = endChordsW > 0 ? shadow.x + endChordsW : lyricFlowWidth(shadow);

      if (curChars.length > 0 && nextWidth > maxW) {
        // 避头尾规则：如果即将排在新行首位的字符是禁止行首标点，且前一段末尾字符无和弦，则向前回借一字
        let nextInitialChars = [charItem];
        let nextFlow = beginLyricFlow();
        placeLyricChar(nextFlow, charItem, 0); // 段首没有前一字，无折减

        if (NO_LINE_START_CHARS.has(charItem.char) && curChars.length > 1) {
          const lastPrev = curChars.at(-1);
          if (lastPrev && !lastPrev.chord) {
            curChars.pop();
            // 回借同时改掉两处相邻关系：本段少了 (…, lastPrev) 这一对，下一段多了 (lastPrev, charItem)
            // 这一对。两段都按新的相邻关系算，不把折减留在已经不相邻的字上。
            // lastPrev 不挂和弦 ⇒ 它既没带来推挤、也没动过 figureCenter，撤回时只需退回推进量。
            const prevOfBorrowed = curChars.length > 0 ? curChars.at(-1) : undefined;
            const borrowedKern = prevOfBorrowed ? getWordKern(prevOfBorrowed, lastPrev) : 0;
            flow.x -= getGlyphAdvanceWidth(lastPrev) - borrowedKern;
            nextInitialChars = [lastPrev, charItem];
            nextFlow = beginLyricFlow();
            placeLyricChar(nextFlow, lastPrev, 0);
            placeLyricChar(nextFlow, charItem, getWordKern(lastPrev, charItem));
          }
        }

        const segStartChords = isFirstSubLine ? line.startChords : undefined;
        lineSegments.push({
          lineIdx: line.lineIdx,
          chars: curChars,
          startChords: segStartChords,
          isContinuation: !isFirstSubLine,
          isLastSubLine: false,
          contentHeight: computeLineContentHeight(curChars, segStartChords, undefined),
          width: lyricFlowWidth(flow) + (isFirstSubLine ? 0 : LAYOUT.WRAPPED_LINE_INDENT),
        });
        lastSegFlow = flow;
        curChars = nextInitialChars;
        flow = nextFlow;
        isFirstSubLine = false;
      } else {
        placeLyricChar(flow, charItem, charKern);
        curChars.push(charItem);
      }
    }

    // 孤字控制：若最后一行仅剩 1 个字符且不是唯的一行，尝试从上一段末尾借一个无和弦字符
    if (curChars.length === 1 && lineSegments.length > 0) {
      const prevSeg = lineSegments.at(-1)!;
      if (prevSeg.chars.length > 2) {
        const lastPrev = prevSeg.chars.at(-1);
        if (lastPrev && !lastPrev.chord && lastSegFlow) {
          prevSeg.chars.pop();
          // 与避头尾回借同理：折减与推进量随字符一起转移，两段都按新的相邻关系重算。
          // lastPrev 不挂和弦 ⇒ 段尾那张图（若有）没动过，段宽按「游标与图右边缘取大者」重算即可。
          const prevOfBorrowed = prevSeg.chars.at(-1);
          const borrowedKern = prevOfBorrowed ? getWordKern(prevOfBorrowed, lastPrev) : 0;
          lastSegFlow.x -= getGlyphAdvanceWidth(lastPrev) - borrowedKern;
          prevSeg.width = lyricFlowWidth(lastSegFlow) + (prevSeg.isContinuation ? LAYOUT.WRAPPED_LINE_INDENT : 0);

          // 本段（续行）也要整体右移一个「借来的字」：从段首重建这条流，把借来的字放回段首
          const firstOfCur = curChars[0]!;
          const rebuilt = beginLyricFlow();
          placeLyricChar(rebuilt, lastPrev, 0);
          placeLyricChar(rebuilt, firstOfCur, getWordKern(lastPrev, firstOfCur));
          flow = rebuilt;
          curChars.unshift(lastPrev);
          prevSeg.contentHeight = computeLineContentHeight(prevSeg.chars, prevSeg.startChords, undefined);
        }
      }
    }

    if (curChars.length > 0) {
      const segStartChords = isFirstSubLine ? line.startChords : undefined;
      const endChordsW = getChordsGroupWidth(line.endChords);
      // 段尾那张图会探出字形游标（见 lyricFlowWidth）：边和弦组是紧接游标画的，先推过它
      if (endChordsW > 0) reserveBeforeEndChords(flow);
      lineSegments.push({
        lineIdx: line.lineIdx,
        chars: curChars,
        startChords: segStartChords,
        endChords: line.endChords,
        isContinuation: !isFirstSubLine,
        isLastSubLine: true,
        contentHeight: computeLineContentHeight(curChars, segStartChords, line.endChords),
        width:
          (endChordsW > 0 ? flow.x + endChordsW : lyricFlowWidth(flow)) +
          (isFirstSubLine ? 0 : LAYOUT.WRAPPED_LINE_INDENT),
      });
    } else if (lineSegments.length > 0) {
      const lastSeg = lineSegments.at(-1)!;
      lastSeg.endChords = line.endChords;
      lastSeg.isLastSubLine = true;
      lastSeg.contentHeight = computeLineContentHeight(lastSeg.chars, lastSeg.startChords, line.endChords);
      lastSeg.width += getChordsGroupWidth(line.endChords);
    }

    if (lineSegments.length > 0) lineSegments.at(-1)!.isLastSubLine = true;

    allSegments.push(...lineSegments);
  }

  return allSegments;
}
