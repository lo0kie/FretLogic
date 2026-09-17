/**
 * 统一主题管理：light / dark / high-contrast / auto（跟随系统）。
 *
 * 实现方式：在 `<html>` 上设置 `data-theme` 属性；dark 同时挂载 `.dark` class
 * （tokens.scss 的暗色选择器与组件中 `:is-dark-mode` 布尔判断均依赖）。
 *
 * 持久化说明：偏好存 cookie 而非 IDB —— IDB 只有异步 API，而首帧必须在 HTML 解析期
 * （index.html 内联脚本，同样读不到 IDB）就拿到主题，否则必然闪白。cookie 是唯一
 * 同步可读的持久化途径；历史持久化的偏好由 initTheme 时从 kv 镜像迁移。
 */
import { computed, ref, watchEffect } from 'vue';

import { useMediaQuery } from '@vueuse/core';

import { kvGet } from '@/platform/services/storage/idbKv';

export type ThemeMode = 'light' | 'dark' | 'high-contrast';
export type ThemePreference = ThemeMode | 'auto';

/** cookie 键（沿用历史键名，便于迁移对照） */
const PREFERENCE_KEY = 'fret-logic:theme-preference';

const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');

/** 当前生效的主题（已解析 auto） */
const activeTheme = ref<ThemeMode>('light');

const isThemePreference = (raw: string | undefined | null): raw is ThemePreference =>
  raw === 'light' || raw === 'dark' || raw === 'high-contrast' || raw === 'auto';

const writeCookie = (pref: ThemePreference): void => {
  document.cookie = `${PREFERENCE_KEY}=${pref}; path=/; max-age=31536000; samesite=lax`;
};

/** 从 cookie 读取偏好；历史持久化值（经旧数据转录进了 kv 镜像）作为兜底并迁移进 cookie */
function readPreference(): ThemePreference {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${PREFERENCE_KEY}=([^;]*)`));
    if (isThemePreference(match?.[1])) return match[1];
  } catch {
    /* cookie 不可用时走 kv 兜底 */
  }
  try {
    const raw = kvGet(PREFERENCE_KEY);
    if (isThemePreference(raw)) {
      // 历史迁移：首次从 kv 镜像读到旧偏好时写进 cookie，此后以 cookie 为准
      writeCookie(raw);
      return raw;
    }
  } catch {
    /* kv 镜像不可用时回退 auto */
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

/** cookie 写入门禁：initTheme（含 kv 历史值迁移）完成前不落 cookie，
 *  避免模块加载期的初始默认值抢先覆盖「cookie 缺失但 kv 有历史值」的迁移路径 */
let persistenceEnabled = false;

const preference = ref<ThemePreference>(readPreference());

/**
 * 统一响应偏好与系统明暗变化：
 * - pref 为 auto 时，Vue 动态追踪 prefersDark 并自适应更新；
 * - pref 为具体主题时短路求值，自动解除对 prefersDark 的依赖；
 * - immediate 执行，初始化自动应用；cookie 写入在 initTheme 完成后开启。
 */
watchEffect(() => {
  const pref = preference.value;
  apply(resolve(pref));
  if (!persistenceEnabled) return;
  try {
    writeCookie(pref);
  } catch {
    /* 忽略写入失败 */
  }
});

/** 立即初始化（应用装配层在转录完成后调用）：重读偏好（含 kv 历史值迁移）并应用 */
function initTheme() {
  const migrated = readPreference();
  persistenceEnabled = true;
  // 值未变化时 watchEffect 不重跑，cookie 需在此显式落盘（kv 迁移路径的首次写入）
  if (preference.value === migrated) writeCookie(migrated);
  preference.value = migrated;
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
