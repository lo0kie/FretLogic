/**
 * 指板领域核心常量：包含几何尺寸、缩放比、字体、颜色及交互参数。
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

/** 指板外框线宽（px） */
export const FRETBOARD_LINE_WIDTH = 8;

/** 相邻弦间距（px） */
const STRING_SPACING = 60;
/** 画布左侧留白（px，容纳品号与边框） */
const OFFSET_X_LEFT = 18;
/** 画布右侧留白（px） */
const OFFSET_X_RIGHT = 18;
/** 单个品格高度（px），指板所有纵向布局与坐标换算的基础单位 */
const FRET_HEIGHT = 100;
/** 顶部空弦区高度（px，空弦音符按钮所在区域） */
const OFFSET_Y_TOP = 80;
/** 空弦音符在空弦区内的中心 y 偏移（px）。固定贴近和弦名一侧，
 *  使多出的空弦区高度全部转化为「空弦音 ↔ 指板」的间距，而非均分给上下 */
export const OPEN_STRING_MARKER_Y = 34;
/** 底部留白（px） */
const OFFSET_Y_BOTTOM = 20;
/** 指板自带和弦名区域高度（px）；需比 CHORD_NAME_FONT_SIZE × 行高 略大，给 j / g 等下伸部留余量，避免被裁脚 */
export const CHORD_NAME_ZONE_HEIGHT = 100;
/**
 * 指板自带和弦名字号（px）：全局唯一值，不再按 sm/md/lg 分档（原档位表只有一个消费方且从不传值）。
 * 与行高配合：字号 80 × 行高 1.15 ≈ 92px 的 line-box，落在 100px 的区域内，j / g 下伸部完整可见
 */
export const CHORD_NAME_FONT_SIZE = 80;

/** 动态计算任意弦数对应的大指板画布总宽（左留白 + (N-1) 段弦距 + 右留白） */
export const getBoardWidth = (stringCount: number): number =>
  OFFSET_X_LEFT + Math.max(1, stringCount - 1) * STRING_SPACING + OFFSET_X_RIGHT;

/** 指板画布整体配置（由上方基础常量派生，供各处统一引用） */
export const CANVAS_CONFIG = {
  STRING_SPACING,
  FRET_HEIGHT,
  OFFSET_X_LEFT,
  OFFSET_Y_TOP,
  OFFSET_Y_BOTTOM,
  CHORD_NAME_ZONE_HEIGHT,
  /** 画布总宽（默认 6 弦基准） */
  BOARD_WIDTH: OFFSET_X_LEFT + 5 * STRING_SPACING + OFFSET_X_RIGHT,
} as const;

/** 可选品数（指板支持的品位窗口档位；扩展品数只需改这里与各 *MAP 映射表） */
export const FRET_COUNTS = [3, 4, 5] as const;
/** 默认品数：清洗兜底、解码兜底、初始草稿共用此值 */
export const DEFAULT_FRET_COUNT = 3;
/** 品数下限：渲染层对异常数据的兜底钳制下界 */
export const MIN_FRET_COUNT: number = Math.min(...FRET_COUNTS);

/** 各品数下浮动操作栏的 bottom 定位（画布随品数增高，栏位随之贴近底部） */
export const FRET_COUNT_BAR_BOTTOM_MAP: Record<number, string> = {
  3: '5rem',
  4: '3.5rem',
  5: '2.5rem',
};
/** 取品数对应的浮动栏 bottom；未登记的品数回退到最高档（画布最高，栏位最贴底） */
export const getFloatingBarBottom = (fretCount: number): string => {
  const exact = FRET_COUNT_BAR_BOTTOM_MAP[fretCount];
  if (exact) return exact;
  const tallest = Math.max(...FRET_COUNTS);
  return FRET_COUNT_BAR_BOTTOM_MAP[tallest] ?? '3.5rem';
};

const FINGER_DOT_RADIUS = 28;
const OPEN_DOT_SIZE_PX = FINGER_DOT_RADIUS * 2;
const FINGER_OUTLINE_RADIUS = 32;
const FINGER_OUTLINE_WIDTH = 3;

/**
 * 音符整体显示尺寸（空弦与指板统一引用，避免两处散落字面量）。
 * 指板 SVG 为 1 user 单位 = 1px（width 与 viewBox 同值，无缩放），
 * 故此处统一以 px 表达，保证空弦圆点/字体与指板圆点实际像素等大。
 * 二者同处 scale(fretboardScale) 容器，缩放等比，因此静止与缩放时都保持一致。
 */
export const NOTE_DISPLAY = {
  /** 指板音符圆点半径 */
  FINGER_DOT_RADIUS,
  /** 指板音符圆点直径 */
  OPEN_DOT_SIZE_PX,
  /** 指板外边框的半径 */
  FINGER_OUTLINE_RADIUS,
  /** 指板外边框的宽度 */
  FINGER_OUTLINE_WIDTH,
  /** 外边框相对距离 */
  FINGER_OUTLINE_OFFSET: FINGER_OUTLINE_RADIUS - FINGER_DOT_RADIUS - FINGER_OUTLINE_WIDTH / 2,
  /** 指板手指音符基础字号（px） */
  FINGER_FONT_SIZE: 40,
  /** 升降号相对基础字号的缩放比例（两者共用） */
  ACCIDENTAL_SCALE: 0.62,
  /** 指板升降号相对基础字号的垂直上移比例（正值向上） */
  ACCIDENTAL_RAISE_RATIO: 0.28,
} as const;

/** 指板圆点/空弦配色已迁移至 tokens.scss 的 --fb-* CSS 变量（FretboardNote 消费 var()，明暗主题随 tokens 切换） */

/** 横按提示箭头颜色过渡时长（ms，FretboardSvg 计算样式） */
export const BARRE_ARROW_TRANSITION_MS = 150;

/** 离屏指板图 Canvas 渲染专用尺寸与主题配色（供 FretboardCanvas 与导出渲染使用） */
export const FRETBOARD_CANVAS_CONFIG = {
  /** 动态计算乐谱/导出指板图的宽度：左侧留白 × 2 + (N-1) 根弦间距 */
  getExportFretboardWidth: (stringCount: number): number => 14 * 2 + Math.max(1, stringCount - 1) * 9.8,
  /** 指板图容器标准宽度（px）＝ 左右对称留白 14 × 2 ＋ 5 根弦间距 */
  FRETBOARD_WIDTH: 77,
  /** 琴弦间距（px） */
  STRING_SPACING: 9.8,
  /** 品格高度（px） */
  FRET_HEIGHT: 13.5,
  /** 指板左侧留白（px，容纳品号文字） */
  FRETBOARD_LEFT_PAD: 14,
  /** 指板网格顶部起始 Y 偏移（px） */
  FRETBOARD_GRID_TOP: 30,
  /** 按弦圆点半径（px） */
  DOT_RADIUS: 3.8,
  /** 大横按梁厚度（px，适度加粗补偿，两端饱满圆角） */
  BARRE_THICKNESS: 8.4,
  /** 弦枕枕条高度（px） */
  NUT_HEIGHT: 3.6,
  /** 和弦名文字基线的 y 坐标 */
  CHORD_NAME_BASELINE_Y: 16,
  /** 空弦与静音标记中心 Y 偏移（px） */
  MARKER_CENTER_Y: 22,
  /** 静音叉号半径（px） */
  MUTE_CROSS_RADIUS: 2.6,
  /** 空弦圆圈半径（px） */
  OPEN_CIRCLE_RADIUS: 2.6,
  /** 和弦名称字号（px） */
  CHORD_NAME_FONT_SIZE: 16,
  /** 升降号上标字号（px） */
  ACCIDENTAL_FONT_SIZE: 12,
  /** 升降号上标垂直上移（px，Canvas 坐标系向下为正，上标需为负数向上偏移） */
  ACCIDENTAL_SUPERSCRIPT_OFFSET: -5,
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
