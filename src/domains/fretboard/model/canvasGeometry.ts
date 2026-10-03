/**
 * 离屏指板图（屏幕缩略图 / 导出 PNG）的几何声明 —— 三处指板实现中的「处」之一。
 *
 * 与另两处的分工：本侧 **scale = 1**（底层几何数据 `FRETBOARD_CANVAS_CONFIG` 就是照它定的），
 * 交互指板（`interactiveGeometry.ts`，7.4×）与乐谱导出（`scoreExportLayout.ts`，随和弦缩放）
 * 都是它的等比放大。故本类**不重载任何随 scale 走的量**，只重载「图内文字」这一组。
 *
 * 重载的**一组**（**口径与导出侧同一套，倍数各自调** —— 本侧名字 1.125 倍、导出侧 1.5 倍，
 * 两侧都走「只改字号、名字位置与名字区高度不动、降部由空弦区上 padding 让出」）：
 * 和弦名字号放大一档，升降号两项随正名等比派生。
 *
 * 降部让位**不在本侧重载**：它按「基准比值 × 本侧名字字号」由工厂派生
 * （`chordNameDescentAllowance`），本侧把字号调大后让位量自动跟着变。此前本侧自带一份
 * `CANVAS_CHORD_NAME_DESCENT_RATIO` 与一段 `markerPadTop` 重载，导出侧也各抄了一份 ——
 * 三处同值却各自维护，改一处漏两处不会有任何编译期或测试上的提示；现在比值只登记在
 * `fretboard/constants.ts` 一份。
 *
 * ⚠️ 品号（字号 + 左偏移）**刻意不跟导出侧**：导出侧那份放大靠的是它栅格外面另垫的一圈 `padX`
 * （= leftPad，左右各一份），本侧画布没有那一圈 —— 品号右对齐在「首弦 − 偏移」处，左边能用的
 * 只有基准的左留白 14px。实测（Chromium，`bold Npx system-ui`）：基准 8px 的两位数宽 9.87，
 * 配 offset 4 时锚点距左缘 10，余量只剩 0.13px（已是极限）；放到导出侧的 12px / offset 6 需要
 * 14.80px，可用只剩 8px，**两位数会被裁掉 6.8px**（fretOffset ≥ 6 时必然出现两位数）。
 * 要给品号腾地方就得加宽画布左留白，而画布宽度是消费方的布局锚点（picker 三列的内容宽只剩
 * 7px 余量、谱面槽位按等宽几何对齐），不能为几个数字改宽 —— 故本侧品号维持基准口径。
 *
 * ⚠️ 重载的**倍数与导出侧各调各的**（`scoreExportLayout.ts` 的 `EXPORT_*` 是导出侧那份）：
 * 两侧分属 fretboard 与 score 两个域，而 zone 规则禁止 fretboard 反向依赖 score
 * （见 `eslint.config.mjs` 的 zone ④），不能由一侧 import 另一侧。改的是**口径**（比值 / 降部
 * 让位 / 不动名字位置）才需要两侧同步；纯倍数各侧自定。放大倍数有上限（约 1.55 倍）：名字的
 * 1em 外框要收在名字区内（`chordNameBlockH` = 顶部留白 + 基准字号 = 19.8），再大画布就要向上
 * 扩张、压进上一行。
 */
import { FretboardGeometry } from '@/domains/fretboard/model/fretboardGeometry';

/** 和弦名字号相对**基准和弦名字号**的倍数（当前基准 12.8 → 14.4，即 1.125 倍；导出侧是 1.5 倍） */
const CANVAS_CHORD_NAME_FONT_RATIO = 1.125;

/** 升降号上标字号 ÷ 正名字号 */
const CANVAS_ACCIDENTAL_FONT_RATIO = 0.6875;

/** 升降号上标相对正名基线的抬升量 ÷ 正名字号（正值向上） */
const CANVAS_ACCIDENTAL_RAISE_RATIO = 0.3125;

/**
 * 离屏指板图的几何。
 *
 * 本侧只重载**和弦名字号**一项（理由见上方常量）；除它之外**一律派生自基准**（上下留白、
 * 左右留白、品高、弦距、圆点体量、品号口径都不重载）—— 留白是常量，不由某一侧的内容决定；
 * 与名字字号挂钩的降部让位量由基准按本侧字号派生，故也不是本侧的第二个重载点。
 */
export class CanvasFretboardGeometry extends FretboardGeometry {
  /**
   * 重载：和弦名字号（基准 × 本侧倍数）。
   *
   * 只改字号 —— **名字的位置与名字区高度都不动**（基线与 `chordNameBlockH` 仍走基准）：字变大后
   * 向上吃掉一点名字区的顶部留白（7 → 5.7，仍为正），向下则由基准派生的降部让位量把降部那一截
   * 补给空弦区（见类头的说明：让位量随本侧字号走，本侧不必也不该自己重载它）。
   * 名字的定位口径全项目只有基准那一套，本侧不另立一套。
   */
  override get chordNameFontSize(): number {
    return super.chordNameFontSize * CANVAS_CHORD_NAME_FONT_RATIO;
  }

  /** 重载：升降号上标字号（= 正名字号 × 本侧比，随正名等比） */
  override get accidentalFontSize(): number {
    return this.chordNameFontSize * CANVAS_ACCIDENTAL_FONT_RATIO;
  }

  /** 重载：升降号上标垂直偏移（见上方常量注释：同值也要重载） */
  override get accidentalSuperscriptOffset(): number {
    return -this.chordNameFontSize * CANVAS_ACCIDENTAL_RAISE_RATIO;
  }
}

/** 本侧「画加粗弦枕」那张图的几何（零品窗口） */
const CANVAS_GEOMETRY = new CanvasFretboardGeometry(1, true);

/** 本侧「不画加粗弦枕」那张图的几何（偏移品窗） */
const CANVAS_GEOMETRY_NO_NUT = new CanvasFretboardGeometry(1, false);

/**
 * 按「本张图是否画加粗弦枕」取本侧几何实例 —— 纵向定位的消费方一律走这里。
 *
 * 弦枕是**每张图**的属性：同一个和弦换个品位窗口，弦枕就从画到不画（判据见
 * `fretGeometry.isZeroFretWindow`），指板顶随之上下移一条弦枕。故纵向量（网格顶、品丝线、
 * 板身高度、空弦标记以下的一切）必须按**当前这张图**取实例，不能读单例。
 *
 * 两态各一份单例（而非按需 new）：几何是纯派生量，实例无状态，多造只是浪费。
 */
export const canvasGeometryFor = (boldNut: boolean): CanvasFretboardGeometry =>
  boldNut ? CANVAS_GEOMETRY : CANVAS_GEOMETRY_NO_NUT;

/**
 * 本侧几何单例（= 画弦枕那张图）：**与弦枕无关**的消费方（弦距、圆点、留白、字号、尺寸推算）
 * 共用同一份，于是「改一处」即全侧生效。
 */
export const CANVAS_FRETBOARD_GEOMETRY: CanvasFretboardGeometry = CANVAS_GEOMETRY;
