<template>
  <div
    class="toast-global-container"
    role="region"
    aria-label="系统通知"
    @mouseenter="uiStore.pauseAllTimers"
    @mouseleave="uiStore.resumeAllTimers"
  >
    <TransitionGroup name="toast-transition">
      <div
        v-for="item in uiStore.toasts"
        :key="item.id"
        class="toast-item-card"
        :class="[`theme-${item.type}`, { 'has-close': item.closable }]"
        :role="item.type === 'error' || item.type === 'warning' ? 'alert' : 'status'"
        :aria-live="item.type === 'error' || item.type === 'warning' ? 'assertive' : 'polite'"
        :aria-atomic="true"
      >
        <Loader2 v-if="item.type === 'loading'" class="toast-loading-spinner" aria-hidden="true" />
        <span>{{ item.msg }}</span>

        <button
          v-if="item.hasAction && item.onAction"
          v-wave
          type="button"
          class="btn-toast-undo"
          :aria-label="`${item.actionText}操作`"
          data-focusable-inline
          @click="handleExecuteAction(item)"
        >
          {{ item.actionText }}
        </button>

        <button
          v-if="item.closable"
          v-wave
          type="button"
          class="btn-toast-close"
          title="关闭"
          aria-label="关闭通知"
          data-focusable-inline
          @click="uiStore.removeToast(item.id)"
        >
          <X class="close-icon" stroke-width="3" aria-hidden="true" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { useUiStore } from '@/stores/uiStore';
import type { Toast } from '@/types';
import { Loader2, X } from '@lucide/vue';

const uiStore = useUiStore();

const handleExecuteAction = (item: Toast) => {
  if (item.onAction) {
    item.onAction();
    uiStore.removeToast(item.id);
  }
};
</script>

<style scoped lang="scss">
.toast-global-container {
  position: fixed;
  top: 1.5rem;
  right: 1.5rem;
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column;
  gap: $space-sm;
  align-items: flex-end;
  pointer-events: none;
  box-sizing: border-box;
}

.toast-item-card {
  position: relative;
  padding: $space-sm $space-lg;
  border-radius: $radius-pill;
  font-weight: 600;
  box-shadow: $shadow-lg;
  display: flex;
  align-items: center;
  gap: $space-sm;
  font-size: $fs-xs;
  pointer-events: auto;
  border: 1px solid var(--glass-border);
  box-sizing: border-box;
  transition:
    transform $duration-base $bezier-standard,
    opacity $duration-base $bezier-standard;
  white-space: nowrap;
  flex-shrink: 0;
  outline: none;

  &:focus-within {
    box-shadow: $focus-ring-primary;
  }

  &.has-close {
    padding-right: 2rem;
  }
}

.btn-toast-close {
  position: absolute;
  top: 50%;
  right: 0.5rem;
  transform: translateY(-50%);
  width: 1.1rem;
  height: 1.1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 50%;
  color: currentColor;
  opacity: 0.5;
  cursor: pointer;
  padding: 0;
  transition: $transition-fast;
  outline: none;

  &:hover {
    opacity: 1;
    background-color: var(--tint-current-85);
  }
}

.close-icon {
  width: 0.65rem;
  height: 0.65rem;
}

.toast-loading-spinner {
  width: 0.85rem;
  height: 0.85rem;
  opacity: 0.8;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.btn-toast-undo {
  font-weight: 700;
  text-decoration: underline;
  font-size: $fs-xs;
  margin-left: 0.25rem;
  opacity: 0.9;
  background: transparent;
  border: none;
  padding: 0;
  color: inherit;
  cursor: pointer;
  outline: none;
  border-radius: $radius-sm;

  &:hover {
    opacity: 1;
  }
}

/* 去 blur 后背景需不透明：用主题色向面板色混合（82% 面板 + 18% 主题色）保证文字可读 */
.theme-success {
  background-color: var(--tint-success-82);
  color: var(--color-success);
}

.theme-error {
  background-color: var(--tint-danger-82);
  color: var(--color-danger);
}

.theme-warning {
  background-color: var(--tint-warning-82);
  color: var(--color-warning);
}

.theme-loading {
  background-color: var(--tint-primary-82);
  color: var(--color-primary);
}

.theme-info {
  background-color: var(--bg-panel);
  color: var(--text-title);
}

.toast-transition-enter-active {
  transition:
    transform $duration-base $bezier-spring,
    opacity $duration-base $bezier-standard;
}

.toast-transition-leave-active {
  transition:
    transform $duration-fast $bezier-standard,
    opacity $duration-fast $bezier-standard;
  position: absolute !important;
  pointer-events: none;
}

.toast-transition-enter-from {
  opacity: 0;
  transform: translateY(-16px) scale(0.92);
}

.toast-transition-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.96);
}

.toast-transition-move {
  transition: transform $duration-base $bezier-spring;
}
</style>
