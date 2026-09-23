/**
 * 颜色派生原语（culori）。
 *
 * 只做三件事：把颜色串解析成 0..255 整数通道、按整数口径混合、格式化回 CSS 串。
 *
 * ⚠️ **为什么不用 culori 的 mix / interpolate 直接算**：
 * 现状 tint 的取值口径是「整数分子 ÷100 后 round-half-to-even」，而 culori 的插值走 0..1 浮点，
 * 在 x.5 边界会翻车——实测 HC 的 --tint-borderbase-85 蓝通道真值 41.5，浮点算出 41.49999999999999，
 * Math.round 得 41（正确值 42，由 round-half-to-even 给出）。所以混合全程走整数分子，零浮点误差；
 * culori 负责它真正擅长的部分：颜色解析与格式归一。
 */
import { converter, formatHex, parse } from 'culori';

/** 0..255 整数通道 */
export type Rgb = readonly [number, number, number];

/** 任意 CSS 颜色 → sRGB 归一（culori 的 parse 覆盖 hex / rgb() / 具名色 / 现代色彩空间） */
const toRgbMode = converter('rgb');

/** 把 0..1 通道还原成 0..255 整数 */
const toChannel = (value: number): number => Math.round(value * 255);

/**
 * 解析颜色串为整数通道。
 *
 * 解析失败直接抛错：本目录只在构建期执行，早失败远好于静默产出坏色值——
 * 后者会以「某个主题少了一条声明」的形式漏进产物，极难定位。
 */
export const parseRgb = (input: string): Rgb => {
  const parsed = parse(input);
  if (!parsed) throw new Error(`无法解析颜色：${input}`);
  const rgb = toRgbMode(parsed);
  return [toChannel(rgb.r), toChannel(rgb.g), toChannel(rgb.b)];
};

/**
 * 整数通道 → `#rrggbb`（小写）。
 *
 * 交回 culori 格式化而非手写 toString(16)：它是「颜色格式归一」的既有能力，
 * 输出与本目录接管前的 tokens.scss 逐字节一致（小写、6 位、带 #）。
 */
export const formatRgbHex = (rgb: Rgb): string => {
  const hex = formatHex({ mode: 'rgb', r: rgb[0] / 255, g: rgb[1] / 255, b: rgb[2] / 255 });
  if (!hex) throw new Error(`无法格式化颜色通道：${rgb.join(', ')}`);
  return hex;
};

/**
 * 整数通道 + alpha → `rgba(r, g, b, α)`（逗号分隔，与 tokens.scss 现状同格式）。
 *
 * alpha 用 number 直接入串（0.04 → "0.04"），不做定长补零——现状即如此。
 */
export const formatRgba = (rgb: Rgb, alpha: number): string => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;

/** 整数通道 → `R, G, B`（供 --*-rgb 分量变量消费） */
export const formatChannels = (rgb: Rgb): string => rgb.join(', ');

/**
 * 整数分子除以 100，按 round-half-to-even 取整。
 *
 * 全部走整数：`numerator` 是整数，`Math.floor` 与 `%` 都在整数域，不存在浮点误差。
 * 五成双（而非普通四舍五入）是现状取值的实际口径——`--tint-danger-50` 三主题与
 * `--tint-primary-30`（HC）都落在 x.5 上，用 Math.round 会各差 1。
 */
const divideBy100 = (numerator: number): number => {
  const quotient = Math.floor(numerator / 100);
  const remainder = numerator % 100;
  if (remainder > 50) return quotient + 1;
  if (remainder < 50) return quotient;
  return quotient % 2 === 0 ? quotient : quotient + 1;
};

/**
 * 两色按权重混合（weightB = b 的整数占比 0..100，a 占 100 - weightB）。
 * 逐通道整数运算 + round-half-to-even。
 */
export const mixRgb = (a: Rgb, b: Rgb, weightB: number): Rgb => [
  divideBy100(a[0] * (100 - weightB) + b[0] * weightB),
  divideBy100(a[1] * (100 - weightB) + b[1] * weightB),
  divideBy100(a[2] * (100 - weightB) + b[2] * weightB),
];
