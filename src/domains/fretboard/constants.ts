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

/** 指板配色（明暗双主题） */
export const FRETBOARD_COLORS = {
  /** 根音圆点（浅色主题） */
  rootLight: '#ff9500',
  /** 根音圆点（深色主题） */
  rootDark: '#ffd60a',

  /** 普通音符圆点（浅色主题） */
  normalLight: '#2563eb',
  /** 普通音符圆点（深色主题） */
  normalDark: '#3b82f6',

  /** 根音音符文字（浅色主题） */
  textRootLight: '#fff7ed',
  /** 根音音符文字（深色主题） */
  textRootDark: '#29323d',

  /** 空弦根音按钮背景（浅色主题） */
  openRootBgLight: '#fff7ed',
  /** 空弦根音按钮背景（深色主题） */
  openRootBgDark: '#2d2012',

  /** 空弦根音边框（浅色主题） */
  openRootBorderLight: '#fed7aa',
  /** 空弦根音边框（深色主题） */
  openRootBorderDark: '#6b4712',

  /** 空弦根音按钮文字（浅色主题） */
  openRootTextLight: '#ff9500',
  /** 空弦根音按钮文字（深色主题） */
  openRootTextDark: '#ffd60a',

  // 专门用于 focus/currentColor
  /** 聚焦高亮色（浅色主题） */
  focusLight: '#92400e',
  /** 聚焦高亮色（深色主题） */
  focusDark: '#fcd34d',
} as const;

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
  /** 主题配色方案（明/暗） */
  THEME: {
    DARK: {
      BG: '#18181a',
      TEXT: '#f5f5f7',
      SUB_TEXT: '#a1a1aa',
      DIVIDER: '#27272a',
      FB_LINE: '#52525b',
      FB_NUT: '#f4f4f5',
      FB_NOTE: '#f4f4f5',
      FB_OPEN: '#f4f4f5',
      FB_BARRE: '#f4f4f5',
      FB_MUTE: '#f4f4f5',
    },
    LIGHT: {
      BG: '#f2f2f7',
      TEXT: '#1c1c1e',
      SUB_TEXT: '#71717a',
      DIVIDER: '#e4e4e7',
      FB_LINE: '#a1a1aa',
      FB_NUT: '#18181b',
      FB_NOTE: '#18181b',
      FB_OPEN: '#18181b',
      FB_BARRE: '#18181b',
      FB_MUTE: '#18181b',
    },
  },
} as const;
