/**
 * 根目录颜色令牌源 —— 入口。
 *
 * ===== 数据流 =====
 *   tokens/themes/*.ts（三主题的颜色声明，字面量 + 派生指令）
 *     → 本文件 generateColorTokensCss()：解析派生指令，拼出三主题的 CSS 文本
 *       → scripts/vite-plugin-color-tokens.ts 以 `virtual:color-tokens.css` 暴露
 *         → src/main.ts 里 import，进 Vite 的 CSS 管线（dev 走 CSS HMR，build 与其余样式一起合并压缩）
 *
 * ===== 为什么放在仓库根目录而不是 src =====
 * 本目录是**构建输入**，不是运行时源码：只有 vite.config.ts 与 vite 插件读它，浏览器 bundle 里
 * 不含其中任何代码（culori 因此可以只作 devDependency）。放在根目录与 data/ 同一约定——
 * 「构建输入/产物不混进 src」。
 *
 * ===== 与 src/assets/tokens.scss 的关系 =====
 * 颜色（含水色值的阴影、遮罩）全部由本目录产出并注入；tokens.scss 只保留非颜色令牌
 * （z-index / blur / 动效 / 气泡度量）与纯 var() 转发。两者合起来仍是「单一来源」：
 * 同一个 CSS 变量只在一边定义。
 */
import { wcagContrast } from 'culori';

import { formatChannels, formatRgbHex, mixRgb, parseRgb } from './color';
import { THEME_SELECTORS, THEMES } from './themes';

import type { Rgb } from './color';
import type { DeclValue, ThemeName, ThemeSource } from './types';

/** shade 算子的混合锚点：纯黑（tint 的锚点是主题底色，见 ThemeSource.base） */
const SHADE_ANCHOR = parseRgb('#000000');

/** lift 算子的混合锚点：纯白（与 shade 成对，两者都是绝对色锚点、故不随主题漂移） */
const LIFT_ANCHOR = parseRgb('#ffffff');

/** solid 算子的判据：白字落在实心档上要达到 WCAG AA 正文门槛 */
const SOLID_INK = '#ffffff';
const SOLID_CONTRAST_TARGET = 4.5;

/**
 * solid 算子：朝纯黑逐档压深，返回白字**恰好**达标的第一个档位所对应的色值。
 *
 * 明度随压深单调下降，故线性扫描即可；压到 100% 即纯黑，白字比值 21:1 必然达标 —— 恒有解，
 * 不需要兜底分支（真跑到 100 才返回的写法会把「门槛被改坏」这件事故意暴露成一条极深的实心档，
 * 而门禁测试会当场报出来）。
 *
 * 对比度交给 culori 现算，与 tokens 的测试同源（判据只有一个，不会出现「构建说达标、测试说不达标」）；
 * 而色值仍由 mixRgb 的整数口径产出 —— culori 在这里只当**判据**，不参与取值，
 * 也就不会把它那套浮点插值引入色值（那正是本目录当初弃用 culori.mix 的原因）。
 */
const readableSolid = (source: Rgb): Rgb => {
  for (let weight = 0; weight < 100; weight += 1) {
    const mixed = mixRgb(source, SHADE_ANCHOR, weight);
    if (wcagContrast(SOLID_INK, formatRgbHex(mixed)) >= SOLID_CONTRAST_TARGET) return mixed;
  }
  return SHADE_ANCHOR;
};

/**
 * 取主题内某个变量的字面量值。
 *
 * 派生指令的 source / a / b 一律指向同主题内的**字面量**声明：若允许指向另一条派生指令，
 * 就形成了一条无人校验的求值链（改一处可能静默改变下游多个色值）。这里直接抛错堵住。
 */
const literalOf = (theme: ThemeSource, name: string): string => {
  const value = theme.declarations[name];
  if (typeof value === 'string') return value;
  throw new Error(`${theme.name} 主题的 ${name} 不是字面量声明（派生源必须指向字面量）`);
};

/** 解析单条声明：字面量原样返回，派生指令按口径算出 */
const resolveValue = (theme: ThemeSource, value: DeclValue): string => {
  if (typeof value === 'string') return value;
  switch (value.kind) {
    case 'rgbChannels':
      return formatChannels(parseRgb(literalOf(theme, value.source)));
    case 'mix':
      return formatRgbHex(
        mixRgb(parseRgb(literalOf(theme, value.a)), parseRgb(literalOf(theme, value.b)), value.weightB)
      );
    case 'tint':
      return formatRgbHex(mixRgb(parseRgb(literalOf(theme, value.source)), parseRgb(theme.base), value.baseWeight));
    case 'shade':
      return formatRgbHex(mixRgb(parseRgb(literalOf(theme, value.source)), SHADE_ANCHOR, value.weight));
    case 'lift':
      return formatRgbHex(mixRgb(parseRgb(literalOf(theme, value.source)), LIFT_ANCHOR, value.weight));
    case 'solid':
      return formatRgbHex(readableSolid(parseRgb(literalOf(theme, value.source))));
  }
};

/** 渲染一个主题块 */
const renderTheme = (theme: ThemeSource): string => {
  const lines = Object.entries(theme.declarations).map(([name, value]) => `  ${name}: ${resolveValue(theme, value)};`);
  return `${THEME_SELECTORS[theme.name]} {\n${lines.join('\n')}\n}`;
};

/**
 * 生成注入页面的完整 CSS 文本（三个主题块）。
 *
 * 输出刻意**不包 @layer**：Tailwind v4 的 @theme 变量输出在 `@layer theme` 内，
 * 而 CSS 的层叠规则是「未分层样式优先于任何 @layer」——保持未分层，才能像接管前的
 * tokens.scss 一样稳定压过 Tailwind 的主题转发（tailwind.css 里 `--color-primary: var(--color-primary)`
 * 这类同名转发若胜出即变成自引用、整族工具类失效）。
 */
export const generateColorTokensCss = (): string => {
  const blocks = Object.values(THEMES).map(renderTheme);
  const banner = [
    '/* ===== 本文件由 Vite 注入（virtual:color-tokens.css），请勿手改 =====',
    '   颜色单一来源是仓库根的 tokens/ 目录；改色请改那里，派生值由 culori 在构建期算出。',
    '   非颜色令牌（z-index / blur / 动效 / 气泡度量）不在此处，见 src/assets/tokens.scss。 */',
  ].join('\n');
  return `${banner}\n\n${blocks.join('\n\n')}\n`;
};

/**
 * 取某主题某个颜色变量的最终值。
 *
 * 供 CSS 管线之外的同源消费方复用（当前是 vite.config.ts 的 PWA manifest 主题色 /
 * 背景色——此前它在 manifest 里手抄了一份 hex，与令牌双源）。
 */
export const resolveColorToken = (themeName: ThemeName, name: string): string => {
  const theme = THEMES[themeName];
  const value = theme.declarations[name];
  if (value === undefined) throw new Error(`主题 ${themeName} 未定义颜色变量 ${name}`);
  return resolveValue(theme, value);
};
