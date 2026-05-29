<template>
  <button
    :disabled="disabled"
    @click="$emit('click')"
    class="action-button-base flex items-center justify-center transition-colors duration-200 disabled:pointer-events-auto disabled:cursor-not-allowed"
    :class="themeClasses"
  >
    <slot></slot>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  primary?: boolean;
  danger?: boolean;
  warning?: boolean;
  disabled?: boolean;
}>();

defineEmits<{ (e: 'click'): void }>();

const themeClasses = computed(() => {
  // Primary: 纯色背景 + 淡淡的同色系加深边框 (提升质感)
  if (props.primary)
    return 'bg-blue-600 border-blue-700/30 dark:border-blue-400/30 text-white hover:opacity-90 active:opacity-80 disabled:opacity-40 disabled:hover:opacity-40';

  // Danger: 透明红背景 + 淡淡的红色边框
  if (props.danger)
    return 'text-red-500 border-red-500/20 bg-red-500/10 hover:bg-red-500/20 dark:bg-red-400/10 dark:border-red-400/20 dark:hover:bg-red-400/20 disabled:opacity-50 disabled:hover:bg-red-500/10 dark:disabled:hover:bg-red-400/10';

  // Warning: 透明黄背景 + 淡淡的黄色边框
  if (props.warning)
    return 'text-amber-500 border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-50 disabled:hover:bg-amber-500/10';

  // Default: 浅色淡灰边框 / 深色淡白边框；悬浮时呈现淡淡的主题色边框
  return 'bg-white dark:bg-slate-800 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:border-blue-500/30 hover:bg-blue-50/50 hover:text-blue-600 dark:hover:border-blue-400/30 dark:hover:bg-blue-400/10 dark:hover:text-blue-400 disabled:opacity-50 disabled:hover:bg-white dark:disabled:hover:bg-slate-800 disabled:hover:border-slate-200 dark:disabled:hover:border-white/10 disabled:hover:text-slate-700 dark:disabled:hover:text-slate-300';
});
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

.action-button-base {
  .mixin-button-base();
  width: 100%;
}
</style>
