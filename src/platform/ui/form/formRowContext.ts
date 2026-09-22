/**
 * BaseFormRow 的两类上下文（均通过 provide / inject 下发）：
 *
 * ① 密度上下文：BaseForm 容器下发默认的标签样式（弱化 + 缩小）与标签列宽，
 *    行内显式 props（labelTone / labelSize / labelWidth）优先于上下文值。
 *
 * ② 标签关联绑定：BaseFormRow 只拥有 label 这一半，另一半（控件的 id / 无障碍名）在插槽里的
 *    控件身上，行够不着——故由本文约定双向绑定：行下发标签元素 id 并接收控件上报的实际 id，
 *    行据此输出 label 的 for。控件按「能否被 label 指到」分两档接入：
 *    - 可标签化元素（input / textarea / button）→ useFormRowControlId 上报自身 id；
 *    - 其余 ARIA 控件（role=slider / radiogroup / combobox / spinbutton）label 指不到，
 *      → useFormRowLabelId 取标签 id 作 aria-labelledby。
 *    两档都不接入的控件不会让 for 悬空（行仅在收到上报后才输出 for）；此时行还会把标签元素
 *    从 <label> 降级为 <span>——label 若既无 for 又未包裹控件，Chrome 会报
 *    「FormLabelHasNeitherForNorNestedInput」，而 aria-labelledby 指向 span 同样成立，
 *    故降级对无障碍名零影响（详见 BaseFormRow 的 labelTag）。
 */
import { inject, onScopeDispose, watchEffect } from 'vue';

import type { InjectionKey } from 'vue';

export interface FormRowDensityContext {
  /** 标签亮度：'body' 常规（默认）| 'muted' 次级弱化（让所在分组的标题更突出） */
  labelTone?: 'body' | 'muted';
  /** 标签列宽（数值补 px）；容器级默认，行内 label-width 可覆盖 */
  labelWidth?: string | number;
  /**
   * 标签字号：与控件尺寸标尺（sm/md/lg）同构，调用方无需在两套命名间切换。
   * 2xs(10px) < xs(12px，默认) < sm(14px) < md(16px) < lg(20px)
   * 注：@theme 无 --text-md 令牌，md 档映射 --text-base（16px）。
   */
  labelSize?: '2xs' | 'xs' | 'sm' | 'md' | 'lg';
}

export const FORM_ROW_DENSITY_KEY: InjectionKey<FormRowDensityContext> = Symbol('form-row-density');

export interface FormRowLabelling {
  /**
   * 行标签元素的 id（该行为非可标签化控件提供 aria-labelledby 的指向目标）。
   * 该元素可能是 <label>，也可能是降级后的 <span>——aria-labelledby 两者都认，取用方无需区分。
   */
  readonly labelId: string;
  /**
   * 行内控件上报承载标签的元素 id；传 undefined 即撤销上报
   * （控件卸载、本次渲染无对应元素，或控件自身已有可见标签、无需依赖行标签取名）。
   */
  report(id: string | undefined): void;
}

export const FORM_ROW_LABELLING_KEY: InjectionKey<FormRowLabelling> = Symbol('form-row-labelling');

/**
 * 可标签化控件接入（input / textarea / button 等 label 能指向的元素）：
 * 把自身元素 id 上报给所在行，行据此输出 label 的 for。
 *
 * 上报的是控件**自己的** id（而非行下发的），故控件显式指定 id 时同样生效；行内无控件上报时
 * for 不输出，不会产生「for 指向不存在的元素」的悬空关联。行外使用（无 BaseFormRow 祖先）为空操作。
 * 控件若自身已有可见标签（如 BaseCheckbox 的 <label for> 包着 input），应上报 undefined 主动退出 ——
 * 否则行标签会与自身标签拼成一个重复的无障碍名（同一件事被念两遍）。
 */
export function useFormRowControlId(resolveId: () => string | undefined): void {
  const labelling = inject(FORM_ROW_LABELLING_KEY, null);
  if (!labelling) return;
  watchEffect(() => labelling.report(resolveId()));
  onScopeDispose(() => labelling.report(undefined));
}

/**
 * 非可标签化控件接入（role=slider / radiogroup / combobox / spinbutton）：
 * 这类元素 label 的 for 指不到，无障碍名只能靠 ARIA 关联建立，故取所在行的标签元素 id
 * 用作 aria-labelledby（该标签元素在此时会降级为 span，aria-labelledby 对此不敏感）。
 * 行外使用返回 undefined（调用方据此不输出该 attribute）。
 */
export function useFormRowLabelId(): string | undefined {
  return inject(FORM_ROW_LABELLING_KEY, null)?.labelId;
}
