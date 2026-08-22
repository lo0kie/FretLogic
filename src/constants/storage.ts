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

  // ---- GitHub 同步配置 ----
  /** GitHub 仓库 owner */
  GH_OWNER: 'CHORD_LAB_GH_OWNER',
  /** GitHub 仓库名 */
  GH_REPO: 'CHORD_LAB_GH_REPO',
  /** GitHub 分支 */
  GH_BRANCH: 'CHORD_LAB_GH_BRANCH',
  /** GitHub 存储路径 */
  GH_PATH: 'CHORD_LAB_GH_PATH',

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
  /** 谱面字号缩放 */
  SCORE_FONT_SCALE: 'CHORD_LAB_SCORE_FONT_SCALE_V1',
  /** 谱面内嵌指板缩放 */
  SCORE_FRETBOARD_SCALE: 'CHORD_LAB_SCORE_FRETBOARD_SCALE_V1',
  /** 谱面滚动速度 */
  SCORE_SCROLL_SPEED: 'CHORD_LAB_SCORE_SCROLL_SPEED_V1',
  /** 左侧栏开合状态 */
  UI_LEFT_OPEN: 'CHORD_LAB_UI_LEFT_OPEN',
} as const;
