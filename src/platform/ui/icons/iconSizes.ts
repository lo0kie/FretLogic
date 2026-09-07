import { logger } from '@/platform/utils/logger';

/**
 * BaseIcon 尺寸档位与描边档位预设（px）——图标尺寸的**唯一来源**。
 *
 * 尺寸档位语义（由小到大）：
 * - xs: 微型 —— 徽标内 / 滚动指示 / tag 移除 / 密码可见性等紧凑小图标
 * - sm: 小 —— 输入框内联（清空/眼睛）、滑块步进、Toast 关闭等常规内联图标
 * - md: 中 —— 菜单项 / 下拉选项 / 单元格工具 / Toast 类型等标准图标
 * - lg: 大 —— 重点操作、列表内主操作图标
 * - xl: 特大 —— icon-only 主按钮（顶栏 / 侧栏）图标
 * - 2xl / 3xl: 插图级 —— 空状态等需要「图」而非「图标」量级的场景
 *
 * 模板与样式一律通过档位名引用，禁止散落魔法数字；需要微调整体观感时只改本表。
 */
export const ICON_SIZE_PRESETS = {
  'xs': 12,
  'sm': 14,
  'md': 16,
  'lg': 18,
  'xl': 20,
  /** 插图级：空状态中等尺寸 */
  '2xl': 26,
  /** 插图级：空状态大尺寸 */
  '3xl': 38,
} as const;

export type IconSizePreset = keyof typeof ICON_SIZE_PRESETS;

/** 允许档位名 / 裸 px 数字 / 任意 CSS 长度字符串（极少数例外场景保留出口） */
export type IconSizeValue = IconSizePreset | number | (string & {});

/**
 * 描边档位（px）：Lucide 等描边类图标的线宽三档。
 * - thin:   细 —— 密集步进控件（滑块加减等）
 * - regular:常规 —— 常规按钮与面板图标
 * - bold:   粗 —— 关闭 / 勾选等需要强识别的小尺寸图标
 */
export const ICON_STROKE_PRESETS = {
  thin: 2.2,
  regular: 2.5,
  bold: 3,
} as const;

export type IconStrokePreset = keyof typeof ICON_STROKE_PRESETS;

/** 允许档位名 / 裸数值 / 带单位字符串 */
export type IconStrokeValue = IconStrokePreset | number | (string & {});

/** 合法 CSS 长度形态：数字 + 常见单位，或裸 0。用于识别 'ml' 这类档位名笔误 */
const CSS_LENGTH_PATTERN = /^-?(?:\d+\.?\d*|\.\d+)(?:px|em|rem|%|vh|vw|ch|ex|cm|mm|in|pt|pc)$|^0$/;

/**
 * 开发期校验：值既不是预设档位、也不像合法 CSS 长度时告警。
 * `IconSizeValue`/`IconStrokeValue` 含 `(string & {})` 开放分支，允许任意字符串通过类型检查；
 * 一旦笔误（如把 'md' 写成 'ml'），浏览器会静默忽略该非法值、图标回退默认尺寸，
 * 表现为"看着正常但结果不对"，排查成本很高。
 */
const warnIfInvalidLength = (scope: string, value: string): void => {
  if (!import.meta.env.DEV) return;
  if (CSS_LENGTH_PATTERN.test(value.trim())) return;
  logger.warn(scope, `值 "${value}" 既不是预设档位也不像合法 CSS 长度，将被浏览器忽略`);
};

/** 尺寸解析：档位名 → px；数字 → px；其余字符串（em/rem/px）原样生效 */
export const resolveIconSize = (value: IconSizeValue): string => {
  if (typeof value === 'number') return `${value}px`;
  const presetPx = ICON_SIZE_PRESETS[value as IconSizePreset];
  if (presetPx !== undefined) return `${presetPx}px`;
  const raw = value as string;
  warnIfInvalidLength('resolveIconSize', raw);
  return raw;
};

/** 描边解析：档位名 → px；数字 → px；带单位字符串原样生效 */
export const resolveIconStroke = (value: IconStrokeValue): string => {
  if (typeof value === 'number') return `${value}px`;
  const preset = ICON_STROKE_PRESETS[value as IconStrokePreset];
  if (preset !== undefined) return `${preset}px`;
  const raw = value as string;
  warnIfInvalidLength('resolveIconStroke', raw);
  return raw;
};
