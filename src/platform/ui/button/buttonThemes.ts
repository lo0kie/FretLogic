/**
 * ActionButton 主题映射（单一来源）
 *
 * ActionButton 与 BaseCheckbox buttonized 形态共用同一份色板与尺寸，
 * 避免视觉样式复制后随 ActionButton 演进而漂移。
 *
 * 【宿主差异说明】主题串内含 `hover:enabled:` 前缀（button 原生的 :enabled 语义，
 * 禁用态不响应 hover）。当复用宿主不是原生 button（如 BaseCheckbox 的 label）时，
 * 该前缀不会命中，需按宿主转换：
 *   - button（ActionButton）：直接使用，保持禁用不 hover 的原语义
 *   - label（BaseCheckbox）：把 `hover:enabled:` 替换为 `hover:`；禁用态单独移除 hover 段
 */
import { CONTROL_HEIGHT_CLASSES, CONTROL_SQUARE_CLASSES } from '@/platform/ui/controlSizes';

import type { ThemeColor } from '@/platform/types';

export type ButtonThemeType = ThemeColor;

/** 普通（default）变体：尺寸高度/内边距/字号 */
export const BUTTON_SIZE_MAP: Record<string, string> = {
  sm: `${CONTROL_HEIGHT_CLASSES.sm} gap-xs px-md text-xs`,
  md: `${CONTROL_HEIGHT_CLASSES.md} gap-sm px-lg text-xs`,
  lg: `${CONTROL_HEIGHT_CLASSES.lg} gap-sm px-xl text-sm`,
};

/** 紧凑模式尺寸：左右内边距减半，同时缩小与首尾图标的 gap；高度/字号保持与原尺寸一致 */
export const BUTTON_COMPACTED_SIZE_MAP: Record<string, string> = {
  sm: `${CONTROL_HEIGHT_CLASSES.sm} gap-2xs px-[0.4rem] text-xs`,
  md: `${CONTROL_HEIGHT_CLASSES.md} gap-xs px-[0.6rem] text-xs`,
  lg: `${CONTROL_HEIGHT_CLASSES.lg} gap-xs px-[0.8rem] text-sm`,
};

/** icon-only 方形尺寸 */
export const BUTTON_ICON_ONLY_SIZE_MAP: Record<string, string> = {
  sm: `p-0! ${CONTROL_SQUARE_CLASSES.sm} aspect-square`,
  md: `p-0! ${CONTROL_SQUARE_CLASSES.md} aspect-square`,
  lg: `p-0! ${CONTROL_SQUARE_CLASSES.lg} aspect-square`,
};

export const BUTTON_LOADER_SIZE_MAP: Record<string, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

export const BUTTON_ROUNDED_MAP: Record<string, string> = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-pill',
};

/** text 变体（纯文字按钮） */
export const BUTTON_TEXT_THEME_MAP: Record<ButtonThemeType, string> = {
  primary: 'text-primary hover:enabled:bg-surface-panel-hover',
  danger: 'text-danger hover:enabled:bg-surface-panel-hover',
  warning: 'text-warning hover:enabled:bg-surface-panel-hover',
  success: 'text-success hover:enabled:bg-surface-panel-hover',
  default: 'text-fg-body hover:enabled:bg-surface-panel-hover',
};

/** ghost 变体（透明底 + 主题色前景）。悬停前景取 SOLID SHADES 档（= 该语义色与纯黑 88:12 混合），
 *  原先由 `color-mix(in srgb, … 88%, black)` 在工具类里现算，比例散落在字符串里且产物色值无法审查。 */
export const BUTTON_GHOST_THEME_MAP: Record<ButtonThemeType, string> = {
  primary: 'text-primary hover:enabled:bg-surface-panel-hover hover:enabled:text-shade-primary-12',
  danger: 'text-danger hover:enabled:bg-surface-panel-hover hover:enabled:text-shade-danger-12',
  warning: 'text-warning hover:enabled:bg-surface-panel-hover hover:enabled:text-shade-warning-12',
  success: 'text-success hover:enabled:bg-surface-panel-hover hover:enabled:text-shade-success-12',
  default: 'text-fg-disabled hover:enabled:bg-surface-panel-hover hover:enabled:text-fg-body',
};

/** subtle 变体（浅色底 + 主题色前景）—— buttonized 选中/勾选态复用 */
export const BUTTON_SUBTLE_THEME_MAP: Record<ButtonThemeType, string> = {
  primary: 'border-tint-primary-90 bg-tint-primary-90 text-primary hover:enabled:bg-tint-primary-80',
  danger: 'border-tint-danger-90 bg-tint-danger-90 text-danger hover:enabled:bg-tint-danger-80',
  warning: 'border-tint-warning-90 bg-tint-warning-90 text-warning hover:enabled:bg-tint-warning-80',
  success: 'border-tint-success-88 bg-tint-success-88 text-success hover:enabled:bg-tint-success-82',
  default: 'border-border-light bg-surface-panel-hover text-fg-body hover:enabled:bg-border-base',
};

/** default 变体（实心底）。强调投影取同色分量令牌，随主题取该主题的功能色，不再手抄浅色档的 rgb */
export const BUTTON_DEFAULT_THEME_MAP: Record<ButtonThemeType, string> = {
  primary:
    'border-transparent bg-primary text-fg-on-accent shadow-[0_1px_4px_rgba(var(--color-primary-rgb),0.3)] hover:enabled:opacity-90',
  danger: 'border-transparent bg-tint-danger-88 text-danger hover:enabled:bg-tint-danger-78',
  warning: 'border-transparent bg-tint-warning-88 text-warning hover:enabled:bg-tint-warning-78',
  success:
    'border-transparent bg-success text-fg-on-accent shadow-[0_1px_4px_rgba(var(--color-success-rgb),0.3)] hover:enabled:opacity-90',
  default:
    'border-border-light bg-surface-body text-fg-body hover:enabled:border-border-base hover:enabled:bg-surface-panel-hover hover:enabled:text-fg-title hover:enabled:shadow-xs',
};
