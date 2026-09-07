<template>
  <section class="base-collapse box-border w-full">
    <button
      v-wave
      :aria-controls="bodyId"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
      class="group/head box-border flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-left outline-none select-none hover:bg-surface-panel-hover focus-visible:ring-2 focus-visible:ring-primary/60"
      type="button"
    >
      <slot name="icon" />
      <span class="min-w-0 flex-1">
        <span class="flex items-center gap-1.5 truncate text-sm font-semibold tracking-wide text-fg-title">
          {{ title }}
        </span>
      </span>
      <BaseIcon
        :class="expanded ? 'rotate-0' : '-rotate-90'"
        class="text-fg-secondary shrink-0 transition-transform duration-base ease-out group-hover/head:text-fg-title"
        name="chevron-down"
        size="sm"
      />
    </button>

    <div
      :class="expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
      :id="bodyId"
      class="grid transition-[grid-template-rows] duration-base ease-out"
    >
      <div :inert="!expanded" class="min-h-0 overflow-hidden">
        <div class="flex flex-col gap-3 px-2 pt-1 pb-4">
          <slot />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { provide, useId } from 'vue';

import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import { FORM_ROW_DENSITY_KEY } from '@/platform/ui/form/formRowContext';

defineOptions({ name: 'BaseCollapse' });

/**
 * 是否展开。受控模式：`v-model:expanded` 绑定即可，由父级决定展开态；
 * 未绑定时内部自持状态。配合排他手风琴（至多一个展开）由父级约束。
 */
const expanded = defineModel<boolean>('expanded', { default: false });

withDefaults(
  defineProps<{
    /** 分组标题 */
    title?: string;
  }>(),
  {
    title: undefined,
  }
);

defineSlots<{
  default(): unknown;
  /** 标题前导图标 */
  icon?(): unknown;
}>();

// 内容区行密度：折叠面板里的表单行标签统一弱化 + 缩小，
// 让分组标题成为视觉主层级（行内显式 props 可覆盖）
provide(FORM_ROW_DENSITY_KEY, { labelTone: 'muted', labelSize: '2xs' });

/** 内容区无障碍关联 id（区分同一页面中的多个折叠组） */
const bodyId = useId();
</script>
