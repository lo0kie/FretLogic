import type { IconName } from '@/platform/ui/icons/icons.registry';
import type { Component, VNodeChild } from 'vue';

/** 菜单项数据模型：label/icon/action/checked/color/danger/disabled/title/keepOpen/shortcut/divided/expandChildren/children/content */
export interface MenuItem {
  label: string;
  icon?: IconName | Component;
  action?: () => void;
  /**
   * 单选组语义：本项代表的值。
   *
   * 所在菜单层传了 `model` 时，勾选态由 `item.value === model` 自动派生（不必逐项写 `checked`），
   * 点击时向上抛 `pick` 事件把该值交给调用方（不必逐项写 `action`）—— 于是「一组选项」可以
   * 直接写成字面量数组，读代码即读菜单，而不用「选项表 + map 派生成 MenuItem」绕一跳。
   *
   * 留空即不参与单选组：`checked` / `action` 按原语义生效，行为与加本字段之前完全一致。
   */
  value?: string;
  checked?: boolean;
  /** 勾选标记位置：'left' 占据前导图标槽（默认，勾选时替换 icon）；'right' 置于行尾（shortcut 之后），前导槽留给 icon */
  checkPosition?: 'left' | 'right';
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
   * 是否展开 children 为级联子菜单；不传时以「是否带 children 或 content」决定，
   * 显式传入 true/false 则强制采用该布尔值。
   * 置为 false 时即使带 children 也按普通项渲染，使用 action 作为点击行为，
   * 便于「单子项时不弹出子菜单」等场景，免去调用方在两种形态间切换对象。
   */
  expandChildren?: boolean;
  /**
   * 本项 `children` 层的单选组当前值 —— 与菜单层的 `model` 同义，只是作用在级联子菜单那一层。
   * 给出后，children 里带 `value` 的项勾选态由 `value === model` 现算、点击时回调 `onPick`，
   * 于是子菜单也能写成扁平的字面量列表（每项只描述 label/icon/value）。
   */
  model?: string;
  /** 本项 `children` 层的单选组选中回调（与 `model` 配对使用） */
  onPick?: (value: string) => void;
  /** 级联子菜单列表 */
  children?: MenuItem[];
  /**
   * 级联子面板自定义内容（渲染函数）：提供后该子面板渲染此内容而非 children 列表，
   * 供调用方注入任意领域组件（如和弦指板 Canvas 预览），平台层保持领域无关。
   * 此类项视为「叶子」：点击触发 action 而非钉住预览面板，hover 仍展开预览。
   */
  content?: () => VNodeChild;
}
