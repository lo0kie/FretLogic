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
  /** 扫弦力度随机区间：下限（0~1，模拟不同力度） */
  STRUM_VELOCITY_MIN: 0.78,
  /** 扫弦力度随机区间：宽度（0~1，叠加下限构成上限） */
  STRUM_VELOCITY_RANGE: 0.22,

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
/** 空弦音符在空弦区内的中心 y 偏移（px）。固定贴近和弦名一侧，
 *  使多出的空弦区高度全部转化为「空弦音 ↔ 指板」的间距，而非均分给上下 */
export const OPEN_STRING_MARKER_Y = 34;
/** 底部留白（px） */
const OFFSET_Y_BOTTOM = 20;
/** 指板自带和弦名区域高度（px）；需比 CHORD_NAME_FONT_SIZE × 行高 略大，给 j / g 等下伸部留余量，避免被裁脚 */
const CHORD_NAME_ZONE_HEIGHT = 100;
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

// ===================== 布局 =====================
/** 左侧栏宽度（px） */
export const LEFT_SIDEBAR_WIDTH = ref(344);
/** 左侧栏宽度（px 字符串形式，供 CSS 绑定） */
export const LEFT_SIDEBAR_WIDTH_PIXEL = computed(() => `${LEFT_SIDEBAR_WIDTH.value}px`);

/** 表单组件预设宽度映射（rem / %） */
export const FORM_COMPONENT_WIDTH_MAP = {
  auto: 'auto',
  full: '100%',
  sm: '5.5rem',
  md: '8rem',
  lg: '11rem',
  xl: '14rem',
} as const;

export type FormComponentWidth = keyof typeof FORM_COMPONENT_WIDTH_MAP | (string & {}) | number;

/** 解析通用表单控件宽度属性为 CSS 尺寸值 */
export const resolveComponentWidth = (width?: FormComponentWidth): string | undefined => {
  if (width === undefined || width === null || width === '') return undefined;
  if (typeof width === 'number') return `${width}px`;
  if (width in FORM_COMPONENT_WIDTH_MAP) {
    return FORM_COMPONENT_WIDTH_MAP[width as keyof typeof FORM_COMPONENT_WIDTH_MAP];
  }
  return width;
};

// ===================== 乐谱离屏导出配置 =====================
/** 无标题乐谱导出/保存时使用的默认标题文案 */
export const DEFAULT_SCORE_TITLE = '歌词谱';
/** 乐谱离屏导出引擎（Worker / OffscreenCanvas）UI 尺寸、排版与主题配色常量 */
export const SCORE_EXPORT_CONFIG = {
  // ---- 画布与页面尺寸 ----
  /** A4 标准宽度（px @96dpi，210mm） */
  A4_WIDTH: 794,
  /** A4 标准高度（px @96dpi，297mm） */
  A4_HEIGHT: 1123,
  /** 导出页面安全边距（px，统一为 A4 标准 15mm 边距 56px） */
  PAGE_MARGIN: 56,
  /** 离屏绘制像素比（超采样抗锯齿） */
  PIXEL_RATIO: 2.0,
  /** 普通长图模式最小画布宽度（px，保证标题与表头排版舒展） */
  NORMAL_CANVAS_MIN_WIDTH: 520,
  /** 普通长图模式单行最大正文宽度（px，超出自动软折行） */
  NORMAL_CONTENT_MAX_WIDTH: 880,
  /** 表头元信息与首行歌词之间的间距（px） */
  HEADER_BOTTOM_GAP: 42,
  /** 标题与元信息行之间的垂直间距（px） */
  TITLE_TO_META_GAP: 14,

  // ---- 吉他指板图尺寸（整体放大并增强横按视觉饱满度） ----
  /** 动态计算乐谱/导出指板图的宽度：左侧留白 × 2 + (N-1) 根弦间距 */
  getExportFretboardWidth: (stringCount: number): number => 14 * 2 + Math.max(1, stringCount - 1) * 9.8,
  /** 指板图容器标准宽度（px）＝ 左右对称留白 14 × 2 ＋ 5 根弦间距，与 FRETBOARD_LEFT_PAD 联动保持左右边距一致 */
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
  /** 和弦名文字基线的 y 坐标：需保证大写字母顶部与画布上缘留白充足，且降部不与 22px 处的空弦标记圆相碰 */
  CHORD_NAME_BASELINE_Y: 16,
  /** 空弦与静音标记中心 Y 偏移（px） */
  MARKER_CENTER_Y: 22,
  /** 静音叉号半径（px） */
  MUTE_CROSS_RADIUS: 2.6,
  /** 空弦圆圈半径（px） */
  OPEN_CIRCLE_RADIUS: 2.6,

  // ---- 排版与文字布局（和弦贴近歌词，行与行之间拉开大间距） ----
  /** 歌词文字字号（px） */
  LYRICS_FONT_SIZE: 23,
  /** 和弦名称字号（px） */
  CHORD_NAME_FONT_SIZE: 16,
  /** 和弦名称升降号上标字号（px） */
  ACCIDENTAL_FONT_SIZE: 11,
  /** 和弦名称升降号上标垂直偏移量（px，负值向上浮动） */
  ACCIDENTAL_SUPERSCRIPT_OFFSET: -5,
  /** 品号标记字号（px） */
  CAPO_TEXT_FONT_SIZE: 10,
  /** 品号文字距首弦的水平向左偏移量（px） */
  FRET_NUMBER_X_OFFSET: 3.8,
  /** 标题字号（px） */
  TITLE_FONT_SIZE: 32,
  /** 元信息（调号/变调夹）字号（px，加大） */
  META_FONT_SIZE: 18,
  /** 元信息调号升降号上标字号（px） */
  META_ACCIDENTAL_FONT_SIZE: 12,
  /** 元信息升降号上标垂直偏移量（px，负值向上浮动） */
  META_ACCIDENTAL_SUPERSCRIPT_OFFSET: -5,
  /** 普通空格宽度（px） */
  SPACE_CHAR_WIDTH: 18,
  /** 普通汉字/单字基准列宽（px） */
  REGULAR_CHAR_WIDTH: 30,
  /** 指板槽位额外列宽补偿（px） */
  CHORD_COLUMN_EXTRA_PAD: 8,
  /** 行内连续和弦间距（px） */
  INLINE_CHORD_GAP: 10,
  /** 边和弦与歌词正文间距（px） */
  EDGE_CHORD_SECTION_GAP: 6,
  /** 指板图底部与歌词字符之间的垂直间距（px，保持紧贴连贯） */
  CHORD_TO_LYRICS_GAP: 6,
  /** 歌词超长自动折行续行缩进量（px，首行顶格，续行悬挂缩进） */
  WRAPPED_LINE_INDENT: 32,
  /** 自动折行子行间的紧凑垂直行距（px，约为标准行距的一半） */
  WRAPPED_LINE_ROW_GAP: 18,
  /** 行与行之间的独立垂直行间距（px，拉开乐谱各行） */
  LINE_ROW_GAP: 36,

  // ---- 主题配色方案（乐谱导出渲染用）----
  // 字段说明：FB_ 前缀 = 指板图（Fretboard）内元素；无前缀 = 页面/文字元素。
  // DARK / LIGHT 仅色值不同，字段语义一致，逐字段解释见各字段行注释。
  THEME: {
    DARK: {
      /** 画布底色（整页铺底 fillRect 背景，普通长图导出也读它做底） */
      BG: '#18181a',
      /** 主文字：标题、和弦名、歌词正文 */
      TEXT: '#f5f5f7',
      /** 次级文字：表头元信息（调号/变调夹）、指板图品号 */
      SUB_TEXT: '#a1a1aa',
      /** 分隔线（预留字段，当前导出渲染未消费） */
      DIVIDER: '#27272a',
      /** 指板图：琴弦与品丝网格线 */
      FB_LINE: '#52525b',
      /** 指板图：弦枕（0 品时的加粗枕条） */
      FB_NUT: '#e4e4e7',
      /** 指板图：按品音符实心圆点填充色 */
      FB_NOTE: '#f4f4f5',
      /** 指板图：空弦 ○ 标记描边色（独立于音符色，可单独调整） */
      FB_OPEN: '#f4f4f5',
      /** 指板图：大横按梁填充色 */
      FB_BARRE: '#f4f4f5',
      /** 指板图：静音 ✕ 叉号描边色 */
      FB_MUTE: '#f4f4f5',
    },
    LIGHT: {
      /** 画布底色（整页铺底 fillRect 背景，普通长图导出也读它做底） */
      BG: '#f2f2f7',
      /** 主文字：标题、和弦名、歌词正文 */
      TEXT: '#1c1c1e',
      /** 次级文字：表头元信息（调号/变调夹）、指板图品号 */
      SUB_TEXT: '#71717a',
      /** 分隔线（预留字段，当前导出渲染未消费） */
      DIVIDER: '#e4e4e7',
      /** 指板图：琴弦与品丝网格线 */
      FB_LINE: '#a1a1aa',
      /** 指板图：弦枕（0 品时的加粗枕条） */
      FB_NUT: '#27272a',
      /** 指板图：按品音符实心圆点填充色 */
      FB_NOTE: '#18181b',
      /** 指板图：空弦 ○ 标记描边色（独立于音符色，可单独调整） */
      FB_OPEN: '#18181b',
      /** 指板图：大横按梁填充色 */
      FB_BARRE: '#18181b',
      /** 指板图：静音 ✕ 叉号描边色 */
      FB_MUTE: '#18181b',
    },
  },
} as const;

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
  /** 当前同步后端：github | gitee | webdav | server */
  SYNC_TARGET: 'CHORD_LAB_SYNC_TARGET',
  /** 同步设置弹窗内临时查看/操作的方案（与全局 syncTarget 相互独立，仅弹窗内持久化） */
  SYNC_MODAL_PROVIDER: 'CHORD_LAB_SYNC_MODAL_PROVIDER',

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

  // ---- Gitee 同步配置 ----
  /** Gitee 仓库 owner */
  GE_OWNER: 'CHORD_LAB_GE_OWNER',
  /** Gitee 仓库名 */
  GE_REPO: 'CHORD_LAB_GE_REPO',
  /** Gitee 分支 */
  GE_BRANCH: 'CHORD_LAB_GE_BRANCH',
  /** Gitee 存储路径 */
  GE_PATH: 'CHORD_LAB_GE_PATH',
  GE_BRANCHES: 'CHORD_LAB_GE_BRANCHES',

  // ---- WebDAV 同步配置 ----
  /** WebDAV 服务器地址 */
  WEBDAV_SERVER_URL: 'CHORD_LAB_WEBDAV_SERVER_URL',
  /** WebDAV 用户名 */
  WEBDAV_USERNAME: 'CHORD_LAB_WEBDAV_USERNAME',
  /** WebDAV 密码 */
  WEBDAV_PASSWORD: 'CHORD_LAB_WEBDAV_PASSWORD',
  /** WebDAV 是否使用预设 CORS 代理（开关打开用预设，关闭可自定义或留空直连） */
  WEBDAV_USE_DEFAULT_PROXY: 'CHORD_LAB_WEBDAV_USE_DEFAULT_PROXY_V1',
  /** WebDAV 自定义 CORS 代理地址（可选） */
  WEBDAV_PROXY_URL: 'CHORD_LAB_WEBDAV_PROXY_URL',

  // ---- 线上服务器（Custom Server）同步配置 ----
  /** 线上服务器 API 地址 */
  SERVER_URL: 'CHORD_LAB_SERVER_URL',
  /** 线上服务器 Token / API Key */
  SERVER_TOKEN: 'CHORD_LAB_SERVER_TOKEN',

  // ---- 编辑器草稿状态 ----
  /** 是否处于编辑模式 */
  IS_EDITING: 'CHORD_LAB_IS_EDITING',
  /** 编辑中的和弦草稿（整对象持久化） */
  EDITING_DRAFT: 'CHORD_LAB_EDITING_DRAFT',
  /** 是否处于创建模式 */
  IS_CREATING: 'CHORD_LAB_IS_CREATING',
  /** 横按自动标记开关（持久化，刷新后保留） */
  AUTO_BARRE: 'CHORD_LAB_AUTO_BARRE',
  /** 是否处于多指法选择模式 */
  IS_MULTI_FINGERING: 'CHORD_LAB_IS_MULTI_FINGERING',
  /** 多指法当前选中索引 */
  MULTI_FINGERING_INDEX: 'CHORD_LAB_MULTI_FINGERING_INDEX',
  /** 多指法候选和弦列表 */
  MULTI_FINGERING_CHORDS: 'CHORD_LAB_MULTI_FINGERING_CHORDS',

  // ---- 应用级偏好 ----
  /** 工作台：是否启用和弦名简写（如 maj7->M7, dim->° 等） */
  WORKBENCH_CHORD_SHORTHAND: 'CHORD_LAB_WORKBENCH_CHORD_SHORTHAND_V1',
  /** 工作台：和弦分析面板是否收起折叠（持久化） */
  WORKBENCH_CHORD_ANALYSIS_COLLAPSED: 'CHORD_LAB_WORKBENCH_CHORD_ANALYSIS_COLLAPSED_V1',
  /** 工作台：设置面板是否收起折叠（持久化） */
  WORKBENCH_SETTINGS_COLLAPSED: 'CHORD_LAB_WORKBENCH_SETTINGS_COLLAPSED_V1',
  /** 工作台：导出面板是否收起折叠（持久化） */
  WORKBENCH_EXPORT_COLLAPSED: 'CHORD_LAB_WORKBENCH_EXPORT_COLLAPSED_V1',
  /** 工作台：导出面板背景模式（transparent / white / dark） */
  WORKBENCH_EXPORT_BG: 'CHORD_LAB_WORKBENCH_EXPORT_BG_V1',
  /** 乐谱：是否启用和弦名简写（如 maj7->M7, dim->° 等） */
  SCORE_CHORD_SHORTHAND: 'CHORD_LAB_SCORE_CHORD_SHORTHAND_V1',
  /** 乐谱：当前所在标签页（edit / interactive / preview），刷新后恢复上次所在页 */
  SCORE_ACTIVE_TAB: 'CHORD_LAB_SCORE_ACTIVE_TAB_V1',

  // ---- 歌曲数据（按歌曲拆键持久化） ----
  /** [已废弃 / 历史迁移源] 旧版歌曲单键整表数据（仅用于从早期版本向分片结构迁移，运行时不再读写） */
  SONGS: 'CHORD_LAB_SONGS_V1',
  /** 歌曲有序 id 索引（维护歌曲顺序） */
  SONGS_INDEX: 'CHORD_LAB_SONGS_INDEX_V1',
  /** 单曲独立键前缀（前缀:歌曲id 格式，按歌分片存储） */
  SONG_ENTRY: 'CHORD_LAB_SONG_ENTRY_V1',
  /** 当前活动歌曲 id */
  ACTIVE_SONG_ID: 'CHORD_LAB_ACTIVE_SONG_ID_V1',
  /** 乐谱排序方式：manual / title / createdAt */
  SONGS_SORT_METHOD: 'CHORD_LAB_SONGS_SORT_METHOD_V1',

  // ---- 谱面视图偏好 ----
  /** 谱面字号缩放 */
  SCORE_FONT_SCALE: 'CHORD_LAB_SCORE_FONT_SCALE_V1',
  /** 谱面内嵌指板缩放 */
  SCORE_FRETBOARD_SCALE: 'CHORD_LAB_SCORE_FRETBOARD_SCALE_V1',
  /** 谱面字号缩放 */
  SCORE_SCALE: 'CHORD_LAB_SCORE_SCALE_V1',
  /** 谱面行高缩放 */
  SCORE_LINE_HEIGHT_SCALE: 'CHORD_LAB_SCORE_LINE_HEIGHT_SCALE_V1',
  /** 谱面网格对齐（和弦自动吸附到字符正上方） */
  SCORE_SNAP_TO_GRID: 'CHORD_LAB_SCORE_SNAP_TO_GRID_V1',
  /** 谱面行间距基准（rem） */
  SCORE_LINE_GAP: 'CHORD_LAB_SCORE_LINE_GAP_V1',
  /** 谱面段落间距基准（rem） */
  SCORE_SECTION_GAP: 'CHORD_LAB_SCORE_SECTION_GAP_V1',
  /** 谱面左右边距基准（rem） */
  SCORE_PAGE_PADDING: 'CHORD_LAB_SCORE_PAGE_PADDING_V1',
  /** 左侧栏开合状态 */
  UI_LEFT_OPEN: 'CHORD_LAB_UI_LEFT_OPEN',
} as const;

// ===================== 界面提示 / 交互延时 =====================
/** Toast 默认展示时长（ms） */
export const TOAST_DEFAULT_DURATION_MS = 3000;
/** 聚焦默认延迟（ms，v-focus 未指定 delay 时使用） */
export const FOCUS_DEFAULT_DELAY_MS = 60;
/** 悬浮提示隐藏后清理 DOM 的延迟（ms，配合淡出过渡，v-tooltip 使用） */
export const TOOLTIP_HIDE_CLEANUP_DELAY_MS = 180;
/**
 * 交互式 tooltip 的隐藏最小延迟（ms，v-tooltip 使用）。
 * 交互式浮层需允许鼠标从触发元素「跨过间隙」移入浮层本身，
 * 因此离开触发元素时不能瞬时收起，必须留出一个时间窗；缺省 hideDelay 时取此值。
 */
export const TOOLTIP_INTERACTIVE_MIN_HIDE_DELAY_MS = 200;

/** 滚动位置恢复动画：最长恢复时长（ms，v-scroll-cache 使用） */
export const SCROLL_RESTORE_MAX_DURATION_MS = 1200;
/** 滚动位置恢复动画：额外缓冲（ms，防止 resize 观察器回调在超时前未触发） */
export const SCROLL_RESTORE_BUFFER_MS = 200;

/** 跑马灯 continuous 模式：最小单程时长（ms） */
export const MARQUEE_MIN_DURATION_CONTINUOUS_MS = 800;
/** 跑马灯 pingpong 模式：最小单程时长（ms） */
export const MARQUEE_MIN_DURATION_PINGPONG_MS = 500;
/** 跑马灯 fade 模式：默认羽化宽度（px） */
export const MARQUEE_DEFAULT_FADE_WIDTH = 16;
/** 跑马灯停用后平滑复位到起始位的动画时长（ms） */
export const MARQUEE_RESET_DURATION_MS = 240;
/** 跑马灯平滑复位缓动（ease-out-cubic，起步快收尾缓） */
export const MARQUEE_RESET_EASING = 'cubic-bezier(0.33, 1, 0.68, 1)';

/** 右键菜单已打开时换位动画时长（ms，WAAPI 实现） */
export const CONTEXT_MENU_REPOSITION_DURATION_MS = 80;
/** 右键菜单换位动画缓动（与 tokens.scss 的 $bezier-standard 一致） */
export const CONTEXT_MENU_REPOSITION_EASING = 'cubic-bezier(0.25, 0.1, 0.25, 1)';

// ===================== 导出 / 预览微调 =====================
/** 触发 Blob 下载后延迟释放对象 URL 的时间（ms，score-export 使用） */
export const URL_REVOKE_DELAY_MS = 1000;
/** 乐谱预览 A4 分页重新生成的防抖间隔（ms） */
export const SCORE_PREVIEW_DEBOUNCE_MS = 150;

// ===================== 浮层默认延时 =====================
/** Popover 悬停关闭默认延迟（ms） */
export const POPOVER_HOVER_CLOSE_DELAY_MS = 150;

// ===================== 和弦槽位 / 横按交互 =====================
/** 横按提示箭头颜色过渡时长（ms，FretboardSvg 计算样式） */
export const BARRE_ARROW_TRANSITION_MS = 150;

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

// ===================== 线上云端同步配置 =====================
/** 线上云端同步服务配置（由 Vite 构建环境注入） */
export const CLOUD_SYNC_CONFIG = {
  /** 服务端接口地址（优先读取环境变量 VITE_SYNC_SERVER_URL，默认为线上 Cloudflare Worker 接口） */
  SERVER_URL:
    (import.meta.env['VITE_SYNC_SERVER_URL'] as string | undefined) || 'https://fret-logic.server-lookie.workers.dev/',
  /** 当前构建模式（如 'development' | 'production'） */
  MODE: import.meta.env.MODE,
  /** 是否为开发环境构建 */
  IS_DEV: import.meta.env.DEV,
} as const;

// ===================== GitHub 同步预设 =====================
/** GitHub 同步预设配置（根据构建模式分流目标分支） */
export const GITHUB_SYNC_CONFIG = {
  DEFAULT_OWNER: 'lo0kie',
  DEFAULT_REPO: 'FretLogic',
  DEFAULT_BRANCH: import.meta.env.DEV ? 'dev-data-sync' : 'data-sync',
  DEFAULT_PATH: 'backup/chords.json',
} as const;

// ===================== Gitee 同步预设 =====================
/** Gitee 同步预设配置（开发/生产分别走专用数据分支，避免备份提交污染主分支） */
export const GITEE_SYNC_CONFIG = {
  DEFAULT_OWNER: 'look1e',
  DEFAULT_REPO: 'fret-logic',
  DEFAULT_BRANCH: import.meta.env.DEV ? 'dev-data-sync' : 'data-sync',
  DEFAULT_PATH: 'backup/chords.json',
} as const;

// ===================== WebDAV 同步预设 =====================
/** WebDAV 同步预设配置 */
export const WEBDAV_SYNC_CONFIG = {
  /** 默认预设 CORS 代理地址 */
  DEFAULT_PROXY_URL: 'https://proxy.server-lookie.workers.dev/',
} as const;
