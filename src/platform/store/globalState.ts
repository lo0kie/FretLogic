/**
 * 全局状态：主题模式与外观偏好。
 */
import { computed } from 'vue';

import { useTheme } from '@/platform/composables/useTheme';

const theme = useTheme();

export const globalDarkMode = computed(() => theme.isDark.value);

/** 设置主题模式（亮色/暗色/跟随系统），委托 useTheme 写入偏好。 */
export const setThemeMode = (mode: Parameters<typeof theme.setTheme>[0]) => {
  theme.setTheme(mode);
};

export const themePreference = theme.preference;
