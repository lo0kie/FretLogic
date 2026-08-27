<template>
  <div v-if="total > 0" class="flex items-center justify-center min-h-[1.8rem]" :class="currentConfig.wrapperClass">
    <ActionButton :size variant="ghost" icon-only :disabled="disabled || modelValue <= 0" @click="handlePrev">
      <ChevronLeft :size="iconSize" />
    </ActionButton>

    <span
      class="text-center text-text-disabled tabular-nums leading-snug select-none"
      :class="currentConfig.indicatorClass"
    >
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
import ActionButton from '@/components/base/ActionButton.vue';
import { ChevronLeft, ChevronRight } from '@lucide/vue';
import { computed } from 'vue';

const {
  modelValue,
  total,
  size = 'md',
  step = 1,
  disabled = false,
  formatter,
} = defineProps<{
  modelValue: number;
  total: number;
  size?: 'sm' | 'md' | 'lg';
  step?: number;
  disabled?: boolean;
  formatter?: (current: number, total: number) => string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', page: number): void;
  (e: 'change', page: number): void;
  (e: 'prev', page: number): void;
  (e: 'next', page: number): void;
}>();

const SIZE_TO_ICON: Record<string, number> = {
  sm: 14,
  lg: 18,
  md: 16,
};
const iconSize = computed(() => SIZE_TO_ICON[size] ?? 16);

const PAGINATION_CONFIG: Record<'sm' | 'md' | 'lg', { wrapperClass: string; indicatorClass: string }> = {
  sm: { wrapperClass: 'gap-sm', indicatorClass: 'text-xs min-w-[4.5rem]' },
  md: { wrapperClass: 'gap-sm', indicatorClass: 'text-xs min-w-[5.5rem]' },
  lg: { wrapperClass: 'gap-md', indicatorClass: 'text-sm min-w-[6.5rem]' },
};

const currentConfig = computed(() => PAGINATION_CONFIG[size] ?? PAGINATION_CONFIG.md);

const displayText = computed(() => {
  const current = modelValue + 1;
  if (formatter) {
    return formatter(current, total);
  }
  const rangeStr = step > 1 && current < total ? '-' + Math.min(modelValue + step, total) : '';
  return `第 ${current}${rangeStr} / ${total} 页`;
});

const handlePrev = () => {
  if (disabled || modelValue <= 0) return;
  const nextVal = Math.max(0, modelValue - step);
  emit('update:modelValue', nextVal);
  emit('prev', nextVal);
  emit('change', nextVal);
};

const handleNext = () => {
  if (disabled || modelValue + step >= total) return;
  const nextVal = Math.min(total - 1, modelValue + step);
  emit('update:modelValue', nextVal);
  emit('next', nextVal);
  emit('change', nextVal);
};
</script>
