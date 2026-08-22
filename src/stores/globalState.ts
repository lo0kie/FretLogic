import { STORAGE_KEYS } from '@/constants';
import { useTheme } from '@/core/theme';
import { useStorage } from '@vueuse/core';
import { computed } from 'vue';

/** 控制整个应用歌词/和弦是否可编辑（false = 仅预览） */
export const isGlobalEditable = useStorage(STORAGE_KEYS.IS_GLOBAL_EDITABLE, true);

export function toggleEditable() {
  isGlobalEditable.value = !isGlobalEditable.value;
}

/**
 * 全局暗色状态：委托给 core/theme（单一来源）。
 * 兼容旧组件中的 `globalDarkMode` 布尔判断；high-contrast 亦视为暗色。
 */
const theme = useTheme();
export const globalDarkMode = computed(() => theme.isDark.value);

export function toggleDarkMode() {
  theme.toggleDark();
}

/** 显式设置主题（light/dark/high-contrast/auto），供设置界面使用 */
export const setThemeMode = theme.setTheme;
export const themePreference = theme.preference;
