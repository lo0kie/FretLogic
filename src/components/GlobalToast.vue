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
        :class="getToastThemeClass(item.type)"
        :role="item.type === 'error' || item.type === 'warning' ? 'alert' : 'status'"
        :aria-live="item.type === 'error' || item.type === 'warning' ? 'assertive' : 'polite'"
        :aria-atomic="true"
      >
        <Loader2 v-if="item.type === 'loading'" class="toast-loading-spinner" aria-hidden="true" />
        <span>{{ item.msg }}</span>

        <button
          v-if="item.hasAction && item.onAction"
          type="button"
          @click="handleExecuteAction(item)"
          class="btn-toast-undo"
          :aria-label="`${item.actionText}操作`"
        >
          {{ item.actionText }}
        </button>

        <button
          v-wave
          type="button"
          @click="uiStore.removeToast(item.id)"
          class="btn-toast-close"
          title="关闭"
          aria-label="关闭通知"
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

const getToastThemeClass = (type: string) => `theme-${type}`;
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.toast-global-container {
  position: fixed;
  top: 1.5rem;
  right: 1.5rem;
  z-index: 3000;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: flex-end;
  pointer-events: none;
  box-sizing: border-box;
}

.toast-item-card {
  position: relative;
  padding: 0.55rem 2rem 0.55rem 0.9rem;
  border-radius: 9999px;
  font-weight: 600;
  box-shadow: @shadow-lg;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  pointer-events: auto;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--glass-border);
  box-sizing: border-box;
  transition: all @duration-base @bezier-standard;
  white-space: nowrap;
  flex-shrink: 0;
  outline: none;

  &:focus-within {
    box-shadow: @focus-ring-primary;
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
  transition: @transition-fast;
  outline: none;

  &:focus-visible {
    opacity: 1;
    background-color: color-mix(in srgb, currentColor, transparent 80%);
    box-shadow: 0 0 0 2px currentColor;
  }

  &:hover {
    opacity: 1;
    background-color: color-mix(in srgb, currentColor, transparent 85%);
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
  font-size: 0.72rem;
  margin-left: 0.25rem;
  opacity: 0.9;
  background: transparent;
  border: none;
  padding: 0;
  color: inherit;
  cursor: pointer;
  outline: none;
  border-radius: @radius-sm;

  &:focus-visible {
    opacity: 1;
    box-shadow: 0 0 0 2px currentColor;
  }

  &:hover {
    opacity: 1;
  }
}

.theme-success {
  background-color: color-mix(in srgb, var(--color-success), transparent 85%);
  color: var(--color-success);
}

.theme-error {
  background-color: color-mix(in srgb, var(--color-danger), transparent 85%);
  color: var(--color-danger);
}

.theme-warning {
  background-color: color-mix(in srgb, var(--color-warning), transparent 85%);
  color: var(--color-warning);
}

.theme-loading {
  background-color: color-mix(in srgb, var(--color-primary), transparent 85%);
  color: var(--color-primary);
}

.theme-info {
  background-color: var(--bg-panel);
  color: var(--text-title);
}

:deep(.toast-transition-enter-from) {
  opacity: 0;
  transform: translateY(-12px) scale(0.9);
}

:deep(.toast-transition-leave-to) {
  opacity: 0;
  transform: translateY(-12px) scale(0.9);
}

:deep(.toast-transition-leave-active) {
  position: absolute !important;
  pointer-events: none;
}

:deep(.toast-transition-move) {
  transition: transform @duration-base @bezier-standard;
}

@media (max-width: 768px) {
  .toast-global-container {
    top: 1rem;
    left: 50%;
    right: auto;
    transform: translateX(-50%);
    align-items: center;
    width: calc(100vw - 2rem);
    max-width: 22rem;
  }

  .toast-item-card {
    padding: 0.65rem 2.4rem 0.65rem 1rem;
    font-size: 0.85rem;
    width: auto;
    max-width: 100%;
  }

  .btn-toast-close {
    right: 0.6rem;
    width: 1.35rem;
    height: 1.35rem;
  }

  .close-icon {
    width: 0.8rem;
    height: 0.8rem;
  }

  .btn-toast-undo {
    font-size: 0.8rem;
  }

  .toast-loading-spinner {
    width: 1rem;
    height: 1rem;
  }

  :deep(.toast-transition-enter-from) {
    opacity: 0;
    transform: translateY(-12px) scale(0.95);
  }

  :deep(.toast-transition-leave-to) {
    opacity: 0;
    transform: translateY(-12px) scale(0.95);
  }
}
</style>
