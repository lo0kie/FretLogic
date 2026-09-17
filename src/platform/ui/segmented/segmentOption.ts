/**
 * 分段控件的选项契约（纯类型模块，无运行时值）。
 *
 * 单独成文件的原因：选项形状被非 UI 层复用 —— domains/chord 的排序规则选项表
 * （theory.ts 的 SORT_RULE_CONFIG）就是按这个形状声明的。此前它只能从
 * BaseSegmentedControl.vue 里取类型，等于让乐理模块认识一个 UI 组件实现文件。
 * 抽成独立类型模块后，依赖方向与语义都归位：域层只依赖契约，不依赖组件。
 */
import type { IconName } from '@/platform/ui/icons/icons.registry';
import type { IconStrokeValue } from '@/platform/ui/icons/iconSizes';

export interface SegmentOption<T> {
  label: string;
  value: T;
  disabled?: boolean;
  /** 可选图标名称 */
  icon?: IconName;
  /** 单选项是否仅展示图标（此时隐藏文字，保留 aria-label 与 title） */
  iconOnly?: boolean;
  /** 单选项图标描边粗细（优先级高于组件级 iconStroke） */
  iconStroke?: IconStrokeValue;
  /** 选项附带数量角标（如分组条目数），组件不消费，仅透传给 item-suffix 插槽供调用方渲染 */
  count?: number;
}
