/**
 * 交互指板（SVG）的几何声明 —— 三处指板实现中的「处」之一。
 *
 * 本侧只做两件事：**声明一个 scale**，然后**消费几何产物**。一切尺寸（品高也在内）都是
 * 「基准几何 × scale」的产物，由 `FretboardGeometry` 给出；确需与本侧不同的字段才重载，
 * 每条重载都写明「为什么本侧不同」，不重载即为同比例。
 *
 * **上下留白、左右留白与和弦名字号都不重载** —— 它们就是基准的 `EDGE_PAD` /
 * `FRETBOARD_LEFT_PAD` / `CHORD_NAME_FONT_SIZE` 等比放大。此前本侧自定留白与字号，
 * 等于同一张指板的版式有两个来源：基准一调，本侧那两处不跟，图与屏幕就开始分叉。
 * 底部留白同理不重载（曾有本侧专属的底部留白）—— 纵向链的四段留白全在基准里，各侧只差**内容**高度。
 *
 * ⚠️ 本侧**不声明品高**。品高是产物，不是本侧的输入 —— 此前写成「目标品高 ÷ 基准品高」，
 * 等于让基准表里的那个数反过来决定本侧的 scale：基准一动，本侧的弦距 / 留白 / 字号全跟着动，
 * 而基准表本该只定义「一张指板长什么样」。只留 scale 一个数字后，方向就只剩「基准 → 本侧」。
 *
 * 本侧坐标系原点 = 空弦区顶端（和弦名由外层 DOM 块单独承担，不在 SVG 坐标系内）。
 *
 * 本侧有**两张图**：零品窗口那张画加粗弦枕、偏移窗口那张不画，指板顶相差一条弦枕。两张图
 * 由 `interactiveGeometryFor` 各给一份实例（差异只在那一段占不占位，其余尺寸完全相同）。
 *
 * 【本侧独有的那些量也在这里】音符圆点的描边、外圈高亮环、圆点内的音名与静音叉号
 * —— Canvas 侧的按弦圆点是个纯色实心圆、圆点内不写字，基准几何里没有这些项的对应物，
 * 故它们以**本侧专属字段**的形式登记在本类上（比例相对圆点半径或音名字号表达，
 * 于是随本侧 scale 等比走），SVG 组件只读本类的派生值，自己不再写任何算式。
 */

import { FretboardGeometry } from '@/domains/fretboard/model/fretboardGeometry';

/**
 * 本侧放大倍数 —— **本侧唯一的几何声明**。
 *
 * 取值只由「屏幕上希望指板多大」决定，与基准表的任何数值无关：改基准表的品高不会动它。
 * 屏幕品高 = 基准品高 × 本值。
 */
const INTERACTIVE_SCALE = 7.4;

/**
 * 和弦名行高（无单位）—— 名字区块高度（本类的 `chordNameBlockH`）与 Fretboard.vue 的名字行盒
 * 都从本项派生，故只有这一份声明：改这里，区块高度与行盒一起走。
 */
export const CHORD_NAME_LINE_HEIGHT = 1.15;

/** 音符圆点内音名字号（px）—— 本侧专有：Canvas 侧按弦圆点内不写字 */
const NOTE_FONT_SIZE = 36;

/**
 * 音符圆点描边宽度（px）。
 *
 * 描边不是为了描边本身：按品时描边色与填充色相同、空弦时两者不同（空弦圆点要一圈底色边框），
 * 而描边会向外占掉半个宽度 —— 故填充半径按「圆点半径 − 本值一半」取，**外缘半径因此恒等于圆点半径**，
 * 空弦与按品的圆点体量一致，且两态互切时颜色平滑插值、体量不跳。
 */
const NOTE_STROKE_WIDTH = 2;

/** 外圈高亮环相对圆点外缘的外扩量（px） */
const NOTE_OUTLINE_GAP = 4;

/** 外圈高亮环描边宽度（px） */
const NOTE_OUTLINE_WIDTH = 3;

/** 音名基线相对圆心的下移量 ÷ 音名字号（使字面在圆点内视觉居中） */
const NOTE_LABEL_DY_RATIO = 0.35;

/** 升降号相对音名的水平错位 ÷ 音名字号 */
const NOTE_ACCIDENTAL_DX_RATIO = 0.03;

/** 升降号相对音名的上移量 ÷ 音名字号（正值向上） */
const NOTE_ACCIDENTAL_RAISE_RATIO = 0.3;

/** 升降号字号 ÷ 音名字号 */
const NOTE_ACCIDENTAL_SCALE = 0.6;

/** 圆点内静音叉号半边长 ÷ 音名字号 */
const NOTE_MUTE_CROSS_RATIO = 0.28;

/** 圆点内静音叉号描边宽度（px） */
const NOTE_MUTE_STROKE_WIDTH = 3;

/**
 * 横按梁描边宽度（px）—— 梁的**体量**由几何给出（位置 / 跨度 / 厚度 / 圆角半径），
 * 本项只是压在梁缘上那一圈线的粗细：已标记的横按是实心梁配实线缘，推导出的候选是淡色梁配虚线缘，
 * 两者靠虚实区分。Canvas 侧只填不描边（那边没有「候选」这一态），故它是本侧专属量。
 */
const BARRE_STROKE_WIDTH = 1.5;

/**
 * 交互指板几何。
 *
 * 除下方四条纵向重载外，本类还登记**本侧独有的记号尺寸**（圆点描边 / 高亮环 / 圆点内音名与
 * 静音叉号）。它们是派生量而不是散在组件里的字面量：组件只读 getter，比例一改全侧生效。
 */
export class InteractiveFretboardGeometry extends FretboardGeometry {
  constructor(boldNut: boolean) {
    super(INTERACTIVE_SCALE, boldNut);
  }

  /**
   * 重载：和弦名区块高度 = 本侧**行盒** + **顶部留白一份**（= 上下留白 × scale）。
   *
   * **字号不重载** —— 它就是基准的 `CHORD_NAME_FONT_SIZE` × scale（消费方读
   * `INTERACTIVE_GEOMETRY.chordNameFontSize`，见 Fretboard.vue）。本侧重载的只有**块高**：
   * 基准的名字内容高度贴着基准字号（= 字号本身），而本侧名字是外层 DOM 块、行盒由 CSS 行高
   * （`CHORD_NAME_LINE_HEIGHT`）撑开，与基准的字面高不是同一个口径 —— 直接取「块高 × 倍数」
   * 会把行盒与字面高的差额一并算进去，名字被居中悬在中间、与空弦音符之间凭空多出一段空白
   * （表现为「和弦名离空弦太远」）。
   *
   * 正确口径：**内容**（行盒）取本侧自己的，**留白**取基准的上下留白等比（`edgePad`）——
   * 名字上方那段留白于是与基准一致，且**与名字字号无关**：字号怎么改，留白都不动。
   * 名字下方**不留**内边距：与空弦区之间那段空白由空弦区的上 padding 承担，只留一份。
   * 该留白由 Fretboard.vue 的名字区以 padding-top 落地。
   */
  override get chordNameBlockH(): number {
    return this.chordNameFontSize * CHORD_NAME_LINE_HEIGHT + this.edgePad;
  }

  /**
   * 重载：空弦区域的**内容高度** = 本侧音符圆点直径。
   *
   * 本侧空弦位装的是半径 `dotRadius` 的音符圆点（还要容下音名字），基准的空弦圆圈体量远小于它 ——
   * 两者本就不同。重载这一项（而不是整块高度）后，上下 padding 仍是基准的那份常量，
   * 故「空弦区高度 = 上下 padding + 内容」三处共用，本侧与画布侧的几何区别
   * **只剩这一个数**：圆点比基准圆圈高，空弦区因此更厚，指板被推得更低。
   */
  override get markerAreaH(): number {
    return this.dotRadius * 2;
  }

  /** 重载：名字区由外层 DOM 块承担，不在本侧坐标系内 */
  protected override get markerRowTop(): number {
    return 0;
  }

  /**
   * 重载：网格顶的固定修正 —— 让**指板顶的墨迹**落在「空弦区底 + 空弦区下 padding」那条线上。
   *
   * 修正的是**画法**（线宽带来的平移），不是骨架长度，故重载这一项而不是重算 gridTop ——
   * 骨架的逐项扣减（隐藏名字 / 空弦时各减多少、弦枕占不占位）于是三处共用同一份。
   *
   * 两张图「指板顶的墨迹」不是同一样东西，修正量因此反向：
   * - **画弦枕那张**：墨迹是弦枕条，它被画成「底缘压住零品线下沿」（见组件的枕条样式），
   *   即整体下移了半线宽 —— 网格顶要上移半线宽，弦枕的上沿才落在骨架上；
   * - **不画弦枕那张**：墨迹就是零品线本身，线自网格顶上下各外扩半线宽 ——
   *   网格顶要下移半线宽，线的上沿才落在骨架上。
   *
   * 不这么分，两张图的「标记 → 指板」留白会差整整一条线宽，与上方的同值留白对不上。
   */
  protected override get gridTopShift(): number {
    return (this.boldNut ? -1 : 1) * (this.lineWidth / 2);
  }

  /**
   * 重载：枕条纵向补回 `gridTopShift` 的修正量（即把基准算式给出的位置整体下移 `-gridTopShift`）。
   *
   * 本侧网格顶已按「枕条底缘压住零品线下沿」平移了半线宽（见上），基准算式给出的枕条位置
   * 因此会整条浮离骨架；补回后枕条才落回骨架（其上沿即骨架给出的指板顶）。
   * 横向不改：枕条盖住整条线宽的口径两侧一致。
   */
  override nutBarRect(stringCount: number, startStrX: number): { x: number; y: number; width: number; height: number } {
    const rect = super.nutBarRect(stringCount, startStrX);
    return { ...rect, y: rect.y - this.gridTopShift };
  }

  // ==================== 本侧独有的记号尺寸 ====================

  /** 音符圆点填充半径（外缘半径恒为 `dotRadius`，见 NOTE_STROKE_WIDTH） */
  get noteFillRadius(): number {
    return this.dotRadius - NOTE_STROKE_WIDTH / 2;
  }

  /** 音符圆点描边宽度 */
  get noteStrokeWidth(): number {
    return NOTE_STROKE_WIDTH;
  }

  /** 外圈高亮环半径（与空品位预览环共用同一体量） */
  get noteOutlineRadius(): number {
    return this.dotRadius + NOTE_OUTLINE_GAP;
  }

  /** 外圈高亮环描边宽度 */
  get noteOutlineWidth(): number {
    return NOTE_OUTLINE_WIDTH;
  }

  /** 圆点内音名字号 */
  get noteFontSize(): number {
    return NOTE_FONT_SIZE;
  }

  /** 圆点内升降号字号 */
  get noteAccidentalFontSize(): number {
    return NOTE_FONT_SIZE * NOTE_ACCIDENTAL_SCALE;
  }

  /** 音名基线相对圆心的下移量 */
  get noteLabelDy(): number {
    return NOTE_FONT_SIZE * NOTE_LABEL_DY_RATIO;
  }

  /** 升降号相对音名的水平错位 */
  get noteAccidentalDx(): number {
    return NOTE_FONT_SIZE * NOTE_ACCIDENTAL_DX_RATIO;
  }

  /** 升降号相对音名的上移量（负值向上） */
  get noteAccidentalDy(): number {
    return -NOTE_FONT_SIZE * NOTE_ACCIDENTAL_RAISE_RATIO;
  }

  /** 圆点内静音叉号半边长 */
  get noteMuteCrossHalf(): number {
    return NOTE_FONT_SIZE * NOTE_MUTE_CROSS_RATIO;
  }

  /** 圆点内静音叉号描边宽度 */
  get noteMuteStrokeWidth(): number {
    return NOTE_MUTE_STROKE_WIDTH;
  }

  /** 横按梁描边宽度 */
  get barreStrokeWidth(): number {
    return BARRE_STROKE_WIDTH;
  }
}

/** 本侧「画加粗弦枕」那张图的几何（零品窗口） */
const NUT_GEOMETRY = new InteractiveFretboardGeometry(true);

/** 本侧「不画加粗弦枕」那张图的几何（偏移品窗） */
const NO_NUT_GEOMETRY = new InteractiveFretboardGeometry(false);

/**
 * 交互指板几何单例（= 画弦枕那张图）：SVG 侧所有**与弦枕无关**的消费方（弦距、圆点、
 * 留白、字号、记号尺寸）共用同一份，于是「改一处」即全侧生效。
 */
export const INTERACTIVE_GEOMETRY: InteractiveFretboardGeometry = NUT_GEOMETRY;

/**
 * 按「本张图是否画加粗弦枕」取本侧几何实例 —— 纵向定位的消费方一律走这里。
 *
 * 弦枕是**每张图**的属性：同一个和弦换个品位窗口，弦枕就从画到不画（判据见
 * `fretGeometry.isZeroFretWindow`），指板顶随之上下移一条弦枕。故纵向量（网格顶、品丝线、
 * 板身高度、横按梁、空弦标记以下的一切）必须按**当前这张图**取实例，不能读单例。
 *
 * 两态各一份单例（而非按需 new）：几何是纯派生量，实例无状态，多造只是浪费。
 */
export const interactiveGeometryFor = (boldNut: boolean): InteractiveFretboardGeometry =>
  boldNut ? NUT_GEOMETRY : NO_NUT_GEOMETRY;
