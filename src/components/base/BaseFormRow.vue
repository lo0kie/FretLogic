<template>
  <div
    class="base-form-row flex justify-between w-full box-border"
    :class="[
      `align-${align}`,
      align === 'top' ? 'items-start' : 'items-center',
      compact ? 'is-compact gap-sm' : 'gap-md',
    ]"
  >
    <label
      v-if="label || $slots.label"
      class="form-row-label text-xs font-semibold text-text-muted whitespace-nowrap shrink-0 select-none"
      :style="labelStyle"
    >
      <slot name="label"> {{ label }} </slot>
    </label>

    <div
      class="form-row-control flex-1 flex items-center min-w-0"
      :class="[
        controlAlign === 'start' ? 'justify-start' : controlAlign === 'center' ? 'justify-center' : 'justify-end',
      ]"
      :style="controlStyle"
    >
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { type FormComponentWidth, resolveComponentWidth } from '@/utils/core/constants';
import { computed } from 'vue';

const {
  label = '',
  align = 'center',
  labelWidth,
  controlWidth,
  controlAlign = 'end',
  compact = false,
} = defineProps<{
  label?: string;
  align?: 'center' | 'top' | 'between';
  labelWidth?: string;
  controlWidth?: FormComponentWidth;
  controlAlign?: 'start' | 'center' | 'end';
  compact?: boolean;
}>();

const labelStyle = computed(() => (labelWidth ? { width: labelWidth } : {}));
const controlStyle = computed(() => {
  const width = resolveComponentWidth(controlWidth);
  return width ? { width, flex: 'none' } : {};
});
</script>
