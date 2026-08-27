/**
 * 统一主题管理：light / dark / high-contrast / auto（跟随系统）。
 *
 * 实现方式：在 `<html>` 上设置 `data-theme` 属性；dark 同时保留 `.dark` class
 * （兼容现有组件中 `:is-dark-mode` 的布尔判断与旧样式选择器）。
 */
import { useMediaQuery } from '@vueuse/core';
import { computed, ref, watch } from 'vue';

export type ThemeMode = 'light' | 'dark' | 'high-contrast';
export type ThemePreference = ThemeMode | 'auto';

const PREFERENCE_KEY = 'fret-logic:theme-preference';

const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');

/** 当前生效的主题（已解析 auto） */
const activeTheme = ref<ThemeMode>('light');

function readPreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(PREFERENCE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'high-contrast' || raw === 'auto') return raw;
  } catch {
    /* localStorage 不可用时回退 auto */
  }
  return 'auto';
}

function resolve(pref: ThemePreference): ThemeMode {
  if (pref === 'auto') return prefersDark.value ? 'dark' : 'light';
  return pref;
}

function apply(mode: ThemeMode) {
  const root = document.documentElement;
  root.setAttribute('data-theme', mode);
  // 兼容旧逻辑：.dark class 与 data-theme="dark" 等价
  root.classList.toggle('dark', mode === 'dark');
  activeTheme.value = mode;
}

const preference = ref<ThemePreference>(readPreference());

function refresh() {
  apply(resolve(preference.value));
}

watch(
  () => preference.value,
  () => {
    refresh();
    try {
      localStorage.setItem(PREFERENCE_KEY, preference.value);
    } catch {
      /* 忽略写入失败 */
    }
  }
);

// 跟随系统自动切换（仅 auto 模式生效）
watch(
  () => prefersDark.value,
  () => {
    if (preference.value === 'auto') refresh();
  }
);

/** 立即初始化（应用入口调用） */
function initTheme() {
  refresh();
}

const isDark = computed(() => activeTheme.value !== 'light');

function setTheme(pref: ThemePreference) {
  preference.value = pref;
  apply(resolve(pref));
  try {
    localStorage.setItem(PREFERENCE_KEY, pref);
  } catch {
    /* 忽略 */
  }
}

function toggleDark() {
  const next = activeTheme.value === 'dark' ? 'light' : 'dark';
  setTheme(next);
}

export const useTheme = () => ({
  /** 当前生效主题 */
  activeTheme,
  /** 是否处于暗色（dark 或 high-contrast） */
  isDark,
  /** 用户偏好（light/dark/high-contrast/auto） */
  preference,
  /** 初始化（应用启动时调用） */
  initTheme,
  /** 切换偏好 */
  setTheme,
  /** 明暗切换（在 light/dark 间） */
  toggleDark,
});
