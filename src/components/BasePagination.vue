<template>
  <div v-if="total > 0" class="base-pagination" :class="[`size-${size}`]">
    <ActionButton :size variant="ghost" icon-only :disabled="disabled || modelValue <= 0" @click="handlePrev">
      <ChevronLeft :size="iconSize" />
    </ActionButton>

    <span class="page-indicator">
      {{ displayText }}
    </span>

    <ActionButton
      :size
      icon-only
      variant="ghost"
      :disabled="disabled || modelValue + step >= total"
      @click="handleNext"
    >
      <ChevronRight :size="iconSize" />
    </ActionButton>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import { ChevronLeft, ChevronRight } from '@lucide/vue';
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: number;
    total: number;
    size?: 'sm' | 'md' | 'lg';
    step?: number;
    disabled?: boolean;
    formatter?: (current: number, total: number) => string;
  }>(),
  {
    size: 'md',
    step: 1,
    disabled: false,
    formatter: undefined,
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', page: number): void;
  (e: 'change', page: number): void;
  (e: 'prev', page: number): void;
  (e: 'next', page: number): void;
}>();

const iconSize = computed(() => {
  switch (props.size) {
    case 'sm':
      return 14;
    case 'lg':
      return 18;
    case 'md':
    default:
      return 16;
  }
});

const displayText = computed(() => {
  const current = props.modelValue + 1;
  if (props.formatter) {
    return props.formatter(current, props.total);
  }
  const rangeStr =
    props.step > 1 && current < props.total ? '-' + Math.min(props.modelValue + props.step, props.total) : '';
  return `第 ${current}${rangeStr} / ${props.total} 页`;
});

const handlePrev = () => {
  if (props.disabled || props.modelValue <= 0) return;
  const nextVal = Math.max(0, props.modelValue - props.step);
  emit('update:modelValue', nextVal);
  emit('prev', nextVal);
  emit('change', nextVal);
};

const handleNext = () => {
  if (props.disabled || props.modelValue + props.step >= props.total) return;
  const nextVal = Math.min(props.total - 1, props.modelValue + props.step);
  emit('update:modelValue', nextVal);
  emit('next', nextVal);
  emit('change', nextVal);
};
</script>

<style scoped lang="scss">
.base-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 1.8rem;

  &.size-sm {
    gap: $space-sm;
    .page-indicator {
      font-size: $fs-xs;
      min-width: 4.5rem;
    }
  }

  &.size-md {
    gap: $space-sm;
    .page-indicator {
      font-size: $fs-xs;
      min-width: 5.5rem;
    }
  }

  &.size-lg {
    gap: $space-md;
    .page-indicator {
      font-size: $fs-sm;
      min-width: 6.5rem;
    }
  }
}

.page-indicator {
  text-align: center;
  color: var(--text-disabled);
  font-variant-numeric: tabular-nums;
  line-height: 1.4;
  user-select: none;
}
</style>
