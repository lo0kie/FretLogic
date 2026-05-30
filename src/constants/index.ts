export const STORAGE_KEYS = {
  CHORD_LIST: 'CHORD_LAB_LIST_V4',
  GROUPS: 'CHORD_LAB_GROUPS',
  CURR_NAME: 'CHORD_LAB_CURR_NAME_V1',
  CURR_FRETS: 'CHORD_LAB_CURR_FRETS_V1',
  CURR_FCOUNT: 'CHORD_LAB_CURR_FCOUNT_V1',
  CURR_CAPO: 'CHORD_LAB_CURR_CAPO_V1',
  CURR_ROOT_MARK: 'CHORD_LAB_CURR_ROOT_MARK_V1',
  CURR_USE_FLAT: 'CHORD_LAB_CURR_USE_FLAT_V1',
  EDITING_ID: 'CHORD_LAB_EDITING_ID',
  CURR_GROUP_ID: 'CHORD_LAB_CURR_GROUP_ID_V1',
} as const;

const STRING_SPACING = 65; // 竖线（琴弦）间距
const OFFSET_X = 45; // 左侧留白偏移（从画布左侧到第 6 弦的距离）
const OFFSET_X_RIGHT = 31; // 右侧留白偏移（从第 1 弦到画布右侧的距离）

const FRET_HEIGHT = 120; // 品位高度
const OFFSET_Y_TOP = 80; // 顶部留白（放置空弦/静音音符区域）
const OFFSET_Y_BOTTOM = 20; // 底部边缘留白

export const CANVAS_CONFIG = {
  STRING_SPACING,
  FRET_HEIGHT,
  OFFSET_X,
  OFFSET_Y_TOP,
  OFFSET_Y_BOTTOM,
  BOARD_WIDTH: OFFSET_X + 5 * STRING_SPACING + OFFSET_X_RIGHT,
} as const;

export type ModalActionType = 'createGroup' | 'renameGroup' | 'deleteGroup' | 'moveChord' | '';

export const DEFAULT_CHORD_NAME = '未命名';

export const SIDEBAR_WIDTH = 335; // 侧边栏统一物理宽度
export const SIDEBAR_WIDTH_PIXEL = `${SIDEBAR_WIDTH}px`; // 侧边栏统一物理宽度
