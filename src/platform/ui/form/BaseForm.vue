<template>
  <component :class="['base-form flex flex-col', gapClass]" :is="tag">
    <slot />
  </component>
</template>

<script setup lang="ts">
import { computed, provide } from 'vue';

import { FORM_CONTROL_CONTEXT_KEY } from '@/platform/ui/form/formControlContext';
import { FORM_ROW_DENSITY_KEY } from '@/platform/ui/form/formRowContext';

import type { ComponentSize } from '@/platform/types';
import type { FormControlContext } from '@/platform/ui/form/formControlContext';
import type { FormRowDensityContext } from '@/platform/ui/form/formRowContext';

defineOptions({ name: 'BaseForm' });

/**
 * 通用表单组容器：堆叠一组表单行，并向内部下发表单样式上下文：
 * - BaseFormRow 密度（label-tone / label-size / label-width）；
 * - 表单控件通用属性（size，后续可扩展 disabled 等）。
 * 均由业务层通过 props 显式声明（不内置隐式默认），
 * 子 FormRow / 子控件行内显式 props 仍可覆盖容器下发的默认值。
 *
 * 渲染标签可换（tag 透传到 <component :is>）：需要**原生表单语义**时传 tag="form"，例如承载
 * `type="password"` 字段的场景 —— 无 form 归属的密码框会被 Chrome 打
 * `[DOM] Password field is not contained in a form`，且密码管理器拿不到归属、只能靠启发式猜凭据分组。
 * 换标签只改承载元素，布局与下发的上下文不变；消费方传的 class / 原生事件（如 @submit.prevent）
 * 经 attrs 落到这个根元素上。
 */
const props = withDefaults(
  defineProps<{
    /** 渲染标签：默认 div；需要原生表单语义（承载 type="password" 字段、供密码管理器归属）时传 'form' */
    tag?: string;
    /** 字段间的垂直间距档位 */
    gap?: 'sm' | 'md' | 'lg';
    /** 下发子 FormRow 的标签亮度（容器级默认，行内 props 可覆盖） */
    labelTone?: FormRowDensityContext['labelTone'];
    /** 下发子 FormRow 的标签字号（容器级默认，行内 props 可覆盖） */
    labelSize?: FormRowDensityContext['labelSize'];
    /** 下发子 FormRow 的标签列宽（容器级默认，行内 props 可覆盖；数值自动补齐 px） */
    labelWidth?: string | number;
    /** 下发内部表单控件的尺寸档位（容器级默认，控件行内 props 可覆盖） */
    size?: ComponentSize;
  }>(),
  {
    tag: 'div',
    gap: 'md',
    labelTone: undefined,
    labelSize: undefined,
    labelWidth: undefined,
    size: undefined,
  }
);

const GAP_CLASS_MAP: Record<'sm' | 'md' | 'lg', string> = { sm: 'gap-sm', md: 'gap-md', lg: 'gap-lg' };

const gapClass = computed(() => GAP_CLASS_MAP[props.gap]);

provide<FormRowDensityContext>(FORM_ROW_DENSITY_KEY, {
  labelTone: props.labelTone,
  labelSize: props.labelSize,
  labelWidth: props.labelWidth,
});

provide<FormControlContext>(FORM_CONTROL_CONTEXT_KEY, {
  size: props.size,
});
</script>
