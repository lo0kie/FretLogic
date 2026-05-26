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
@import '@/assets/styles/tokens.less';

.action-button-base {
  // 🌟 核心复用：直接套用你声明好的动作按钮 Mixin，省去高度、圆角、阴影和 active 缩放
  .mixin-button-base();
  width: 100%;
  color: @text-body;
  background-color: transparent;
  transition: all 0.2s @bezier-standard;

  /* 1. 主按钮状态 (is-primary) */
  &.is-primary {
    background-color: @brand-primary;
    border-color: @brand-primary;
    color: #ffffff;
    font-weight: 900;

    &:not(:disabled):hover {
      opacity: 0.9;
    }
    &:active {
      opacity: 0.8;
    }
  }

  /* 2. 危险/删除按钮状态 (is-danger) */
  &.is-danger {
    color: @brand-danger;
    border-color: currentColor; // 自动读取当前文字颜色作为边框色
    background-color: rgba(239, 68, 68, 0.08);

    &:not(:disabled):hover {
      background-color: rgba(239, 68, 68, 0.15);
    }

    // 🌟 物理对齐暗色变体：完美映射你 .dark 里的 --brand-danger 浅红实现自适应
    :global(.dark) & {
      background-color: rgba(248, 113, 113, 0.1);
      &:not(:disabled):hover {
        background-color: rgba(248, 113, 113, 0.2);
      }
    }
  }

  /* 3. 警告按钮状态 (is-warning) */
  &.is-warning {
    color: @brand-secondary;
    border-color: currentColor;
    background-color: rgba(245, 158, 11, 0.08);

    &:not(:disabled):hover {
      background-color: rgba(245, 158, 11, 0.15);
    }
  }

  /* 4. 默认/次要按钮状态 (is-default) */
  &.is-default {
    // 🌟 精准消费：只使用你现有的 var(--bg-panel) 与 var(--control-border) 原生 CSS 变量系统
    background-color: var(--bg-panel);
    border-color: var(--control-border);
    padding-left: 0.5rem;
    padding-right: 0.5rem;

    &:not(:disabled):hover {
      border-color: @brand-primary;
      color: @brand-primary;
    }
  }
}
</style>
