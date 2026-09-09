/**
 * BaseFormRow 密度上下文：
 * BaseForm 容器通过 provide 下发默认的标签样式（弱化 + 缩小），
 * 行内显式 props（labelTone / labelSize）优先于上下文值。
 */
import type { InjectionKey } from 'vue';

export interface FormRowDensityContext {
  /** 标签亮度：'body' 常规 | 'title' 弱化 */
  labelTone?: 'body' | 'title';
  /**
   * 标签字号：与控件尺寸标尺（sm/md/lg）同构，调用方无需在两套命名间切换。
   * 2xs(10px) < xs(12px，默认) < sm(14px) < md(16px) < lg(20px)
   * 注：@theme 无 --text-md 令牌，md 档映射 --text-base（16px）。
   */
  labelSize?: '2xs' | 'xs' | 'sm' | 'md' | 'lg';
}

export const FORM_ROW_DENSITY_KEY: InjectionKey<FormRowDensityContext> = Symbol('form-row-density');
