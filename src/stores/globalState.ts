import { useTheme } from '@/composables/useTheme';
import { STORAGE_KEYS } from '@/utils/constants';
import { useStorage } from '@vueuse/core';
import { computed } from 'vue';

/** 控制整个应用歌词/和弦是否可编辑（false = 仅预览） */
export const isGlobalEditable = useStorage(STORAGE_KEYS.IS_GLOBAL_EDITABLE, true);

export function toggleEditable() {
  isGlobalEditable.value = !isGlobalEditable.value;
}

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
