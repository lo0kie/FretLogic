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

// ==========================================================================
// 🛠️ 局部私有局部原子级状态 Mixins（收拢、对齐资产管理）
// ==========================================================================

// A. 皇家蓝主按钮总线
.mixin-variant-primary() {
  background-color: @brand-primary;
  border-color: @brand-primary;
  color: #ffffff;
  font-weight: 900;

  &:not(:disabled):hover {
    opacity: 0.9;
  }
  &:not(:disabled):active {
    opacity: 0.8;
  }

  &:disabled:hover,
  &:disabled:active,
  &:disabled:focus {
    opacity: 1 !important;
    background-color: @brand-primary !important;
    border-color: @brand-primary !important;
    color: #ffffff !important;
  }
}

// B. 毁灭红危险按钮总线（包含深色模式自适应融合）
.mixin-variant-danger() {
  color: @brand-danger;
  border-color: color-mix(in srgb, @brand-danger, transparent 80%);
  background-color: rgba(239, 68, 68, 0.08);

  &:not(:disabled):hover {
    background-color: rgba(239, 68, 68, 0.15);
  }

  :global(.dark) & {
    background-color: rgba(248, 113, 113, 0.1);
    border-color: color-mix(in srgb, #f87171, transparent 80%);
    &:not(:disabled):hover {
      background-color: rgba(248, 113, 113, 0.2);
    }
  }

  &:disabled:hover,
  &:disabled:active,
  &:disabled:focus {
    background-color: rgba(239, 68, 68, 0.08) !important;
    border-color: color-mix(in srgb, @brand-danger, transparent 80%) !important;
    color: @brand-danger !important;

    :global(.dark) & {
      background-color: rgba(248, 113, 113, 0.1) !important;
      border-color: color-mix(in srgb, #f87171, transparent 80%) !important;
    }
  }
}

// C. 琥珀黄警告按钮总线
.mixin-variant-warning() {
  color: @brand-secondary;
  border-color: color-mix(in srgb, @brand-secondary, transparent 80%);
  background-color: rgba(245, 158, 11, 0.08);

  &:not(:disabled):hover {
    background-color: rgba(245, 158, 11, 0.15);
  }

  &:disabled:hover,
  &:disabled:active,
  &:disabled:focus {
    background-color: rgba(245, 158, 11, 0.08) !important;
    border-color: color-mix(in srgb, @brand-secondary, transparent 80%) !important;
    color: @brand-secondary !important;
  }
}

// D. 极客灰次要/默认按钮总线
.mixin-variant-default() {
  background-color: var(--bg-panel);
  border-color: var(--control-border);
  padding-left: 0.5rem;
  padding-right: 0.5rem;

  &:not(:disabled):hover {
    border-color: @brand-primary;
    color: @brand-primary;
  }

  &:disabled:hover,
  &:disabled:active,
  &:disabled:focus {
    background-color: var(--bg-panel) !important;
    border-color: var(--control-border) !important;
    color: @text-body !important;
  }
}

// ==========================================================================
// 🧭 主体骨架结构
// ==========================================================================
.action-button-base {
  .mixin-button-base();
  width: 100%;
  color: @text-body;
  background-color: transparent;
  transition: all 0.2s @bezier-standard;

  /* 1. 主按钮变体 */
  &.is-primary {
    .mixin-variant-primary();
  }

  /* 2. 危险/删除变体 */
  &.is-danger {
    .mixin-variant-danger();
  }

  /* 3. 警告变体 */
  &.is-warning {
    .mixin-variant-warning();
  }

  /* 4. 默认/次要变体 */
  &.is-default {
    .mixin-variant-default();
  }

  // ==========================================================================
  // 🔒 全局 pointer-events 安全框架（纯物理约束层）
  // ==========================================================================
  &.is-disabled {
    opacity: 0.4 !important;
    cursor: not-allowed !important;
    pointer-events: auto !important;
    transform: none !important;
    box-shadow: none !important;
  }
}
</style>
