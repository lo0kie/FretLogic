/**
 * 全局状态：主题模式与外观偏好。
 */
import { useTheme } from '@/composables/app/useTheme';
import { computed } from 'vue';

const theme = useTheme();

export const globalDarkMode = computed(() => theme.isDark.value);

export const setThemeMode = (mode: Parameters<typeof theme.setTheme>[0]) => {
  theme.setTheme(mode);
};

export const themePreference = theme.preference;

export function toggleDarkMode(mode?: 'light' | 'dark' | 'auto') {
  if (mode) {
    theme.setTheme(mode);
  } else {
    theme.toggleDark();
  }
}
