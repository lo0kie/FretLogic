<template>
  <div
    class="empty-state-wrapper flex flex-col items-center justify-center w-full h-full box-border select-none text-center"
    :class="[sizeClass, { 'is-bordered border border-dashed border-border-light rounded-md bg-bg-body': bordered }]"
  >
    <div
      v-if="icon || $slots.icon"
      class="icon-zone text-text-disabled opacity-75"
      :class="[
        size === 'sm' ? 'mb-[0.2rem]' : '',
        size === 'md' ? 'mb-[0.5rem]' : '',
        size === 'lg' ? 'w-16 h-16 rounded-full bg-bg-panel-hover flex items-center justify-center mb-4' : '',
      ]"
    >
      <slot name="icon">
        <component :is="icon" :size="iconSize" stroke-width="2.5" class="empty-icon" />
      </slot>
    </div>

    <div
      v-if="title || $slots.title"
      class="title-text text-text-title leading-tight"
      :class="[
        size === 'sm' ? 'text-2xs font-medium' : '',
        size === 'md' ? 'text-xs font-semibold' : '',
        size === 'lg' ? 'text-base font-bold' : '',
      ]"
    >
      <slot name="title"> {{ title }} </slot>
    </div>

    <div
      v-if="description || $slots.default"
      class="description-text text-text-disabled font-medium leading-relaxed"
      :class="[
        size === 'sm' ? 'text-2xs' : '',
        size === 'md' ? 'text-2xs' : '',
        size === 'lg' ? 'text-xs mt-[0.3rem]' : '',
      ]"
    >
      <slot> {{ description }} </slot>
    </div>

    <div v-if="$slots.action" class="action-zone mt-[0.8rem]">
      <slot name="action" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue';

const {
  icon,
  title = '',
  description = '',
  size = 'md',
  bordered = false,
} = defineProps<{
  /** 支持传入 Lucide 图标组件 */
  icon?: Component;
  /** 主标题 */
  title?: string;
  /** 描述/副文本 */
  description?: string;
  /** 尺寸档位：sm (小卡片内) | md (侧边栏/列表) | lg (主视图大区) */
  size?: 'sm' | 'md' | 'lg';
  /** 是否带有虚线边框外框 */
  bordered?: boolean;
}>();

const sizeClass = computed(() => {
  switch (size) {
    case 'sm':
      return 'empty-size-sm py-md px-0';
    case 'lg':
      return 'empty-size-lg py-3xl px-xl';
    case 'md':
    default:
      return 'empty-size-md py-3xl px-lg';
  }
});

const SIZE_TO_ICON: Record<string, number> = {
  sm: 16,
  lg: 36,
  md: 22,
};
const iconSize = computed(() => SIZE_TO_ICON[size] ?? 22);
</script>
