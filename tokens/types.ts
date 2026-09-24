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
 * 下列算子覆盖现状里全部「可由公式得出」的颜色；不在其中的颜色就是字面量，
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
  | { readonly kind: 'shade'; readonly source: string; readonly weight: number }
  /**
   * 与**纯白**混合：weight 即白的占比（0..100），逐通道 round-half-to-even。
   * 三支同源家族由此成形：tint 朝**主题底色**走（随主题变淡 / 变暗），shade 朝**黑**走、lift 朝**白**走。
   * 后两支的锚点是绝对色，故**不随主题漂移**——这正是「实心档的悬停 / 按下」要的语义：
   * 亮色与暗色下都应当「更亮一点 / 更暗一点」，而不是「朝各自底色靠」。
   * 此前这类状态由 `filter: brightness()` 现算，产物的真实色值既不可审查、也上不了对比度门禁。
   */
  | { readonly kind: 'lift'; readonly source: string; readonly weight: number }
  /**
   * 实心档：把源色朝**纯黑**压深到「纯白落在其上达到 AA 正文门槛（4.5:1）」的**最小**整数档。
   *
   * 与 shade 的差别是**档位的来源**：shade 的档位是观感档（人挑的 12%），本算子的档位是
   * **结果档** —— 由对比度门槛反推。所以三主题各自算出不同的压深量，却不是「按主题手工覆盖
   * 某一档」（那是本目录明令禁止的）：三处声明指向的是**同一个门槛**，压深量只是源色明度的函数。
   *
   * 为什么非它不可：白字要在饱和强调色上承载**文字**，底色就必须够深，而各主题强调色的明度
   * 相差很大（亮色 primary 白字 4.02:1，HC primary 只有 2.62:1）。用 shade 手挑一个档位，
   * 要么三主题里有两个不达标，要么就得写三份不同的重量 —— 后者正是「同族同档在不同主题下口径
   * 不一」。本算子让「白字可读」这件事只有一个口径：门槛。
   *
   * 用途：实心强调色底要承载文字的场合（徽章 filled / 勾选框勾选态）。不承载文字的实心底
   * （开关轨道）不需要它，直接配 --text-on-accent 深墨即可。
   */
  | { readonly kind: 'solid'; readonly source: string };

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
