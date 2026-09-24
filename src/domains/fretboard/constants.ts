/**
 * 指板领域常量：**底层几何数据**（唯一来源）+ 交互配置。
 *
 * 三处指板实现（交互指板 SVG / 离屏缩略图 Canvas / 乐谱导出 Worker）的几何一律由
 * `model/fretboardGeometry` 的工厂按各自 scale 从 `FRETBOARD_CANVAS_CONFIG` 派生；
 * 本文件**不再**声明任何某一侧的版式（留白、空弦行、品号几何、字号档位），
 * 各侧的差异写在各自的重载里（见 model/interactiveGeometry.ts、导出侧的 ExportFretboardGeometry）。
 */

/** 指板交互配置 */
export const INTERACTION_CONFIG = {
  /** 点击后静音冷却时间（ms），防止快速连续点击误触相邻品 */
  MUTING_COOL_DOWN: 200,
  /** 滚轮累积阈值（px），超过才切换变调夹 */
  WHEEL_THRESHOLD: 40,
  /** 变调夹最大档位（第 12 品为同度，11 品封顶） */
  MAX_CAPO_LIMIT: 11,
  /** 变调夹最小档位 */
  MIN_CAPO_LIMIT: 0,
} as const;

/** 不同品数对应的指板缩放比例（品数越多整体越小，保证不超容器） */
export const FRETBOARD_SCALE_MAP: Record<number, number> = {
  3: 1.0,
  4: 0.92,
  5: 0.85,
} as const;

/**
 * 取品数对应的整体缩放倍数（未登记品数回退 1）。
 *
 * 它是**整张指板图（含图内各段留白）共乘的同一个倍数** —— 图的各部分必须一起乘，
 * 否则 5 品时网格缩到 0.85 而留白不动，图会被撑胖（比例 0.729 对图的 0.696）。
 * 各处各写一遍 `FRETBOARD_SCALE_MAP[n] ?? 1` 就是第二份真相，故收在这里。
 */
export const fretboardScaleOf = (fretCount: number): number => FRETBOARD_SCALE_MAP[fretCount] ?? 1;

/** 可选品数（指板支持的品位窗口档位；扩展品数只需改这里与各 *MAP 映射表） */
export const FRET_COUNTS = [3, 4, 5] as const;
/** 默认品数：清洗兜底、解码兜底、初始草稿共用此值 */
export const DEFAULT_FRET_COUNT = 3;
/** 品数下限：渲染层对异常数据的兜底钳制下界 */
export const MIN_FRET_COUNT: number = Math.min(...FRET_COUNTS);

/**
 * 品位窗口品数的渲染口径：缺省 / 0 / NaN 回落到默认档位，再钳到下限。
 * 主线程绘制与导出 Worker 必须走同一函数——两处曾各自写兜底（一边 4、一边 3），
 * 同一和弦在预览与导出图里会画出不同品数。
 */
export const clampDrawFretCount = (fretCount: number | null | undefined): number =>
  Math.max(MIN_FRET_COUNT, fretCount || DEFAULT_FRET_COUNT);

/** 各品数下浮动操作栏的 bottom 定位（画布随品数增高，栏位随之贴近底部） */
export const FRET_COUNT_BAR_BOTTOM_MAP: Record<number, string> = {
  3: '3rem',
  4: '2.5rem',
  5: '1.5rem',
};
/** 取品数对应的浮动栏 bottom；未登记的品数回退到最高档（画布最高，栏位最贴底） */
export const getFloatingBarBottom = (fretCount: number): string => {
  const exact = FRET_COUNT_BAR_BOTTOM_MAP[fretCount];
  if (exact) return exact;
  const tallest = Math.max(...FRET_COUNTS);

  return FRET_COUNT_BAR_BOTTOM_MAP[tallest] ?? '3rem';
};

/** 基准琴弦间距（px）：先提出为独立常量，供宽度推导引用（对象字面量内部取不到自身字段） */
const CANVAS_STRING_SPACING = 8.8;

/** 基准弦枕（零品加粗带）高度（px）：属指板段，只推指板顶；空弦区上下 padding 按它定比例 */
const CANVAS_NUT_HEIGHT = 3.6;

/**
 * 基准网格线宽（px）：琴弦竖线与品丝横线共用同一条线宽。
 *
 * 它是**几何量**而不是某一侧的笔触样式 —— 三处指板都按自己的 scale 从它派生
 * （交互侧画出来就是基准的若干倍粗），故登记在基准数据里，不在任何一处写死。
 */
const CANVAS_LINE_WIDTH = 1;

/**
 * 基准**左右留白**（px，左右各一份、同值）—— 横向那两份留白，容纳品号文字与板身边框。
 *
 * 与上下留白分开登记：横向要装下品号，纵向只是图自身的呼吸空间，两者的合适取值本就不同，
 * 绑成一个数会逼着两边互相迁就。
 */
const CANVAS_SIDE_PAD = 14;

/**
 * 基准**上下留白**（px，上下各一份、同值）—— 纵向链的**顶部留白**与**底部留白**两段。
 *
 * 与左右留白一样是**常量**，不随名字字号、空弦标记体量、是否画品号而变 ——
 * 三处实现（交互 SVG / 离屏 Canvas / 导出 Worker）都只读这一个数，各按自己的 scale 派生。
 */
const CANVAS_EDGE_PAD = 7;

/**
 * 基准和弦名字号（px）。
 *
 * 大小由基准直接定死、不留缩放入口：名字尺寸因此只剩两个来源 —— 本值 × 本侧 scale，
 * 以及放不下时的贴合收缩（见 renderFretboardCanvas 的 fitChordNameLayout）。
 */
const CANVAS_CHORD_NAME_FONT_SIZE = 12.8;

/** 基准空弦圆圈半径（px）：空弦区域的**基准**内容体量（各侧可换自己的标记，见 MARKER_AREA_H） */
const CANVAS_OPEN_CIRCLE_RADIUS = 2.6;

/**
 * 空弦区**上下 padding 相对弦枕高度的倍数** —— 调空弦区松紧就只动这一个数（上下一起变）。
 *
 * 刻意取**小于 1** 的倍数：这段只是空弦标记与上下内容之间的呼吸空间，不该有一条弦枕那么厚。
 * 写成比例而不是绝对值，是因为它得随弦枕一起变 —— 弦枕加粗而这段不动，音符就会贴上弦枕。
 */
const CANVAS_MARKER_PAD_RATIO = 0.5;

/**
 * 基准**空弦区上下 padding**（px，上下各一份、同值）—— 名字内容底 → 空弦区顶、
 * 空弦区底 → 指板顶。
 */
const CANVAS_MARKER_PAD = CANVAS_NUT_HEIGHT * CANVAS_MARKER_PAD_RATIO;

/**
 * 升降号上标相对**和弦名字号**的名义比（字号比 / 抬升比）。
 *
 * 写成比值，而不是两个绝对值：绝对值是贴着当时那个字号调的，字号一改它们不跟 ——
 * 上标会反超正名，「上标」直接失效。比值口径下上标永远随正名等比，字号怎么改都不会越位。
 */
const CANVAS_ACCIDENTAL_FONT_RATIO = 0.75;
const CANVAS_ACCIDENTAL_RAISE_RATIO = 0.3125;

/**
 * 底层几何数据（唯一来源）：以「品高 13.5px」为 1 倍基准。
 *
 * 其它两处指板（交互指板 SVG、乐谱导出）全部由它等比派生，各自的差异只在自己的重载里；
 * 本对象只描述**一张指板长什么样**，不含任何一侧的版式决策。
 */
export const FRETBOARD_CANVAS_CONFIG = {
  /** 指板图容器标准宽度（px）＝ 左右留白 × 2 ＋ 5 根弦间距（默认 6 弦基准）；
   *  任意弦数的宽度由工厂的 `boardWidth(stringCount)` 派生，此处只登记基准值 */
  FRETBOARD_WIDTH: CANVAS_SIDE_PAD * 2 + 5 * CANVAS_STRING_SPACING,
  /** 琴弦间距（px） */
  STRING_SPACING: CANVAS_STRING_SPACING,
  /** 品格高度（px） */
  FRET_HEIGHT: 13.5,
  /** 指板**左右**留白（px，左右各一份、同值）：容纳品号文字 */
  FRETBOARD_LEFT_PAD: CANVAS_SIDE_PAD,
  /**
   * 指板**上下**留白（px，上下各一份、同值）—— 纵向链的**顶部留白**与**底部留白**两段。
   *
   * 两处消费，同一个「呼吸空间」语义：
   * ① **图内**：纵向链的顶 / 底两段（工厂的 `edgePad` / `boardBottomPad`）；
   * ② **图外**：承载指板图的容器按它追加外侧留白（工厂的 `edgePad`，工作台画布消费）。
   *
   * 它是**常量**，不随名字字号、空弦标记体量、是否画品号而变 ——
   * 三处指板一律「本值 × 自己的 scale」，不再有某一侧另定一个数的余地。
   */
  EDGE_PAD: CANVAS_EDGE_PAD,
  /**
   * 隐藏品号时的最小水平留白（px）。
   *
   * 品号不画时左侧留白可以收窄，但不能取 0 —— 须大于大横按端头半宽与按弦圆点半径，
   * 否则首弦上的音符会被画布边缘裁掉。它是**几何下限**，不是某一侧的版式决策，故登记在基准数据里。
   */
  MIN_LEFT_PAD: 7,
  // ===== 纵向链（自上而下）=====
  //   顶部留白 → 和弦名 → 空弦区上 padding → 空弦区域 → 空弦区下 padding → 指板（弦枕 + 网格）→ 底部留白
  // 两端留白即 EDGE_PAD，中间两份是空弦区的上下 padding（共用同一个 MARKER_PAD）——
  // 四段留白全是本表的**常量**，
  // 各侧只差「和弦名」与「空弦区域」两段**内容**的高度，故内容怎么改都动不了留白。
  // 网格顶与空弦标记中心 Y **不在此声明**：它们是上若干段的和，由工厂的 gridTop / markerCenterY 派生，
  // 写死一份只会与各段的和悄悄漂移。弦枕登记在**指板自己那一段**里 —— 它是指板的顶边，只推网格顶；
  // **画了才占位**（判据见工厂的 boldNut）：零品窗口那张图有它、偏移窗口那张没有，
  // 于是「空弦标记 → 指板顶」那段留白在两张图里都等于空弦区的下 padding（观感上下对称）。
  /** 按弦圆点半径（px） */
  DOT_RADIUS: 3.8,
  /** 大横按梁厚度（px，适度加粗补偿，两端饱满圆角） */
  BARRE_THICKNESS: 8.4,
  /**
   * 指板网格线宽（px）：琴弦竖线与品丝横线共用，弦枕枕条的横向外扩量也取它
   * （枕条须完整盖住零品线的线宽，故其宽度 = 弦区跨度 + 本值）。
   */
  LINE_WIDTH: CANVAS_LINE_WIDTH,
  /** 弦枕枕条高度（px）：属指板段，只推指板顶 */
  NUT_HEIGHT: CANVAS_NUT_HEIGHT,
  /** 和弦名文字基线的 y 坐标（= 顶部留白 + 字号，基线自名字内容顶端起算） */
  CHORD_NAME_BASELINE_Y: CANVAS_EDGE_PAD + CANVAS_CHORD_NAME_FONT_SIZE,
  /** 和弦名区块高度（px，= 顶部留白 + 字号；名字下方不留内边距，故与基线同值）：布局据此为名字预留高度 */
  CHORD_NAME_BLOCK_H: CANVAS_EDGE_PAD + CANVAS_CHORD_NAME_FONT_SIZE,
  /** 空弦圆圈半径（px） */
  OPEN_CIRCLE_RADIUS: CANVAS_OPEN_CIRCLE_RADIUS,
  /** 静音叉号半径（px） */
  MUTE_CROSS_RADIUS: 2.6,
  /** 空弦区域的内容高度（px）：基准取圆圈直径；各侧可重载为自己的标记体量（见工厂 markerAreaH） */
  MARKER_AREA_H: CANVAS_OPEN_CIRCLE_RADIUS * 2,
  /** 空弦区**上下** padding（px，上下各一份、同值）：名字内容底 → 空弦区顶，空弦区底 → 指板顶 */
  MARKER_PAD: CANVAS_MARKER_PAD,
  /** 和弦名称字号（px） */
  CHORD_NAME_FONT_SIZE: CANVAS_CHORD_NAME_FONT_SIZE,
  /** 升降号上标字号（px）= 正名字号 × 名义比：上标必须始终小于正名，写成比值才不会再被字号变更落下 */
  ACCIDENTAL_FONT_SIZE: CANVAS_CHORD_NAME_FONT_SIZE * CANVAS_ACCIDENTAL_FONT_RATIO,
  /** 升降号上标垂直上移（px，Canvas 坐标系向下为正，上标需为负数向上偏移）= −正名字号 × 抬升比 */
  ACCIDENTAL_SUPERSCRIPT_OFFSET: -CANVAS_CHORD_NAME_FONT_SIZE * CANVAS_ACCIDENTAL_RAISE_RATIO,
  /** 变调夹品号字号（px） */
  CAPO_TEXT_FONT_SIZE: 8,
  /** 品号文字在指板左侧的 X 轴偏移（px） */
  FRET_NUMBER_X_OFFSET: 4,
  /**
   * 主题配色已迁移至 tokens.scss 的 --fbc-* CSS 变量，
   * 由 fretboardCanvasPalette.ts 的 resolveFretboardCanvasPalette 运行时解析：
   * - FretboardCanvas.vue 主题切换时解析重绘
   * - scoreExportWorker 由主线程解析后随导出消息传入
   */
} as const;
