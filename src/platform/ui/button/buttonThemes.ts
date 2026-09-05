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
import type { ThemeColor } from '@/platform/types';
import { CONTROL_HEIGHT_CLASSES, CONTROL_SQUARE_CLASSES } from '@/platform/ui/controlSizes';

export type ButtonThemeType = ThemeColor;

/** 普通（default）变体：尺寸高度/内边距/字号 */
export const BUTTON_SIZE_MAP: Record<string, string> = {
  sm: `${CONTROL_HEIGHT_CLASSES.sm} px-md text-xs gap-xs`,
  md: `${CONTROL_HEIGHT_CLASSES.md} px-lg text-xs gap-sm`,
  lg: `${CONTROL_HEIGHT_CLASSES.lg} px-xl text-sm gap-sm`,
};

/** 紧凑模式尺寸：左右内边距减半，同时缩小与首尾图标的 gap；高度/字号保持与原尺寸一致 */
export const BUTTON_COMPACTED_SIZE_MAP: Record<string, string> = {
  sm: `${CONTROL_HEIGHT_CLASSES.sm} px-[0.4rem] text-xs gap-2xs`,
  md: `${CONTROL_HEIGHT_CLASSES.md} px-[0.6rem] text-xs gap-xs`,
  lg: `${CONTROL_HEIGHT_CLASSES.lg} px-[0.8rem] text-sm gap-xs`,
};

/** icon-only 方形尺寸 */
export const BUTTON_ICON_ONLY_SIZE_MAP: Record<string, string> = {
  sm: `p-0! ${CONTROL_SQUARE_CLASSES.sm} aspect-square`,
  md: `p-0! ${CONTROL_SQUARE_CLASSES.md} aspect-square`,
  lg: `p-0! ${CONTROL_SQUARE_CLASSES.lg} aspect-square`,
};

export const BUTTON_LOADER_SIZE_MAP: Record<string, string> = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
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
  primary: 'text-primary hover:enabled:bg-bg-panel-hover',
  danger: 'text-danger hover:enabled:bg-bg-panel-hover',
  warning: 'text-warning hover:enabled:bg-bg-panel-hover',
  success: 'text-success hover:enabled:bg-bg-panel-hover',
  default: 'text-text-body hover:enabled:bg-bg-panel-hover',
};

/** ghost 变体（透明底 + 主题色前景） */
export const BUTTON_GHOST_THEME_MAP: Record<ButtonThemeType, string> = {
  primary:
    'text-primary hover:enabled:text-[color:color-mix(in_srgb,var(--color-primary)_88%,black)] hover:enabled:bg-bg-panel-hover',
  danger:
    'text-danger hover:enabled:text-[color:color-mix(in_srgb,var(--color-danger)_88%,black)] hover:enabled:bg-bg-panel-hover',
  warning:
    'text-warning hover:enabled:text-[color:color-mix(in_srgb,var(--color-warning)_88%,black)] hover:enabled:bg-bg-panel-hover',
  success:
    'text-success hover:enabled:text-[color:color-mix(in_srgb,var(--color-success)_88%,black)] hover:enabled:bg-bg-panel-hover',
  default: 'text-text-disabled hover:enabled:text-text-body hover:enabled:bg-bg-panel-hover',
};

/** subtle 变体（浅色底 + 主题色前景）—— buttonized 选中/勾选态复用 */
export const BUTTON_SUBTLE_THEME_MAP: Record<ButtonThemeType, string> = {
  primary: 'bg-tint-primary-90 border-tint-primary-90 text-primary hover:enabled:bg-tint-primary-80',
  danger: 'bg-tint-danger-90 border-tint-danger-90 text-danger hover:enabled:bg-tint-danger-80',
  warning: 'bg-tint-warning-90 border-tint-warning-90 text-warning hover:enabled:bg-tint-warning-80',
  success: 'bg-tint-success-88 border-tint-success-88 text-success hover:enabled:bg-tint-success-82',
  default: 'bg-bg-panel-hover border-border-light text-text-body hover:enabled:bg-border-base',
};

/** default 变体（实心底） */
export const BUTTON_DEFAULT_THEME_MAP: Record<ButtonThemeType, string> = {
  primary:
    'bg-primary border-transparent text-text-on-accent shadow-[0_1px_4px_rgba(0,122,255,0.3)] hover:enabled:opacity-90',
  danger: 'bg-tint-danger-88 border-transparent text-danger hover:enabled:bg-tint-danger-78',
  warning: 'bg-tint-warning-88 border-transparent text-warning hover:enabled:bg-tint-warning-78',
  success:
    'bg-success border-transparent text-text-on-accent shadow-[0_1px_4px_rgba(52,199,89,0.3)] hover:enabled:opacity-90',
  default:
    'bg-bg-body border-border-light text-text-body hover:enabled:border-border-base hover:enabled:bg-bg-panel-hover hover:enabled:text-text-title hover:enabled:shadow-xs',
};
