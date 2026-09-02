/**
 * 全局状态：主题模式与外观偏好。
 */
import { computed } from 'vue';

import { useTheme } from '@/shared/composables/useTheme';

const theme = useTheme();

export const globalDarkMode = computed(() => theme.isDark.value);

/** 设置主题模式（亮色/暗色/跟随系统），委托 useTheme 写入偏好。 */
export const setThemeMode = (mode: Parameters<typeof theme.setTheme>[0]) => {
  theme.setTheme(mode);
};

export const themePreference = theme.preference;

/** 切换主题：传入指定模式则直接设置，否则在亮/暗之间取反。 */
export function toggleDarkMode(mode?: 'light' | 'dark' | 'auto') {
  if (mode) {
    theme.setTheme(mode);
  } else {
    theme.toggleDark();
  }
}
