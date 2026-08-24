/**
 * 全局常量集中管理。
 * 由原先分散在 src/constants/* 的模块合并而来，按领域分组。
 */
import { computed, ref } from 'vue';

// ===================== 音频（Tone.js 相关参数）=====================
/** 音频合成 / 音效配置 */
export const AUDIO_CONFIG = {
  /** 标准音 A4 频率（Hz） */
  A4_FREQ: 440,
  /** A4 的 MIDI 音符编号（用于音高换算） */
  A4_MIDI_NOTE: 69,

  /** 主音量增益（dB） */
  MAIN_VOLUME_DB: -8,
  /** 混响时长（s） */
  REVERB_DURATION: 1.2,
  /** 混响干湿比 */
  REVERB_WET_GAIN: 0.2,

  /** 压缩器阈值（dB） */
  COMPRESSOR_THRESHOLD: -14,
  /** 压缩器膝点（dB） */
  COMPRESSOR_KNEE: 30,
  /** 压缩比 */
  COMPRESSOR_RATIO: 12,
  /** 压缩器起音时间（s） */
  COMPRESSOR_ATTACK: 0.003,
  /** 压缩器释音时间（s） */
  COMPRESSOR_RELEASE: 0.25,

  /** 扫弦时相邻弦触发间隔（s） */
  STRUM_DELAY_STEP: 0.06,
  /** 音符释放后额外静音等待（s，防止尾音截断） */
  AUDIO_RELEASE_TAIL: 0.6,

  /** 合成器泛音比 */
  SYNTH_HARMONICITY: 1.5,
  /** 合成器调制指数 */
  SYNTH_MODULATION_INDEX: 2.5,
  /** 包络起音时间（s） */
  ENV_ATTACK: 0.004,
  /** 包络衰减时间（s） */
  ENV_DECAY: 0.12,
  /** 包络延音电平（0~1） */
  ENV_SUSTAIN: 0.28,
  /** 包络释音时间（s） */
  ENV_RELEASE: 0.5,
} as const;

// ===================== 指板 / 交互 =====================
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

// ===================== 布局 =====================
/** 左侧栏宽度（px） */
export const LEFT_SIDEBAR_WIDTH = ref(344);
/** 左侧栏宽度（px 字符串形式，供 CSS 绑定） */
export const LEFT_SIDEBAR_WIDTH_PIXEL = computed(() => `${LEFT_SIDEBAR_WIDTH.value}px`);

/** 工作台布局配置 */
export const WORKBENCH_LAYOUT = {
  /** 指板画布之外的固定垂直内边距（px，为和弦名区/操作区预留空间） */
  BASE_VERTICAL_PADDING: 135,
} as const;

/** 表单组件三档高度映射（rem，sm/md/lg） */
export const FORM_COMPONENT_HEIGHT_MAP = {
  sm: '1.5rem', // 小档高度
  md: '1.75rem', // 中档/默认高度
  lg: '2.2rem', // 大档高度
} as const;

/** 小档高度（= FORM_COMPONENT_HEIGHT_MAP.sm） */
export const HEIGHT_SM = FORM_COMPONENT_HEIGHT_MAP.sm;
/** 中档高度（= FORM_COMPONENT_HEIGHT_MAP.md） */
export const HEIGHT_MD = FORM_COMPONENT_HEIGHT_MAP.md;
/** 大档高度（= FORM_COMPONENT_HEIGHT_MAP.lg） */
export const HEIGHT_LG = FORM_COMPONENT_HEIGHT_MAP.lg;

/** 间距 token（rem，与 tokens.module.less 的 @space-* 保持一致，供脚本侧计算使用） */
export const SPACE_REM = {
  /** @space-2xs */
  XS_2: 0.125,
  /** @space-xs */
  XS: 0.25,
} as const;

// ===================== 打印（A4）=====================
/** A4 纸张宽度（px @96dpi，210mm） */
export const A4_WIDTH_PX = 794; // 210mm @96dpi
/** A4 纸张高度（px @96dpi，297mm） */
export const A4_HEIGHT_PX = 1123; // 297mm @96dpi
/** A4 页边距（px，≈15mm） */
export const A4_MARGIN_PX = 56; // ≈15mm 页边距
/** A4 内容区宽度（= 纸宽 - 左右页边距） */
export const A4_CONTENT_WIDTH = A4_WIDTH_PX - A4_MARGIN_PX * 2;
/** A4 内容区高度（= 纸高 - 上下页边距） */
export const A4_CONTENT_HEIGHT = A4_HEIGHT_PX - A4_MARGIN_PX * 2;

// ===================== 存储键 =====================
/** localStorage 存储键统一管理（避免魔法字符串散落） */
export const STORAGE_KEYS = {
  // ---- 和弦库数据 ----
  /** 已保存和弦列表（V4 版本化键名） */
  CHORD_LIST: 'CHORD_LAB_LIST_V4',
  /** 和弦分组列表 */
  GROUPS: 'CHORD_LAB_GROUPS',
  /** 正在编辑的和弦 id */
  EDITING_ID: 'CHORD_LAB_EDITING_ID',
  /** 当前选中的分组 id */
  CURR_GROUP_ID: 'CHORD_LAB_CURR_GROUP_ID_V1',
  /** 当前展开的分组 id（单一展开，持久化） */
  EXPANDED_GROUP_ID: 'CHORD_LAB_EXPANDED_GROUP_ID_V1',

  // ---- 同步配置（后端选择） ----
  /** 当前同步后端：github | webdav */
  SYNC_TARGET: 'CHORD_LAB_SYNC_TARGET',

  // ---- GitHub 同步配置 ----
  /** GitHub 仓库 owner */
  GH_OWNER: 'CHORD_LAB_GH_OWNER',
  /** GitHub 仓库名 */
  GH_REPO: 'CHORD_LAB_GH_REPO',
  /** GitHub 分支 */
  GH_BRANCH: 'CHORD_LAB_GH_BRANCH',
  /** GitHub 存储路径 */
  GH_PATH: 'CHORD_LAB_GH_PATH',
  GH_BRANCHES: 'CHORD_LAB_GH_BRANCHES',

  // ---- WebDAV 同步配置 ----
  /** WebDAV 服务器地址 */
  WEBDAV_SERVER_URL: 'CHORD_LAB_WEBDAV_SERVER_URL',
  /** WebDAV 用户名 */
  WEBDAV_USERNAME: 'CHORD_LAB_WEBDAV_USERNAME',
  /** WebDAV 密码 */
  WEBDAV_PASSWORD: 'CHORD_LAB_WEBDAV_PASSWORD',
  /** WebDAV 远程文件路径 */
  /** WebDAV CORS 代理地址（可选，用于绕开跨域限制） */
  WEBDAV_PROXY_URL: 'CHORD_LAB_WEBDAV_PROXY_URL',

  // ---- 编辑器草稿状态 ----
  /** 是否处于编辑模式 */
  IS_EDITING: 'CHORD_LAB_IS_EDITING',
  /** 编辑中的和弦草稿（整对象持久化） */
  EDITING_DRAFT: 'CHORD_LAB_EDITING_DRAFT',
  /** 是否处于创建模式 */
  IS_CREATING: 'CHORD_LAB_IS_CREATING',
  /** 是否处于多指法选择模式 */
  IS_MULTI_FINGERING: 'CHORD_LAB_IS_MULTI_FINGERING',
  /** 多指法当前选中索引 */
  MULTI_FINGERING_INDEX: 'CHORD_LAB_MULTI_FINGERING_INDEX',
  /** 多指法候选和弦列表 */
  MULTI_FINGERING_CHORDS: 'CHORD_LAB_MULTI_FINGERING_CHORDS',

  // ---- 应用级偏好 ----
  /** 全局是否可编辑（false = 仅预览） */
  IS_GLOBAL_EDITABLE: 'CHORD_LAB_IS_GLOBAL_EDITABLE',

  // ---- 歌曲数据（按歌曲拆键持久化） ----
  /** 旧版歌曲数据（迁移源） */
  SONGS: 'CHORD_LAB_SONGS_V1',
  /** 歌曲有序 id 索引（前缀:格式，维护歌曲顺序） */
  SONGS_INDEX: 'CHORD_LAB_SONGS_INDEX_V1',
  /** 单曲独立键（前缀:歌曲id 格式，按歌存储） */
  SONG_ENTRY: 'CHORD_LAB_SONG_ENTRY_V1',
  /** 当前活动歌曲 id */
  ACTIVE_SONG_ID: 'CHORD_LAB_ACTIVE_SONG_ID_V1',

  // ---- 谱面视图偏好 ----
  /** 导出质量（0~1 的小数，滑块以百分比展示） */
  EXPORT_QUALITY: 'CHORD_LAB_EXPORT_QUALITY_V1',
  /** 谱面字号缩放 */
  SCORE_FONT_SCALE: 'CHORD_LAB_SCORE_FONT_SCALE_V1',
  /** 谱面内嵌指板缩放 */
  SCORE_FRETBOARD_SCALE: 'CHORD_LAB_SCORE_FRETBOARD_SCALE_V1',
  /** 谱面滚动速度 */
  SCORE_SCROLL_SPEED: 'CHORD_LAB_SCORE_SCROLL_SPEED_V1',
  /** 左侧栏开合状态 */
  UI_LEFT_OPEN: 'CHORD_LAB_UI_LEFT_OPEN',
} as const;

// ===================== 主题配色 =====================
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
  openRootBgLight: '#d89a3d',
  /** 空弦根音按钮背景（深色主题） */
  openRootBgDark: '#d6a447',

  /** 空弦根音按钮文字（浅色主题） */
  openRootTextLight: '#ffedd5',
  /** 空弦根音按钮文字（深色主题） */
  openRootTextDark: '#29323d',

  // 专门用于 focus/currentColor
  /** 聚焦高亮色（浅色主题） */
  focusLight: '#92400e',
  /** 聚焦高亮色（深色主题） */
  focusDark: '#fcd34d',
} as const;
