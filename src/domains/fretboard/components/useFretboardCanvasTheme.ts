import { ref, toValue, watch } from 'vue';

import { activeTheme } from '@/platform/composables/useTheme';
import { resolveFretboardCanvasPalette } from '@/platform/utils/canvasPalette';

import type { ThemeMode } from '@/platform/composables/useTheme';

/** 画布配色主题（与 props.theme 同域；未传时跟随应用主题）。
 *  直接别名 `ThemeMode` 而非重抄一份字面量联合：画布配色的值域就是应用主题的值域，
 *  重抄一份的代价是新增第四档主题时这里静默不认（画布仍按旧档位配色）。 */
export type FretboardCanvasThemeName = ThemeMode;

/**
 * 指板画布的配色：从 tokens.scss 的 `--fbc-*` 变量运行时解析（canvas 2D 无法直接消费 var()），
 * 并在配色来源变化时刷新 + 触发一次重绘。
 *
 * 两条不变量：
 * ① **两条 watch 缺一不可**。仅靠 isDarkMode 接不住 light ↔ high-contrast：两者都算「非 dark」，
 *    isDarkMode 不变，但 `--fbc-*` 与 high-contrast 配色是不同的。故除了「显式 theme / isDarkMode
 *    变化」这条，还要单独跟随 activeTheme。
 * ② **显式指定 theme 的场合跳过应用主题**（导出面板固定白/暗底以匹配其背景，不该受应用明暗影响）。
 */
export function useFretboardCanvasTheme({
  theme,
  isDarkMode,
  onRedraw,
}: {
  theme: () => FretboardCanvasThemeName | undefined;
  isDarkMode: () => boolean;
  onRedraw: () => void;
}) {
  const resolveThemeColors = () => {
    const explicit = theme();
    return explicit ? resolveFretboardCanvasPalette(explicit) : resolveFretboardCanvasPalette();
  };
  const themeColors = ref(resolveThemeColors());

  /**
   * 主题切换时重新解析配色再重绘。
   *
   * 合成**单条** watch：拆成「[isDarkMode, theme]」与「activeTheme」两条时，非显式 theme 的
   * 应用主题切换会同时命中两条，同一次切换解析并重绘两遍。
   * 后两个源在显式 theme 存在时恒为 null 且短路不求值 —— 此时配色只由 theme 决定，应用主题
   * （含 light ↔ high-contrast 这类 isDarkMode 不变的切换）不参与，见上方不变量 ②。
   * `isDarkMode` 也必须走同一道短路：否则显式 theme 的应用里翻转 isDarkMode（系统深浅色切换）
   * 仍会整条命中，重解析一次配色并全量 draw()，而 resolveThemeColors() 在显式档下返回的是
   * 同一个调色板 —— 白付一次重绘。
   */
  watch([() => (theme() ? null : isDarkMode()), theme, () => (theme() ? null : toValue(activeTheme))], () => {
    themeColors.value = resolveThemeColors();
    onRedraw();
  });

  return { themeColors };
}
