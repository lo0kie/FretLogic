/**
 * BaseFormRow 密度上下文：
 * BaseCollapse 等容器组件通过 provide 下发默认的标签样式（弱化 + 缩小），
 * 行内显式 props（labelTone / labelSize）优先于上下文值。
 */
import type { InjectionKey } from 'vue';

export interface FormRowDensityContext {
  /** 标签亮度：'body' 常规 | 'muted' 弱化 */
  labelTone?: 'body' | 'muted';
  /** 标签字号：'xs' 常规 | '2xs' 缩小 */
  labelSize?: 'xs' | '2xs';
}

export const FORM_ROW_DENSITY_KEY: InjectionKey<FormRowDensityContext> = Symbol('form-row-density');
