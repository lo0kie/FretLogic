/**
 * 三主题汇总。对象键序即 CSS 输出顺序（浅色 → 深色 → 高对比），与接管前的 tokens.scss 一致。
 */
import { DARK_THEME } from './dark';
import { HIGH_CONTRAST_THEME } from './high-contrast';
import { LIGHT_THEME } from './light';

import type { ThemeName, ThemeSource } from '../types';

/** 主题源 */
export const THEMES: Record<ThemeName, ThemeSource> = {
  'light': LIGHT_THEME,
  'dark': DARK_THEME,
  'high-contrast': HIGH_CONTRAST_THEME,
};

/** 主题 → CSS 选择器（与接管前 tokens.scss 的三个块一一对应） */
export const THEME_SELECTORS: Record<ThemeName, string> = {
  'light': ':root',
  'dark': '.dark',
  'high-contrast': "[data-theme='high-contrast']",
};
