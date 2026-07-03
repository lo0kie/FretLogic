<template>
  <button
    :disabled="disabled || loading"
    @click="handleInternalClick"
    :style="{ height, width }"
    class="action-button-base w-full flex items-center justify-center font-bold border-solid transition-colors select-none duration-200 disabled:pointer-events-auto disabled:cursor-not-allowed"
    :class="[themeClasses, sizeClasses]"
  >
    <Loader2 v-if="loading" class="w-4 h-4 animate-spin shrink-0 opacity-80" />
    <slot v-else name="prefix"></slot>

    <span class="flex items-center justify-center whitespace-nowrap">
      <slot></slot>
    </span>

    <slot name="suffix"></slot>
  </button>
</template>

<script setup lang="ts">
import { Loader2 } from '@lucide/vue';
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    primary?: boolean;
    danger?: boolean;
    warning?: boolean;
    disabled?: boolean;
    loading?: boolean;
    size?: 'sm' | 'md' | 'lg';
    width?: string;
    height?: string;
  }>(),
  {
    size: 'md',
    loading: false,
  }
);

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void;
}>();

const handleInternalClick = (e: MouseEvent) => {
  emit('click', e);
};

const sizes: Record<(typeof props)['size'], string> = { sm: 'h-[2rem]', md: 'h-[2.25rem]', lg: 'h-[2.5rem]' };

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm':
      return `${sizes[props.size]} px-3 !text-xs gap-1.5`;
    case 'lg':
      return `${sizes[props.size]} px-6 !text-base gap-2.5`;
    case 'md':
    default:
      return `${sizes[props.size]} px-4 !text-[15px] gap-2`;
  }
});

const themeClasses = computed(() => {
  if (props.primary)
    return 'bg-blue-600 border-blue-700/30 dark:border-blue-400/30 text-white hover:opacity-90 active:opacity-80 disabled:opacity-40 disabled:hover:opacity-40';

  if (props.danger)
    return 'text-red-500 border-red-500/20 bg-red-500/10 hover:bg-red-500/20 dark:bg-red-400/10 dark:border-red-400/20 dark:hover:bg-red-400/20 disabled:opacity-50 disabled:hover:bg-red-500/10 dark:disabled:hover:bg-red-400/10';

  if (props.warning)
    return 'text-amber-500 border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-50 disabled:hover:bg-amber-500/10';

  return 'bg-white dark:bg-slate-800 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:border-blue-500/30 hover:bg-blue-50/50 hover:text-blue-600 dark:hover:border-blue-400/30 dark:hover:bg-blue-400/10 dark:hover:text-blue-400 disabled:opacity-50 disabled:hover:bg-white dark:disabled:hover:bg-slate-800 disabled:hover:border-slate-200 dark:disabled:hover:border-white/10 disabled:hover:text-slate-700 dark:disabled:hover:text-slate-300';
});
</script>

<style scoped lang="less">
@import '@/assets/tokens.less';

.action-button-base {
  .mixin-button-base();
}
</style>
