/**
 * 指板几何工厂：三处指板实现（交互指板 SVG / 离屏缩略图 Canvas / 乐谱导出 Worker）的
 * **唯一**几何装配点。
 *
 * 三层结构：
 * 1. **底层数据只有一份** —— `FRETBOARD_CANVAS_CONFIG`（constants.ts），以基准品高为 1 倍基准；
 * 2. **放大缩小只做派生** —— `scale` 是构造入参，本类里每一个尺寸都是「基准值 × scale」，
 *    换算口只有 `scaled()` 一个，不另开算式；
 * 3. **三处各自声明** —— 各处只声明自己的 `scale`、自己的**图**（是否画加粗弦枕，见 `boldNut`），
 *    以及**确实不同**的字段（子类 override 属性）：
 *    例如交互指板的空弦位装的是音符圆点而不是基准的小标记，它就把 `markerAreaH`（空弦区域的
 *    **内容**高度）重载掉。四段留白与左右留白一律不重载 —— 留白是常量，不由内容决定。
 *
 * 为什么收敛成类：几何是一组**同源**的量（改品高必须同步改弦距、留白、圆点、字号……），
 * 散落声明时「改一处忘另一处」类型系统发现不了 —— 此前同一张指板在屏幕与导出图里
 * 粗细、大小不一致，就是这么来的。收敛之后，各处只剩「声明差异」这一件事。
 *
 * 坐标算式不在此重复实现：一律转发 `model/fretGeometry` 的共享内核（主线程与导出 Worker 同源）。
 */

import { FRETBOARD_CANVAS_CONFIG as BASE } from '@/domains/fretboard/constants';
import { barreBeamRectOf, fretCenterYOf, fretLineYOf, gridBottomYOf } from '@/domains/fretboard/model/fretGeometry';
import { createLruCache } from '@/platform/utils/cache';

export class FretboardGeometry {
  /** 放大倍数：1 = 基准（离屏指板图，即基准表本身） */
  readonly scale: number;

  /**
   * 本侧这张图里，弦枕是否**真的画出来**（= 显示加粗弦枕 且 零品窗口）。
   *
   * 它决定弦枕那一段**是否占位**：不画却占位，空弦标记下方就会多出一段谁也解释不了的空白 ——
   * 表现为「上下 padding 明明同值，上边距看起来却比下边距少」（差额恰好是一条弦枕）。
   *
   * 它是**每张图**的属性，不是某一侧的版式决策：同一个和弦换个品位窗口就变（零品窗口才有弦枕）。
   * 故它是构造入参、各侧按自己那张图的窗口取实例（见 interactiveGeometry 的
   * `interactiveGeometryFor` / fretboardGeometry 的 `baseGeometryFor`），而不是某一侧能自定的字段。
   */
  protected readonly boldNut: boolean;

  /**
   * 虚拟占位尺寸缓存（容量 8），见 `sizeOf`。
   *
   * **每实例私有**，不共用一份模块级缓存：三处指板各自的 scale 与重载都不同，
   * 共用就得把「本侧全部差异项」塞进键里，漏一项即静默串号（基准与导出侧在 100% 缩放时
   * scale 同为 1，而底部留白当时一个侧一个值 —— 正是这种漏项会踩的坑）。
   * 实例私有后键只需（显隐开关 × 弦数 × 品数）。
   *
   * 刻意不给 `name`：导出侧每条渲染消息都会重建实例（见 applyLayoutScales），
   * 带 name 的缓存会向开发面板逐条登记、只增不减。本缓存是纯数值、生命周期与实例一致。
   */
  private readonly sizeCache = createLruCache<{ width: number; height: number }>(8);

  constructor(scale = 1, boldNut = true) {
    this.scale = scale;
    this.boldNut = boldNut;
  }

  /** 基准值 → 本侧值：本类**唯一**的换算口，任何尺寸都经它 */
  protected scaled(baseValue: number): number {
    return baseValue * this.scale;
  }

  // ==================== 横向 ====================

  /** 相邻弦间距 */
  get stringSpacing(): number {
    return this.scaled(BASE.STRING_SPACING);
  }

  /** 左侧留白（容纳品号与边框）：横向留白的那一份 */
  get leftPad(): number {
    return this.scaled(BASE.FRETBOARD_LEFT_PAD);
  }

  /** 右侧留白（基准左右同值，故左右对称） */
  get rightPad(): number {
    return this.scaled(BASE.FRETBOARD_LEFT_PAD);
  }

  /** 第一根弦（索引 0）的 x */
  get firstStringX(): number {
    return this.leftPad;
  }

  /**
   * 弦区跨度（首弦到末弦的距离）= (N − 1) 段弦距。
   *
   * 与 `boardWidth` 的差别只在单弦：跨度是纯几何量（1 弦无跨度 = 0），而板身不能没有宽度，
   * 故 `boardWidth` 对它取了下限（见该处）。画布侧算「弦区右端 / 水平中心」用本式；
   * 绘制内核（fretboardDrawCore）不持有几何实例（只吃注入的原点与弦距），仍就地按同式算。
   */
  stringsSpan(stringCount: number): number {
    return (stringCount - 1) * this.stringSpacing;
  }

  /** 本侧指板总宽 = 左留白 + 弦区跨度 + 右留白（单弦仍按 1 段弦距计：板身不能没有宽度） */
  boardWidth(stringCount: number): number {
    return this.leftPad + Math.max(this.stringSpacing, this.stringsSpan(stringCount)) + this.rightPad;
  }

  // ==================== 纵向骨架 ====================

  /** 品格高度：本侧的纵向基准单位 */
  get fretHeight(): number {
    return this.scaled(BASE.FRET_HEIGHT);
  }

  /** 弦枕（零品加粗带）高度 */
  get nutHeight(): number {
    return this.scaled(BASE.NUT_HEIGHT);
  }

  /**
   * 和弦名区块高度：为名字预留的高度 = **顶部留白 + 名字内容**（纵向链的一段）。
   *
   * 名字**下方不留内边距** —— 与空弦区之间那段空白由空弦区的上 padding（`markerPad`）
   * 承担，只留一份，不叠两个说不清归属的合成量。故本值与基线（`chordNameBaselineY`）同值。
   */
  get chordNameBlockH(): number {
    return this.scaled(BASE.CHORD_NAME_BLOCK_H);
  }

  /** 和弦名基线 y（自名字内容顶端起算 = 顶部留白 + 字号） */
  get chordNameBaselineY(): number {
    return this.scaled(BASE.CHORD_NAME_BASELINE_Y);
  }

  /** 空弦区**上下** padding（px，上下同值）：名字内容底 → 空弦区顶、空弦区底 → 指板顶（基准常量，各侧不重载） */
  get markerPad(): number {
    return this.scaled(BASE.MARKER_PAD);
  }

  /**
   * 空弦区域的**内容高度**（px）—— 纵向链里各侧唯一可变的一段，**本侧装什么标记就多高**。
   *
   * 基准取空弦圆圈直径；装体量不同的标记的实现重载它（交互指板的空弦位是音符圆点，
   * 见 interactiveGeometry）。**上下 padding 不随内容重分** —— 它们取自基准、各侧同值，
   * 于是「空弦区高度 = 上 padding + 内容 + 下 padding」三处共用，各侧的差异只剩这一个数。
   *
   * 此前是各侧重载**整块高度**、留白由「块高 − 标记直径」反推：标记体量一换，留白跟着漂，
   * 于是「空弦区该多厚」这件事有了两个来源（基准的块高、本侧的标记直径）。
   */
  get markerAreaH(): number {
    return this.scaled(BASE.MARKER_AREA_H);
  }

  /** 空弦区高度 = 上 padding + 内容 + 下 padding（纵向链的一段；内容体量只影响它自己） */
  get markerBlockH(): number {
    return this.markerPad * 2 + this.markerAreaH;
  }

  /**
   * 空弦区顶端（相对本侧坐标系原点）—— 即空弦区**上 padding** 的起点。
   *
   * 名字区在本侧坐标系内的实现（离屏图 / 导出图）自名字区之后起算（= 名字内容底端，
   * 名字下方无内边距）；名字区由外层 DOM 单独承担的实现（交互指板）重载为 0。
   */
  protected get markerRowTop(): number {
    return this.chordNameBlockH;
  }

  /**
   * 空弦/静音标记中心 y —— 在**空弦区自己那一段**里居中（上 padding + 内容一半）。
   *
   * 空弦区之外的内容一概不计入：**弦枕不参与本项**。它虽在空弦区下方，但只在零品窗口才画出来
   * （见 boldNut）—— 把它算进居中范围，标记就会被拉离空弦区中心，拉多少还随品位窗口变。
   * 标记的位置只由空弦区自己的三段决定，与下面画不画弦枕无关。
   *
   * 于是「标记到名字内容底」与「标记到指板顶」两段留白恰好都是空弦区的 padding —— 上下同值。
   */
  get markerCenterY(): number {
    return this.topOfRow(true) + this.markerCenterWithinRow;
  }

  /** 空弦标记中心相对**空弦区顶端**的偏移 = 上 padding + 内容一半（本侧空弦区之内的量，与弦枕无关） */
  protected get markerCenterWithinRow(): number {
    return this.markerPad + this.markerAreaH / 2;
  }

  /**
   * 网格顶部 y = 指板顶 + 弦枕（弦枕真画时才有这一段，见 `boldNut`）。
   *
   * 弦枕属**指板自己那一段**：它是指板的顶边，把网格往下推一个自己的高度；
   * 不画弦枕的那张图里指板顶就是网格顶，那一段不占位 —— 否则空弦标记下方会多出一段
   * 谁也解释不了的空白（正是「上下 padding 同值、观感却不对称」的来源）。
   */
  get gridTop(): number {
    return this.skeletonGridTop(true, true);
  }

  /**
   * 骨架里「名字区之后」的起点：预留名字位时自名字区之后起算（名字区在本侧坐标系内的实现），
   * 否则自 `edgePad` 起算 —— 不留名字位时顶部留白仍取上下留白（`edgePad`），与底部同值、图上下对称。
   */
  private topOfRow(reserveName: boolean): number {
    return reserveName ? this.markerRowTop : this.edgePad;
  }

  /**
   * 网格顶 y（骨架逐项累加）：按「是否预留名字位 / 是否画空弦标记」算，**隐藏的元素不占位**，
   * 画布随之收紧 —— 「改显隐 = 改几何」就是这一层。
   *
   * 上方一件都不留时去掉空弦区那一段、顶部留白仍取 `edgePad`（与底部同值）。
   * 弦枕那一段只看实例自己的 `boldNut`（= 本图是否真画出加粗弦枕），不看品窗偏移：
   * 「画了才占位」这条口径由构造入参承担，算式里不再有第二个判据。
   */
  private skeletonGridTop(reserveName: boolean, showOpenStrings: boolean): number {
    let top = this.topOfRow(reserveName);
    if (showOpenStrings) top += this.markerBlockH;
    top = Math.max(top, this.edgePad);
    return top + (this.boldNut ? this.nutHeight : 0) + this.gridTopShift;
  }

  /**
   * 网格顶相对「本侧骨架」的固定修正（px，默认 0）。
   *
   * 骨架长度由 `skeletonGridTop` 给出；本项只承载**画法**上的平移，不参与骨架的逐项扣减 ——
   * 交互指板用它把网格顶压掉品丝线半宽（弦枕底缘压在零品线下沿），那是画法差异、不是板变短了。
   * 单独成一个可重载项，隐藏元素时的扣减算式就不必知道它。
   */
  protected get gridTopShift(): number {
    return 0;
  }

  /**
   * 纵向骨架：按显隐状态给出各层的 y（隐藏的元素不占位）。
   *
   * **单一来源** —— 画布侧 `computeFretboardLayout`（要各层 y）与虚拟占位 `sizeOf`（只要网格顶）
   * 都从这里取，不再各自算一遍。注意「预留名字位」与「画不画那几个字」是两件事：
   * 前者进几何（本方法的 reserveName），后者只属名字层。
   */
  topSkeleton(opts: { reserveName: boolean; showOpenStrings?: boolean }): {
    chordNameBaselineY: number;
    markerCenterY: number;
    gridTop: number;
  } {
    const { reserveName, showOpenStrings = true } = opts;
    const rowTop = this.topOfRow(reserveName);
    return {
      // 基线自**名字区顶端**起算（见 chordNameBaselineY 的声明口径），不是自空弦行顶端 ——
      // 名字区在本侧坐标系内的实现（基准 / 导出）其顶端即原点，故预留名字位时就是本值；
      // 名字区由外层 DOM 承担的实现（交互侧）名字区在坐标系之外，本项不被消费。
      chordNameBaselineY: reserveName ? this.chordNameBaselineY : 0,
      markerCenterY: showOpenStrings ? rowTop + this.markerCenterWithinRow : 0,
      gridTop: this.skeletonGridTop(reserveName, showOpenStrings),
    };
  }

  /** 隐藏品号时的最小水平留白（px）：可收窄但须容得下大横按端头与按弦圆点，故有下限 */
  get minLeftPad(): number {
    return this.scaled(BASE.MIN_LEFT_PAD);
  }

  /**
   * 板身底部留白（px）：网格底线到底缘的距离 —— 纵向链的**底部留白**那一段。
   *
   * 取上下留白（`edgePad`）：与顶部留白同值，图上下对称。**三处指板都不重载本项** ——
   * 此前交互侧自带一段、导出侧为 0（由行间距承担），等于同一张图的底边留白有三个来源；
   * 收进基准后「板身高度 = 网格底 + 底部留白」这条算式三处共用，且留白与内容无关。
   */
  get boardBottomPad(): number {
    return this.edgePad;
  }

  /**
   * 板身高度（本侧逻辑 px）= 网格底 + 底部留白。
   *
   * 「网格底」自本侧 `gridTop` 起算，故**名字区是否已含在内随本侧坐标系而定**：
   * 名字区在本侧坐标系内的实现（离屏图 / 导出图）已含，交互侧（名字由外层 DOM 承担）不含、另行相加。
   */
  boardBoxHeight(fretCount: number): number {
    return this.gridBottomY(fretCount) + this.boardBottomPad;
  }

  /**
   * 「板之上」留白（px）= 名字区 + 网格顶 —— 指板块为上方内容让出的总高度。
   *
   * 名字区在本侧坐标系内的实现（离屏图 / 导出图）即「名字区块 + 网格顶」；
   * 名字区由外层 DOM 单独承担的实现（交互指板）名字区在坐标系之外，但承载它的容器仍要按
   * 本值为名字让位（见 useFretboardLayout 的 contentTopOffset）—— 故本项三处共用同一算式。
   */
  get blockAboveBoard(): number {
    return this.chordNameBlockH + this.gridTop;
  }

  /**
   * 指板图**上下**留白（px）—— 纵向链的顶部留白与底部留白两段读的都是本项（左右留白另见 `leftPad`）。
   *
   * 它同时是**图外**留白的基准：承载指板图的容器按本值追加外侧留白（工作台画布消费），
   * 容器于是读作「放大后的那张指板图」，而不是「图 + 另配一圈与几何无关的边距」。
   * 容器侧只做这一件事，且**不随品数/视口变** —— 需要整体缩小时对整卡施加 CSS scale，
   * 而不是回来改这里的派生值（改了就成第二份版式口径）。
   */
  get edgePad(): number {
    return this.scaled(BASE.EDGE_PAD);
  }

  /**
   * 指板图尺寸（本侧逻辑 px）：按显隐状态与弦数 / 品数给出 —— 三处指板**唯一**的尺寸算式。
   *
   * 高度 = 骨架（`skeletonGridTop`，隐藏的元素不占位）+ 品数 × 品高 + 底部留白（`boardBottomPad`）。
   * 宽度 = `boardWidth(stringCount)`；隐藏品号时左侧留白收窄到 `minLeftPad`，故宽度也随该开关变。
   *
   * 「预留名字位」与「画不画名字」是两件事：前者进几何（reserveChordName），后者只属名字层。
   * 画布侧传的是 `reserveChordName = showChordName || reserveChordName`（见 FretboardCanvas），
   * 故本项缺省跟随 showChordName。
   *
   * 主要用途是**虚拟占位**：没挂载的行也必须知道确切尺寸，否则滚动条、行位置与列对齐都会跳；
   * 占位尺寸必须与实绘逐像素一致，故这里给的是算式结果、不是估值。
   *
   * 结果按（显隐开关 × 弦数 × 品数）缓存于本实例（容量 8）—— 一次滚动只会问到窗口附近的少数组合，
   * 超出即淘汰最旧的一条（LRU，见 platform/utils/cache）。返回值是缓存内的**只读快照**
   * （调用方不要就地改写）。
   *
   * 弦枕那一段不在这里开开关：它由**实例**的 `boldNut` 决定（同一张图的弦枕要么画要么不画），
   * 故键里也没有它 —— 两种图各是各的实例，各持一份缓存。
   */
  sizeOf(opts: {
    showChordName?: boolean;
    reserveChordName?: boolean;
    showOpenStrings?: boolean;
    showFretNumbers?: boolean;
    stringCount: number;
    fretCount: number;
  }): { width: number; height: number } {
    const showChordName = opts.showChordName ?? true;
    const reserveName = opts.reserveChordName ?? showChordName;
    const showOpenStrings = opts.showOpenStrings ?? true;
    const showFretNumbers = opts.showFretNumbers ?? true;
    const key = [
      reserveName ? 1 : 0,
      showChordName ? 1 : 0,
      showOpenStrings ? 1 : 0,
      showFretNumbers ? 1 : 0,
      `${opts.stringCount}x${opts.fretCount}`,
    ].join('|');
    const cached = this.sizeCache.get(key);
    if (cached !== undefined) return cached;

    const size = {
      width: showFretNumbers
        ? this.boardWidth(opts.stringCount)
        : this.minLeftPad * 2 + Math.max(this.stringSpacing, this.stringsSpan(opts.stringCount)),
      height:
        this.skeletonGridTop(reserveName, showOpenStrings) + opts.fretCount * this.fretHeight + this.boardBottomPad,
    };
    this.sizeCache.set(key, size);
    return size;
  }

  // ==================== 记号尺寸 ====================

  /** 按弦圆点半径 */
  get dotRadius(): number {
    return this.scaled(BASE.DOT_RADIUS);
  }

  /** 空弦圆圈半径 */
  get openCircleRadius(): number {
    return this.scaled(BASE.OPEN_CIRCLE_RADIUS);
  }

  /** 静音叉号半径 */
  get muteCrossRadius(): number {
    return this.scaled(BASE.MUTE_CROSS_RADIUS);
  }

  /** 大横按梁厚度 */
  get barreThickness(): number {
    return this.scaled(BASE.BARRE_THICKNESS);
  }

  /**
   * 指板网格线宽（琴弦竖线、品丝横线，以及弦枕枕条的横向外扩量）。
   *
   * 它是**几何量**：三处指板各按自己的 scale 从同一个基准线宽派生，故交互侧画出来
   * 就是基准的若干倍粗 —— 与画布侧「等比放大后同一张图」的前提。任何一处自己写死一个线宽，
   * 那一处的网格就会与另外两处对不上粗细。
   */
  get lineWidth(): number {
    return this.scaled(BASE.LINE_WIDTH);
  }

  /** 品号文字自首弦向左的 x 偏移 */
  get fretNumberXOffset(): number {
    return this.scaled(BASE.FRET_NUMBER_X_OFFSET);
  }

  // ==================== 字号 ====================

  /** 和弦名字号 */
  get chordNameFontSize(): number {
    return this.scaled(BASE.CHORD_NAME_FONT_SIZE);
  }

  /** 和弦名升降号上标字号 */
  get accidentalFontSize(): number {
    return this.scaled(BASE.ACCIDENTAL_FONT_SIZE);
  }

  /** 升降号上标垂直偏移（Canvas 坐标系向下为正，上标为负） */
  get accidentalSuperscriptOffset(): number {
    return this.scaled(BASE.ACCIDENTAL_SUPERSCRIPT_OFFSET);
  }

  /** 品号字号 */
  get capoTextFontSize(): number {
    return this.scaled(BASE.CAPO_TEXT_FONT_SIZE);
  }

  /**
   * 和弦名文字实际占用的上边界 y（相对本侧坐标系原点；名字区块已含这段高度，故通常为正）：
   * 「正名基线 − 正名字号」与「上标基线 − 上标字号」取更靠上者。
   *
   * 导出侧按它算位图顶部留白 —— 名字越出位图边界的部分会被硬裁（canvas 画不出自身位图之外的像素）。
   * 画布侧不消费本项：它的画布顶部自 0 起算，名字区块已含这段高度。
   */
  get chordNameTopY(): number {
    return Math.min(
      this.chordNameBaselineY - this.chordNameFontSize,
      this.chordNameBaselineY + this.accidentalSuperscriptOffset - this.accidentalFontSize
    );
  }

  // ==================== 坐标算式（转发共享内核 model/fretGeometry） ====================

  /** 品格中心 y（fret 自 1 起；0 品与静音由调用方按自己的空弦行定位） */
  fretCenterY(fret: number): number {
    return fretCenterYOf(fret, this.gridTop, this.fretHeight);
  }

  /** 品丝线 y（index 0 = 顶端零品线） */
  fretLineY(index: number): number {
    return fretLineYOf(index, this.gridTop, this.fretHeight);
  }

  /** 网格纵向底端 y（末品丝线） */
  gridBottomY(fretCount: number): number {
    return gridBottomYOf(fretCount, this.gridTop, this.fretHeight);
  }

  /** 横按梁矩形（厚度与网格顶按本侧代入） */
  barreRect(
    fret: number,
    span: { fromX: number; toX: number }
  ): { x: number; y: number; width: number; height: number } {
    return barreBeamRectOf(fret, span, this.barreThickness, this.gridTop, this.fretHeight);
  }

  /**
   * 弦枕枕条矩形（本侧坐标）：横向**左右各外扩半线宽**（枕条须完整盖住零品线的整条线宽），
   * 纵向自网格顶向上一条弦枕高度 —— 弦枕是指板的顶边，它只推网格顶、不推别处。
   *
   * 与 `barreRect` 同属「按本侧几何算出的绘制矩形」，三处指板共用同一份算式；绘制内核
   * （fretboardDrawCore 的 `drawNut`）读的是同一组量（线宽 / 弦枕高 / 网格顶），故两侧逐像素同形。
   * 交互侧对纵向另有画法修正，见其重载。
   */
  nutBarRect(stringCount: number, startStrX: number): { x: number; y: number; width: number; height: number } {
    return {
      x: startStrX - this.lineWidth / 2,
      y: this.gridTop - this.nutHeight,
      width: this.stringsSpan(stringCount) + this.lineWidth,
      height: this.nutHeight,
    };
  }
}

/**
 * 工厂入口：三处实现各自 `createFretboardGeometry(<自己的 scale>, <本图是否画弦枕>)`。
 * 需要重载差异字段的实现改为继承 `FretboardGeometry`（见 interactiveGeometry.ts / 导出侧）。
 *
 * `boldNut` 缺省 true（零品窗口那张图）—— 偏移窗口的图由各侧按自己的品窗取 `false` 的实例。
 */
export const createFretboardGeometry = (scale = 1, boldNut = true): FretboardGeometry =>
  new FretboardGeometry(scale, boldNut);

/**
 * 基准几何单例（scale = 1，画弦枕）—— 离屏指板图 / 导出图的几何，「1 倍」的定义本身。
 *
 * 与 `renderFretboardCanvas.ts` 的 `CANVAS_GEOMETRY` 是同一个对象（那边直接取本单例，不再另 create）：
 * 凡需要「减掉图自身留白」的派生量（承载指板图的容器留白就是），都由它给出，
 * 否则每多一个消费方就多一份 scale=1 的实例，日后「基准改了」会漏改。
 */
export const BASE_FRETBOARD_GEOMETRY = createFretboardGeometry(1);

/** 基准几何的另一半：**不画弦枕**那张图（偏移品窗）。与上一份同 scale，只差弦枕那一段是否占位 */
const BASE_FRETBOARD_GEOMETRY_NO_NUT = createFretboardGeometry(1, false);

/**
 * 按「本张图是否画加粗弦枕」取基准几何实例（两态各一份单例，不按需 create —— 见上一条的说明）。
 *
 * 消费方（离屏缩略图的虚拟占位、导出侧的尺寸推算）据此与实绘取到同一份几何：
 * 判据是 `显示开关 && isZeroFretWindow(绝对品位偏移)`，绝对偏移见 fretGeometry.absoluteFretOffsetOf。
 */
export const baseGeometryFor = (boldNut: boolean): FretboardGeometry =>
  boldNut ? BASE_FRETBOARD_GEOMETRY : BASE_FRETBOARD_GEOMETRY_NO_NUT;
