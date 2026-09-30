/**
 * BaseSegmentedControl 纯逻辑模块：尺寸档位样式表、选项归一化、指示器几何换算与拖动落点判定。
 * 与响应式/DOM 状态解耦，组件内保留测量、定时器与事件绑定。
 */
import { CONTROL_HEIGHT_CLASSES } from '@/platform/ui/controlSizes';
import { isObject } from '@/platform/utils/common';

import type { IconSizePreset } from '@/platform/ui/icons/iconSizes';

export type SegmentedSizeMap = Record<'sm' | 'md' | 'lg', { wrapper: string; item: string }>;

export const SIZE_MAP: SegmentedSizeMap = {
  sm: { wrapper: `${CONTROL_HEIGHT_CLASSES.sm}`, item: 'px-2 text-2xs' },
  md: { wrapper: `${CONTROL_HEIGHT_CLASSES.md}`, item: 'px-3 text-2xs' },
  lg: { wrapper: `${CONTROL_HEIGHT_CLASSES.lg}`, item: 'px-3 text-xs' },
};

/** 紧凑模式尺寸：进一步缩小按钮左右内边距（超紧凑） */
export const COMPACTED_SIZE_MAP: SegmentedSizeMap = {
  sm: { wrapper: `${CONTROL_HEIGHT_CLASSES.sm}`, item: 'px-1 text-2xs' },
  md: { wrapper: `${CONTROL_HEIGHT_CLASSES.md}`, item: 'px-1.5 text-2xs' },
  lg: { wrapper: `${CONTROL_HEIGHT_CLASSES.lg}`, item: 'px-1.5 text-xs' },
};

export const DEFAULT_ICON_SIZES: Record<'sm' | 'md' | 'lg', IconSizePreset> = {
  sm: 'sm',
  md: 'md',
  lg: 'xl',
};

/** 下划线高度（px）：underline 形态贴段底部的主色细线 */
export const TAB_LINE_HEIGHT = 2;

/**
 * 形态档（`variant`）：结构 / 几何。与 ActionButton 的 `variant`（default / subtle / ghost / text）、
 * BaseSwitch 的 `variant`（switch / button）同族——**形态轴在本项目一律叫 `variant`**。
 * 配色档走另一条轴 `appearance`（subtle / filled，与 BaseBadge 同口径），见 vue 侧说明。
 */
export type SegmentVariant = 'pill' | 'underline';

/**
 * 配色档（`appearance`）：切底色 / 文字色，原则上**不切几何**。
 *
 * 与 BaseBadge 的 `appearance` 同口径（那边是 subtle / outline / filled）——本项目里
 * 「底与描边的浓淡」一律叫 `appearance`、「结构形态」一律叫 `variant`。
 * `filled` 取 `bg-*-solid` + `--text-on-solid`（实心档上的浅色字，过 AA），
 * 口径见 tokens/themes 的 `--color-*-solid` 注释。
 *
 * 唯一例外：underline + filled —— 主色与主色实心两个令牌同源同色，贴底细线表达不出配色差，
 * 该组合的激活段改为整段方角实心块；组件侧经 `geometryVariant` 把它换算为 pill 几何后
 * 传入 `resolveIndicatorGeometry`，本文件仍只认形态档。
 */
export type SegmentAppearance = 'subtle' | 'filled';

/**
 * 把「选项段几何」换算为「滑块在该段上应处的几何」——静止测量与拖动跟手预览共用同一换算，
 * 保证两种状态下指示器形状/位置严格一致（拖动时不会变成另一种形状）。
 *
 * - pill：与段同宽同高、顶部对齐；
 * - underline：恒为贴段底部的主色细线（高度固定 TAB_LINE_HEIGHT，纵向 = 段顶 + 段高 − 线厚）。
 *   开启 showInactiveBorder 时容器底部有 border-b 贯穿线（位于内容区下方 2px），
 *   滑块需下移到该 border 区与之重合，才能盖住浅色线、形成连续同厚的激活段。
 *
 * 注意：underline 下**不能**沿用选项段自身的 height/top，否则拖动时下划线会被撑成覆盖整段的高块。
 */
export const resolveIndicatorGeometry = (
  item: { width: number; height: number; top: number },
  variant: SegmentVariant,
  showInactiveBorder: boolean
): { width: number; height: number; y: number; dx: number } => {
  if (variant === 'underline') {
    const lineShift = showInactiveBorder ? TAB_LINE_HEIGHT : 0;
    return {
      width: item.width,
      height: TAB_LINE_HEIGHT,
      y: item.top + item.height - TAB_LINE_HEIGHT + lineShift,
      dx: 0,
    };
  }
  return { width: item.width, height: item.height, y: item.top, dx: 0 };
};

/** 落点判定（夹逼语义）：选项间空隙与容器两侧越界都归并到更近一侧的选项——
 *  拖到边缘外一直拖再松手，仍能切换到最边缘的选项 */
export const hitDragIndexOf = (localX: number, rects: { left: number; right: number; index: number }[]): number => {
  if (rects.length === 0) return -1;
  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i]!;
    if (localX < rect.left) {
      const prev = rects[i - 1];
      if (!prev) return rect.index;
      return localX - prev.right <= rect.left - localX ? prev.index : rect.index;
    }
    if (localX < rect.right) return rect.index;
  }
  return rects.at(-1)!.index;
};

/** 兼容组件实例（$el）与原生元素（el） */
export const toEl = (raw: unknown): HTMLElement | null => {
  if (!raw) return null;
  if (raw instanceof HTMLElement) return raw;
  if (isObject(raw)) {
    const r = raw as Record<string, unknown>;
    if (r['$el'] instanceof HTMLElement) return r['$el'];
    if (r['el'] instanceof HTMLElement) return r['el'];
  }
  return null;
};
