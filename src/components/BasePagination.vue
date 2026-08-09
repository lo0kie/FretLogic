<template>
  <div class="base-pagination" :class="[`size-${size}`]">
    <ActionButton :size="size" variant="ghost" icon-only :disabled="disabled || modelValue <= 0" @click="handlePrev">
      <ChevronLeft :size="iconSize" />
    </ActionButton>

    <span class="page-indicator">
      第 {{ modelValue + 1 }}{{ step > 1 && modelValue + 1 < total ? '-' + Math.min(modelValue + step, total) : '' }} /
      {{ total }} 页
    </span>

    <ActionButton
      :size="size"
      variant="ghost"
      icon-only
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

const {
  total,
  size = 'md',
  step = 1,
  disabled = false,
} = defineProps<{
  total: number;
  size?: 'sm' | 'md' | 'lg';
  step?: number;
  disabled?: boolean;
}>();

const modelValue = defineModel<number>({ required: true });

const emit = defineEmits<{
  (e: 'change', page: number): void;
  (e: 'prev', page: number): void;
  (e: 'next', page: number): void;
}>();

const iconSize = computed(() => {
  switch (size) {
    case 'sm':
      return 14;
    case 'lg':
      return 18;
    case 'md':
    default:
      return 16;
  }
});

const handlePrev = () => {
  if (disabled || modelValue.value <= 0) return;
  modelValue.value = Math.max(0, modelValue.value - step);
  emit('prev', modelValue.value);
  emit('change', modelValue.value);
};

const handleNext = () => {
  if (disabled || modelValue.value + step >= total) return;
  modelValue.value = Math.min(total - 1, modelValue.value + step);
  emit('next', modelValue.value);
  emit('change', modelValue.value);
};
</script>

<style scoped lang="less">
.base-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 1.8rem;

  &.size-sm {
    gap: 0.35rem;
    .page-indicator {
      font-size: 0.72rem;
      min-width: 4.5rem;
    }
  }

  &.size-md {
    gap: 0.5rem;
    .page-indicator {
      font-size: 0.78rem;
      min-width: 5.5rem;
    }
  }

  &.size-lg {
    gap: 0.65rem;
    .page-indicator {
      font-size: 0.85rem;
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
