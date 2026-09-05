/**
 * 统一主题管理：light / dark / high-contrast / auto（跟随系统）。
 *
 * 实现方式：在 `<html>` 上设置 `data-theme` 属性；dark 同时挂载 `.dark` class
 * （tokens.scss 的暗色选择器与组件中 `:is-dark-mode` 布尔判断均依赖）。
 */
import { computed, ref, watchEffect } from 'vue';

import { useMediaQuery } from '@vueuse/core';

export type ThemeMode = 'light' | 'dark' | 'high-contrast';
export type ThemePreference = ThemeMode | 'auto';

const PREFERENCE_KEY = 'fret-logic:theme-preference';

const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');

/** 当前生效的主题（已解析 auto） */
const activeTheme = ref<ThemeMode>('light');

/** 从 localStorage 读取用户主题偏好，异常或非法值回退 auto */
function readPreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(PREFERENCE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'high-contrast' || raw === 'auto') return raw;
  } catch {
    /* localStorage 不可用时回退 auto */
  }
  return 'auto';
}

/** 把用户偏好解析为实际生效主题（auto 跟随系统暗色） */
function resolve(pref: ThemePreference): ThemeMode {
  if (pref === 'auto') return prefersDark.value ? 'dark' : 'light';
  return pref;
}

/** 把主题应用到 <html>（data-theme + dark class）并记录生效主题 */
function apply(mode: ThemeMode) {
  activeTheme.value = mode;
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', mode);
  // tokens.scss 中暗色主题选择器为 `.dark`，与 data-theme="dark" 同步挂载
  root.classList.toggle('dark', mode === 'dark');
}

const preference = ref<ThemePreference>(readPreference());

/**
 * 统一响应偏好与系统明暗变化：
 * - pref 为 auto 时，Vue 动态追踪 prefersDark 并自适应更新；
 * - pref 为具体主题时短路求值，自动解除对 prefersDark 的依赖；
 * - immediate 执行，初始化自动应用并完成 localStorage 同步。
 */
watchEffect(() => {
  const pref = preference.value;
  apply(resolve(pref));
  try {
    localStorage.setItem(PREFERENCE_KEY, pref);
  } catch {
    /* 忽略写入失败 */
  }
});

/** 立即初始化（兼容保留供应用入口调用） */
function initTheme() {
  apply(resolve(preference.value));
}

const isDark = computed(() => activeTheme.value !== 'light');

/** 设置偏好并立即生效（由 watchEffect 自动响应与持久化） */
function setTheme(pref: ThemePreference) {
  preference.value = pref;
}

/** 在 light/dark 间明暗切换（high-contrast 视为非 dark，切到 dark） */
function toggleDark() {
  const next = activeTheme.value === 'dark' ? 'light' : 'dark';
  setTheme(next);
}

/** 主题组合式入口（模块级状态，全局共享同一份偏好与生效主题） */
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

export { activeTheme, initTheme, isDark, preference, setTheme, toggleDark };
