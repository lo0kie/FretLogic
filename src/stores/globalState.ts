import { STORAGE_KEYS } from '@/constants';
import { useDark, useStorage } from '@vueuse/core';

/** 控制整个应用歌词/和弦是否可编辑（false = 仅预览） */
export const isGlobalEditable = useStorage(STORAGE_KEYS.IS_GLOBAL_EDITABLE, true);

export function toggleEditable() {
  isGlobalEditable.value = !isGlobalEditable.value;
}

export const globalDarkMode = useDark({
  attribute: 'class',
  valueDark: 'dark',
  valueLight: '',
  initialValue: 'auto',
});

export function toggleDarkMode() {
  globalDarkMode.value = !globalDarkMode.value;
}
