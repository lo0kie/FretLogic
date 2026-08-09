<template>
  <div class="base-pagination" :class="[`size-${size}`]">
    <ActionButton :size="size" variant="ghost" icon-only :disabled="modelValue <= 0" @click="handlePrev">
      <ChevronLeft :size="iconSize" />
    </ActionButton>

    <span class="page-indicator">第 {{ modelValue + 1 }} / {{ total }} 页</span>

    <ActionButton :size="size" variant="ghost" icon-only :disabled="modelValue >= total - 1" @click="handleNext">
      <ChevronRight :size="iconSize" />
    </ActionButton>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import { ChevronLeft, ChevronRight } from '@lucide/vue';
import { computed } from 'vue';

const { total, size = 'md' } = defineProps<{
  total: number;
  size?: 'sm' | 'md' | 'lg';
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
  if (modelValue.value > 0) {
    modelValue.value--;
    emit('prev', modelValue.value);
    emit('change', modelValue.value);
  }
};

const handleNext = () => {
  if (modelValue.value < total - 1) {
    modelValue.value++;
    emit('next', modelValue.value);
    emit('change', modelValue.value);
  }
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
