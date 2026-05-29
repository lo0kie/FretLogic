/**
 * @Author likan
 * @Date 2026-05-29 00:42:05
 * @Filepath fret-logic\src\constants\index.ts
 */

export const STORAGE_KEYS = {
  CHORD_LIST: 'CHORD_LAB_LIST_V4',
  GROUPS: 'CHORD_LAB_GROUPS',
  CURR_NAME: 'CHORD_LAB_CURR_NAME_V1',
  CURR_FRETS: 'CHORD_LAB_CURR_FRETS_V1',
  CURR_FCOUNT: 'CHORD_LAB_CURR_FCOUNT_V1',
  CURR_CAPO: 'CHORD_LAB_CURR_CAPO_V1',
  CURR_ROOT_MARK: 'CHORD_LAB_CURR_ROOT_MARK_V1',
  EDITING_ID: 'CHORD_LAB_EDITING_ID',
  CURR_GROUP_ID: 'CHORD_LAB_CURR_GROUP_ID_V1',
} as const;

export const CANVAS_CONFIG = {
  STRING_SPACING: 76,
  FRET_HEIGHT: 120,
  OFFSET_X: 45,
  OFFSET_Y_TOP: 80,
  OFFSET_Y_BOTTOM: 20,
  BOARD_WIDTH: 456,
} as const;

// 🌟 新增 'moveChord' 弹窗类型
export type ModalActionType = 'createGroup' | 'renameGroup' | 'deleteGroup' | 'moveChord' | '';

export const DEFAULT_CHORD_NAME = '未命名';
