import { CONTROL_HEIGHT_CLASSES } from '@/platform/ui/controlSizes';

import type { ComponentSize } from '@/platform/types';
import type { CSSProperties } from 'vue';

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

/**
 * 自定义 color 项的行底色（勾选 / hover）：按 color 取值查实色 tint。
 *
 * 为什么不再用 `color-mix(..., transparent)` 现算：半透明底会透出下层，同一行叠在不同底色上
 * 深浅漂移；且项目已有一套实色 tint 档位（tokens.scss 的 SOLID TINTS 段），查表可与 danger 项
 * （bg-tint-danger-88）保持同一口径。
 *
 * ⚠️ MenuItem.color 新增取值时必须在此补一行；未登记的取值不给底色，
 * hover 自动回落到 MenuRow 的 --bg-panel-hover。
 */
const COLOR_ROW_TINT: Record<string, { checked: string; hover: string }> = {
  'var(--color-primary)': { checked: 'var(--tint-primary-82)', hover: 'var(--tint-primary-88)' },
  'var(--color-warning)': { checked: 'var(--tint-warning-82)', hover: 'var(--tint-warning-88)' },
  'var(--text-title)': { checked: 'var(--tint-texttitle-90)', hover: 'var(--tint-texttitle-90)' },
};

/** 自定义 color 项的内联样式：文字色取 item.color，行底色取上表登记的实色 tint */
export const getItemStyle = <T extends MenuRowStyleSource>(item: T): CSSProperties | undefined => {
  if (item.disabled) return undefined;
  if (item.color) {
    const tint = COLOR_ROW_TINT[item.color];
    return {
      'color': item.color,
      'backgroundColor': item.checked ? tint?.checked : undefined,
      '--item-hover-bg': tint?.hover,
    } as CSSProperties;
  }

  return undefined;
};
