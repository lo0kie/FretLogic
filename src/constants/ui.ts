export const KEY_OPTIONS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] ;

export const ACTION_BUTTON_DEFAULTS = {
  VARIANT: 'default' as const,
  SIZE: 'md' as const,
  ROUNDED: 'full' as const,
};

export const BASE_BADGE_DEFAULTS = {
  VARIANT: 'neutral' as const,
  SIZE: 'sm' as const,
  APPEARANCE: 'filled' as const,
  MAX: 99,
};

export const BASE_MODAL_DEFAULTS = {
  WIDTH: 'w-80' as const,
  SHOW_FOOTER: true,
  CANCEL_TEXT: '取消',
  CONFIRM_TEXT: '确认',
  CONFIRM_TYPE: 'primary' as const,
  CLOSE_ON_MASK: true,
};

export const BASE_SELECTOR_DEFAULTS = {
  SIZE: 'md' as const,
  VISIBLE_COUNT: 6,
  DEFAULT_KEY: 'C',
};

export const DEFAULT_GROUP_SORT_RULE = 'ROOT_PITCH' as const;
export const DEFAULT_SORT_KEY = 'C';

export const ID_PREFIXES = {
  GROUP: 'g_',
  CHORD: 'c_',
  SONG: 's_',
  LINE: 'l_',
} as const;

export const MESSAGES = {
  SUCCESS_OPERATION: '操作成功完成',
} as const;
