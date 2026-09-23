/**
 * 根目录颜色令牌源：类型层。
 *
 * ===== 这个目录是什么 =====
 * 全站**颜色**的单一来源。它属于**构建输入**，不是运行时源码：
 * 经 vite.config.ts 读入后由 scripts/vite-plugin-color-tokens.ts 以 `virtual:color-tokens.css`
 * 注入页面，浏览器 bundle 里不存在本目录的任何代码（culori 因此只作 devDependency）。
 *
 * 与 src/assets/tokens.scss 的分工：
 * - 本目录只产出**颜色**（一切含色值的 CSS 自定义属性：背景 / 边框 / 文字 / 功能色 /
 *   指板绘制色 / 画布导出色 / 阴影 / 遮罩 / 滚动条拇指 / tint 派生族）。
 * - tokens.scss 保留**非颜色**令牌（z-index、blur、动效时长与缓动、气泡度量）以及纯 var() 转发
 *   （--bubble-bg、--focus-ring 等）；后者不含色值，注入与否都无意义。
 */

/** 主题名，与 tokens.scss 的三个选择器一一对应（:root / .dark / [data-theme='high-contrast']） */
export type ThemeName = 'light' | 'dark' | 'high-contrast';

/** 可直接写入 CSS 的字面量值 */
export type CssValue = string;

/**
 * 派生指令：值不手写，由 culori 在构建期按声明口径算出。
 *
 * 四条算子覆盖现状里全部「可由公式得出」的颜色；不在这四条里的颜色就是字面量，
 * 直接写在各自的主题文件里——派生只在口径真实存在时使用，不为派生而派生。
 */
export type Derivation =
  /** 源色的 R, G, B 分量串（供 rgba(var(--x-rgb), α) 消费），输出 `0, 122, 255` */
  | { readonly kind: 'rgbChannels'; readonly source: string }
  /**
   * 两色按权重混合，权重和为 100，逐通道 round-half-to-even。
   * weightB = b 的占比（0..100）。例：--bg-panel-subtle = panel-hover 以 50% 合成到 panel 上。
   */
  | { readonly kind: 'mix'; readonly a: string; readonly b: string; readonly weightB: number }
  /**
   * 与**主题底色**混合：baseWeight 即变量名里的 NN（底色占比，越大越接近底色）。
   * 口径：源色占 (100-NN)%、底色占 NN%，逐通道 round-half-to-even。
   */
  | { readonly kind: 'tint'; readonly source: string; readonly baseWeight: number }
  /**
   * 与**纯黑**混合：weight 即黑的占比（0..100），逐通道 round-half-to-even。
   * 与 tint 是同一套口径的两端——tint 朝主题底色走（变淡），shade 朝黑走（压深）。
   * 现状里是 `color-mix(in srgb, <色> 88%, black)` 的等价替换（weight = 12）。
   */
  | { readonly kind: 'shade'; readonly source: string; readonly weight: number };

/** 声明值：字面量或派生指令 */
export type DeclValue = CssValue | Derivation;

/**
 * 一个主题的颜色声明表。
 *
 * 键 = CSS 变量名，键序 = 输出顺序（保持与 tokens.scss 原有的书写顺序一致，便于逐行 diff）。
 * 记录派生指令的变量名一律以 `--` 开头，且其 source / a / b 必须指向**同一主题内**的字面量声明。
 */
export type DeclarationTable = Record<string, DeclValue>;

/** 主题源 */
export interface ThemeSource {
  readonly name: ThemeName;
  /**
   * 合成基底：该主题下 tint 与半透明合成所铺的底色。
   * 同时作为 PWA manifest 的 background_color 来源。
   */
  readonly base: CssValue;
  /** 颜色声明表 */
  readonly declarations: DeclarationTable;
}

/**
 * 单层盒阴影。
 *
 * 拆成「几何 + 颜色 + alpha」而不是整串字面量，是因为阴影里的 rgba 也是颜色，
 * 按本目录的定位应与其他颜色同源同格式产出（同一个 formatRgba）。
 */
export interface ShadowLayer {
  readonly x: number;
  readonly y: number;
  readonly blur: number;
  /** 省略即不输出（现状里只有暗色主题的外圈描边层用到） */
  readonly spread?: number;
  /** 颜色本体（hex） */
  readonly color: CssValue;
  readonly alpha: number;
}
