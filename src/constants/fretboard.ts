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
/** 底部留白（px） */
const OFFSET_Y_BOTTOM = 20;
/** 指板自带和弦名区域高度（px） */
const CHORD_NAME_ZONE_HEIGHT = 88;
/** 指板自带和弦名预设字号（px），与项目 'sm' | 'md' | 'lg' 尺寸约定一致 */
export const CHORD_NAME_FONT_SIZE_MAP = {
  sm: 32,
  md: 40,
  lg: 60,
} as const;
export type ChordNameFontSize = keyof typeof CHORD_NAME_FONT_SIZE_MAP;

/** 指板画布整体配置（由上方基础常量派生，供各处统一引用） */
export const CANVAS_CONFIG = {
  STRING_SPACING,
  FRET_HEIGHT,
  OFFSET_X_LEFT,
  OFFSET_Y_TOP,
  OFFSET_Y_BOTTOM,
  CHORD_NAME_ZONE_HEIGHT,
  /** 画布总宽 = 左留白 + 5 段弦间距 + 右留白 */
  BOARD_WIDTH: OFFSET_X_LEFT + 5 * STRING_SPACING + OFFSET_X_RIGHT,
} as const;

/** 可选品数（指板支持 3 或 4 品） */
export const FRET_COUNTS = [3, 4] as const;

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
