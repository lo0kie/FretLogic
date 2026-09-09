import type { IconName } from '@/platform/ui/icons/icons.registry';
import type { Component } from 'vue';

/** 菜单项数据模型：label/icon/action/checked/color/danger/disabled/title/keepOpen/shortcut/divided/expandChildren/children */
export interface MenuItem {
  label: string;
  icon?: IconName | Component;
  action?: () => void;
  checked?: boolean;
  color?: string;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
  /** 点击后是否保持菜单打开状态（不自动关闭浮层） */
  keepOpen?: boolean;
  /** 快捷键提示文本，如 Ctrl+C */
  shortcut?: string;
  /** 是否在此项前插入分割线 */
  divided?: boolean;
  /**
   * 是否展开 children 为级联子菜单；不传时以「是否带 children」决定，
   * 显式传入 true/false 则强制采用该布尔值。
   * 置为 false 时即使带 children 也按普通项渲染，使用 action 作为点击行为，
   * 便于「单子项时不弹出子菜单」等场景，免去调用方在两种形态间切换对象。
   */
  expandChildren?: boolean;
  /** 级联子菜单列表 */
  children?: MenuItem[];
}
