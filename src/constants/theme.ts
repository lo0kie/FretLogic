/** 指板配色（明暗双主题） */
export const FRETBOARD_COLORS = {
  /** 根音圆点（浅色主题） */
  rootLight: '#d89a3d',
  /** 根音圆点（深色主题） */
  rootDark: '#d6a447',

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
