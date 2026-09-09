/**
 * BaseForm 控件通用上下文：
 * 由 BaseForm 容器下发，供内部表单控件（BaseSwitch / BaseSlider / BaseSegmentedControl 等）消费。
 * 控件行内显式 props 优先于上下文值。
 */
import type { ComponentSize } from '@/platform/types';
import type { InjectionKey } from 'vue';

export interface FormControlContext {
  /** 控件尺寸档位：sm/md/lg */
  size?: ComponentSize;
}

export const FORM_CONTROL_CONTEXT_KEY: InjectionKey<FormControlContext> = Symbol('form-control-context');
