import { ref, watch } from 'vue';

import { resolveFretboardCanvasPalette } from '@/domains/fretboard/fretboardCanvasPalette';
import { activeTheme } from '@/platform/composables/useTheme';

/** 画布配色主题（与 props.theme 同域；未传时跟随应用主题） */
export type FretboardCanvasThemeName = 'light' | 'dark' | 'high-contrast';

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

  // 主题切换时重新解析配色再重绘（应用主题变化经 isDarkMode 联动；显式 theme 由导出面板传入）
  watch([isDarkMode, theme], () => {
    themeColors.value = resolveThemeColors();
    onRedraw();
  });

  watch(activeTheme, () => {
    if (theme()) return;
    themeColors.value = resolveThemeColors();
    onRedraw();
  });

  return { themeColors };
}
