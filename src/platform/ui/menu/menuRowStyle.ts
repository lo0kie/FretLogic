import { CONTROL_HEIGHT_CLASSES } from '@/platform/ui/controlSizes';

import type { ComponentSize } from '@/platform/types';
import type { IconName } from '@/platform/ui/icons/icons.registry';
import type { Component, CSSProperties } from 'vue';

/** 菜单行尺寸 → 类名静态映射：避免模板字符串拼接（Tailwind/扫描器无法识别动态拼接的类） */
const MENU_ROW_SIZE_CLASS: Record<ComponentSize, string> = {
  sm: `${CONTROL_HEIGHT_CLASSES.sm} gap-sm px-sm text-2xs`,
  md: `${CONTROL_HEIGHT_CLASSES.md} gap-sm px-md text-xs`,
  lg: `${CONTROL_HEIGHT_CLASSES.lg} gap-sm px-md text-xs`,
};

/** 依据尺寸档位解析菜单行类名（缺省 md） */
export const menuRowSizeClass = (size?: ComponentSize): string =>
  MENU_ROW_SIZE_CLASS[size ?? 'md'] ?? MENU_ROW_SIZE_CLASS.md;

interface MenuRowStyleSource {
  color?: string;
  checked?: boolean;
  disabled?: boolean;
}

/** 自定义 color 项的内联样式：选中底色与 hover 底色按色彩混合生成 */
export const getItemStyle = <T extends MenuRowStyleSource>(item: T): CSSProperties | undefined => {
  if (item.disabled) return undefined;
  if (item.color) {
    return {
      'color': item.color,
      'backgroundColor': item.checked ? `color-mix(in srgb, ${item.color} 18%, transparent)` : undefined,
      '--item-hover-bg': `color-mix(in srgb, ${item.color} 12%, transparent)`,
    } as CSSProperties;
  }
  return undefined;
};

/** 菜单行前导图标渲染统一类型（字符串图标名或组件） */
export type MenuRowIcon = IconName | Component | undefined;
