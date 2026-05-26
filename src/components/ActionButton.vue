<template>
  <button
    :disabled="disabled"
    @click="$emit('click')"
    class="action-button-base"
    :class="{
      'is-primary': primary,
      'is-danger': danger,
      'is-warning': warning,
      'is-default': !primary && !danger && !warning,
      'is-disabled': disabled,
    }"
  >
    <slot></slot>
  </button>
</template>

<script setup lang="ts">
// 🌟 扩展 TypeScript 属性定义：加入可选的 disabled 状态
defineProps<{
  primary?: boolean;
  danger?: boolean;
  warning?: boolean;
  disabled?: boolean;
}>();

defineEmits<{
  (e: 'click'): void;
}>();
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

.action-button-base {
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

    // 🌟 修正：只有在非禁用状态下才响应悬浮手势
    &:not(:disabled):hover {
      opacity: 0.9;
    }
    &:not(:disabled):active {
      opacity: 0.8;
    }
  }

  /* 2. 危险/删除按钮状态 (is-danger) */
  &.is-danger {
    color: @brand-danger;
    border-color: currentColor;
    background-color: rgba(239, 68, 68, 0.08);

    &:not(:disabled):hover {
      background-color: rgba(239, 68, 68, 0.15);
    }

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
    background-color: var(--bg-panel);
    border-color: var(--control-border);
    padding-left: 0.5rem;
    padding-right: 0.5rem;

    &:not(:disabled):hover {
      border-color: @brand-primary;
      color: @brand-primary;
    }
  }

  // ==========================================================================
  // 🌟 核心大一统：全局禁用置灰中枢规范
  // ==========================================================================
  &.is-disabled {
    opacity: 0.4 !important; // 极致优雅的空气半透明度
    cursor: not-allowed !important; // 强制物理禁行鼠标指针
    transform: none !important; // 强行废除混入自带的 active 点击缩放形变
    box-shadow: none !important; // 剥离悬浮景深阴影
    pointer-events: unset; // 彻底掐死任何多余的冒泡手势

    // 强制把所有变体下的 hover 边框和背景全部冻结，不展示任何高亮回馈
    &:hover {
      border-color: inherit;
      background-color: inherit;
      color: inherit;
    }
  }
}
</style>
