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

/**
 * 从选项类型中提取对应的绑值类型：对象选项取 value，原始值即其自身。
 *
 * 与 BaseSelector 的 OptionValue 同形——选项类型（`O`）由调用方传入、绑值类型由它推导，
 * 组件不再把「绑值类型」当泛型参数去猜：猜的过程正是字面量联合退化成宽类型的地方
 * （`options` 写成 `(T | SegmentOption<T>)[]` 时，TS 要在一个含裸类型变量的联合里
 * 挑推断来源，`3 | 4 | 5` 这类字面量联合会被抹平）。
 */
export type SegmentOptionValue<Opt> = Opt extends { value: infer V } ? V : Opt;
