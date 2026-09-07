/**
 * 全局常量集中管理。
 * 由原先分散在 src/constants/* 的模块合并而来，按领域分组。
 */
import { computed, ref } from 'vue';

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
  /** 最近编辑乐谱 id（冷启动回灌种子，非选中态本身） */
  LAST_SONG_ID: 'CHORD_LAB_LAST_SONG',
  /** 最近编辑分组 id（冷启动回灌种子，非选中态本身） */
  LAST_GROUP_ID: 'CHORD_LAB_LAST_GROUP',
  /** 最近乐谱页主 Tab（冷启动回灌种子，仅配合 LAST_SONG 恢复入口生效，非选中态本身） */
  LAST_ACTIVE_TAB: 'CHORD_LAB_LAST_SCORE_TAB',

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
  /** 工作台：多指法变体面板是否收起折叠（持久化） */
  WORKBENCH_VARIANTS_COLLAPSED: 'CHORD_LAB_WORKBENCH_VARIANTS_COLLAPSED_V1',
  /** 工作台：导出面板背景模式（transparent / white / dark） */
  WORKBENCH_EXPORT_BG: 'CHORD_LAB_WORKBENCH_EXPORT_BG_V1',
  /** 工作台：右侧卡片列面板排序顺序（持久化） */
  WORKBENCH_PANEL_ORDER: 'CHORD_LAB_WORKBENCH_PANEL_ORDER_V1',
  /** 乐谱：是否启用和弦名简写（如 maj7->M7, dim->° 等） */
  SCORE_CHORD_SHORTHAND: 'CHORD_LAB_SCORE_CHORD_SHORTHAND_V1',
  /** 乐谱：排版对齐方式（start 起始位置 / center 居中对齐） */
  SCORE_LAYOUT_ALIGN: 'CHORD_LAB_SCORE_LAYOUT_ALIGN_V1',
  /** 音频试听可调参数（音色 / 弦间间隔 / 扫弦方向 / 音量 / 力度随机） */
  AUDIO_PLAYBACK: 'CHORD_LAB_AUDIO_PLAYBACK_V1',

  // ---- 歌曲数据（按歌曲拆键持久化） ----
  /** [已废弃 / 历史迁移源] 旧版歌曲单键整表数据（仅用于从早期版本向分片结构迁移，运行时不再读写） */
  SONGS: 'CHORD_LAB_SONGS_V1',
  /** 歌曲有序 id 索引（维护歌曲顺序） */
  SONGS_INDEX: 'CHORD_LAB_SONGS_INDEX_V1',
  /** 单曲独立键前缀（前缀:歌曲id 格式，按歌分片存储） */
  SONG_ENTRY: 'CHORD_LAB_SONG_ENTRY_V1',
  /** 乐谱排序方式：manual / title / createdAt */
  SONGS_SORT_METHOD: 'CHORD_LAB_SONGS_SORT_METHOD_V1',

  // ---- 谱面视图偏好 ----
  /** 谱面字号缩放 */
  SCORE_FONT_SCALE: 'CHORD_LAB_SCORE_FONT_SCALE_V1',
  /** 谱面内嵌指板缩放 */
  SCORE_FRETBOARD_SCALE: 'CHORD_LAB_SCORE_FRETBOARD_SCALE_V1',
  /** 预览：是否自适应满高 */
  SCORE_PREVIEW_FIT_MODE: 'CHORD_LAB_SCORE_PREVIEW_FIT_MODE_V1',
  /** 预览：自定义缩放百分比 */
  SCORE_PREVIEW_ZOOM_PERCENT: 'CHORD_LAB_SCORE_PREVIEW_ZOOM_PERCENT_V1',
  /** 乐谱：是否绘制大横按 */
  SCORE_SHOW_BARRE: 'CHORD_LAB_SCORE_SHOW_BARRE_V1',
  /** 预览/导出：歌词字重（light 细 / regular 常规 / bold 粗） */
  SCORE_LYRICS_FONT_WEIGHT: 'CHORD_LAB_SCORE_LYRICS_FONT_WEIGHT_V1',
  /** 预览/导出：JPEG 压缩质量百分比（30~100，默认 95） */
  SCORE_EXPORT_QUALITY: 'CHORD_LAB_SCORE_EXPORT_QUALITY_V1',
  /** 预览/导出：页边距（px，按标准档位 窄/标准/宽 选择，默认 56px 标准） */
  SCORE_PAGE_MARGIN: 'CHORD_LAB_SCORE_PAGE_MARGIN_V1',
  /** 预览/导出：标准单页尺寸档位（a4 / a5 / letter，默认 a4） */
  SCORE_PAGE_SIZE: 'CHORD_LAB_SCORE_PAGE_SIZE_V1',
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
/** 警告类 Toast 展示时长（ms）：内容较多需要更长阅读时间 */
export const TOAST_WARNING_DURATION_MS = 4000;
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

/** 跑马灯 continuous 模式：最小单程时长（ms） */
export const MARQUEE_MIN_DURATION_CONTINUOUS_MS = 800;
/** 跑马灯 pingpong 模式：最小单程时长（ms） */
export const MARQUEE_MIN_DURATION_PINGPONG_MS = 500;
/** 跑马灯 fade 模式：默认羽化宽度（px） */
export const MARQUEE_DEFAULT_FADE_WIDTH = 16;
/** 跑马灯 fast 修饰符：相对默认速度的倍率 */
export const MARQUEE_FAST_SPEED_MULTIPLIER = 2;
/** 跑马灯停用后平滑复位到起始位的动画时长（ms） */
export const MARQUEE_RESET_DURATION_MS = 240;
/** 跑马灯平滑复位缓动（ease-out-cubic，起步快收尾缓） */
export const MARQUEE_RESET_EASING = 'cubic-bezier(0.33, 1, 0.68, 1)';
/** 跑马灯两端羽化的过渡时长（ms）：贴边/离开贴边时渐隐以该时长平滑淡入淡出 */
export const MARQUEE_FADE_TRANSITION_MS = 200;

/** v-scrollbar 判定「scroll 事件是否由用户交互发起」的时间窗口（ms）：窗口内算用户滚动，
 *  否则视为浏览器布局钳位 / 程序化设位，消费端可据此过滤非用户触发的滚动信号 */
export const SCROLL_INTERACTIVE_WINDOW_MS = 120;

/** 右键菜单已打开时换位动画时长（ms，WAAPI 实现） */
export const CONTEXT_MENU_REPOSITION_DURATION_MS = 80;
/** 右键菜单换位动画缓动（与 tokens.scss 的 $bezier-standard 一致） */
export const CONTEXT_MENU_REPOSITION_EASING = 'cubic-bezier(0.25, 0.1, 0.25, 1)';

// ===================== 浮层默认延时 =====================
/** Popover 悬停关闭默认延迟（ms） */
export const POPOVER_HOVER_CLOSE_DELAY_MS = 150;

// ===================== 文字传递格式 =====================
/** 跨实例文字传递格式：魔数与版本，供 textCodec 识别/校验 */
export const TEXT_FORMAT = {
  /** 和弦文本魔数 */
  CHORD: 'FLCHORD',
  /** 乐谱文本魔数 */
  SONG: 'FLSONG',
  /** 分组文本魔数（分组名 + 排序规则 + 组内和弦行） */
  GROUP: 'FLGROUP',
  /** 当前格式版本 */
  VERSION: 1,
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

// ===================== 音频试听默认参数 =====================
/** 音频试听设置的唯一默认值真源：settingsStore 初始值与 app 层音频引擎兜底值均从此引用（platform↛app，故下沉于此） */
export const AUDIO_SETTINGS_DEFAULTS = {
  /** 扫弦时相邻弦触发间隔（ms） */
  strumDelayMs: 60,
  /** 主音量（dB） */
  volumeDb: -8,
  /** 混响干湿比（0~100 百分制） */
  reverbWet: 20,
} as const;

// ===================== 路由路径 =====================
/** 应用路由路径唯一真源（router 定义与各层判断/跳转均从此引用，改路径只动这里） */
export const ROUTE_PATHS = {
  WORKBENCH: '/workbench',
  SCORE: '/score',
} as const;
