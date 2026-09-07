/**
 * 离屏指板画布/导出图的配色解析。
 *
 * 颜色单一来源是 tokens.scss 的 --fbc-* CSS 变量（明暗主题块各自定义）；
 * canvas 2D 与 Worker 无法直接消费 var()，故在主线程运行时解析为具体色值：
 * - FretboardCanvas.vue：主题切换时重新解析并重绘
 * - scoreExportWorker：主线程解析后随导出消息传入（Worker 内无 DOM）
 */

/** 画布/导出配色（键与 tokens.scss 的 --fbc-* 后缀一一对应） */
export interface FretboardCanvasPalette {
  /** 画布背景 */
  BG: string;
  /** 和弦名主文字 */
  TEXT: string;
  /** 品号等次级文字 */
  SUB_TEXT: string;
  /** 分隔线 */
  DIVIDER: string;
  /** 指板网格线 */
  FB_LINE: string;
  /** 琴枕 */
  FB_NUT: string;
  /** 音符标记 */
  FB_NOTE: string;
  /** 空弦圆圈 */
  FB_OPEN: string;
  /** 横按梁 */
  FB_BARRE: string;
  /** 静音叉 */
  FB_MUTE: string;
}

/** 调色板键 → CSS 变量名映射（单一映射源，新增配色只需加一行） */
const PALETTE_VAR_MAP: Record<keyof FretboardCanvasPalette, string> = {
  BG: '--fbc-bg',
  TEXT: '--fbc-text',
  SUB_TEXT: '--fbc-sub-text',
  DIVIDER: '--fbc-divider',
  FB_LINE: '--fbc-line',
  FB_NUT: '--fbc-nut',
  FB_NOTE: '--fbc-note',
  FB_OPEN: '--fbc-open',
  FB_BARRE: '--fbc-barre',
  FB_MUTE: '--fbc-mute',
};

/** 从根元素读取当前级联下的调色板 */
const readPaletteFrom = (root: Element): FretboardCanvasPalette => {
  const computedStyle = getComputedStyle(root);
  const palette = {} as FretboardCanvasPalette;
  for (const [key, varName] of Object.entries(PALETTE_VAR_MAP)) {
    palette[key as keyof FretboardCanvasPalette] = computedStyle.getPropertyValue(varName).trim();
  }
  return palette;
};

/**
 * 解析指定主题的画布配色。
 *
 * 约束：--fbc-* 变量在 tokens.scss 的 :root 必有定义，正常返回值恒非空；
 * 仅在无样式表的测试环境（jsdom）下可能得到空串，调用方无需 fallback。
 *
 * @param theme 缺省时读取当前生效主题（FretboardCanvas 主题切换重绘场景）；
 *              显式传入时同步换装 `<html>` 的 data-theme/.dark 读取后再恢复，
 *              全程无中间绘制（getComputedStyle 强制同步样式重算），供导出面板
 *              在任意应用主题下固定导出亮/暗配色。
 */
export const resolveFretboardCanvasPalette = (theme?: 'light' | 'dark' | 'high-contrast'): FretboardCanvasPalette => {
  // Node 测试环境无 DOM：返回空串调色板（调用方仅为导出 Worker，测试不会消费颜色值）
  if (typeof document === 'undefined') {
    const emptyPalette = {} as Record<keyof FretboardCanvasPalette, string>;
    for (const key of Object.keys(PALETTE_VAR_MAP)) {
      emptyPalette[key as keyof FretboardCanvasPalette] = '';
    }
    return emptyPalette;
  }

  const root = document.documentElement;
  if (!theme) return readPaletteFrom(root);

  const prevTheme = root.getAttribute('data-theme');
  const prevDark = root.classList.contains('dark');
  root.setAttribute('data-theme', theme);
  root.classList.toggle('dark', theme === 'dark');
  const palette = readPaletteFrom(root);
  if (prevTheme === null) root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', prevTheme);
  root.classList.toggle('dark', prevDark);
  return palette;
};
