<template>
  <button
    @click="$emit('click')"
    class="action-button-base"
    :class="{
      'is-primary': primary,
      'is-danger': danger,
      'is-warning': warning,
      'is-default': !primary && !danger && !warning,
    }"
  >
    <slot></slot>
  </button>
</template>

<script setup lang="ts">
// 使用 TypeScript 定义严格的组件输入属性
defineProps<{
  primary?: boolean;
  danger?: boolean;
  warning?: boolean;
}>();

// 声明组件抛出的点击事件
defineEmits<{
  (e: 'click'): void;
}>();
</script>

<style scoped lang="less">
/* 🌟 基础公共行为：抽离原行内不随动态状态改变的类名 */
.action-button-base {
  @apply h-12 flex items-center justify-center rounded-xl font-bold border shadow-sm select-none transform duration-150 ease-out active:scale-[0.96] transition-colors;

  /* 主按钮状态 */
  &.is-primary {
    @apply w-full bg-blue-600 text-white font-black text-sm border-blue-700 shadow-xl hover:bg-blue-700 hover:shadow-md active:bg-blue-800;
  }

  /* 危险/删除按钮状态 */
  &.is-danger {
    @apply w-full text-sm bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20 active:bg-red-500/30;
  }

  /* 警告按钮状态 */
  &.is-warning {
    @apply w-full text-sm bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20 active:bg-amber-500/30;
  }

  /* 默认按钮状态（兼容浅色/深色主题继承） */
  &.is-default {
    @apply w-full border border-slate-400/40 text-xs bg-slate-50/50 dark:bg-slate-800/40 px-2 hover:bg-slate-100 dark:hover:bg-slate-800/80;
  }
}
</style>
