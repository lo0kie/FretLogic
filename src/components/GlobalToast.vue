<template>
  <div class="toast-global-container" @mouseenter="uiStore.pauseAllTimers" @mouseleave="uiStore.resumeAllTimers">
    <TransitionGroup name="toast-transition">
      <div v-for="item in uiStore.toasts" :key="item.id" class="toast-item-card" :class="getToastThemeClass(item.type)">
        <Loader2 v-if="item.type === 'loading'" class="toast-loading-spinner" />
        <span>{{ item.msg }}</span>

        <button v-if="item.hasAction && item.onAction" @click="handleExecuteAction(item)" class="btn-toast-undo">
          {{ item.actionText }}
        </button>

        <button @click="uiStore.removeToast(item.id)" class="btn-toast-close" title="关闭">
          <X :size="12" :stroke-width="2.5" />
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

const getToastThemeClass = (type: string) => {
  return `theme-${type}`;
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.less';

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
  padding-left: 1rem;
  padding-right: 2.25rem;
  padding-top: 0.625rem;
  padding-bottom: 0.625rem;
  border-radius: @radius-md;
  font-weight: 700;
  box-shadow: @shadow-xl;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.8rem;
  pointer-events: auto;
  box-sizing: border-box;
  transition:
    background-color 0.3s,
    color 0.3s;
  white-space: nowrap;
  flex-shrink: 0;
}

.btn-toast-close {
  position: absolute;
  top: 50%;
  right: 0.5rem;
  transform: translateY(-50%) scale(1);
  width: 1.15rem;
  height: 1.15rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 100%;
  color: currentColor;
  opacity: 0.6;
  cursor: pointer;
  padding: 0;
  transition: @transition-fast;

  &:hover {
    opacity: 1;
    transform: translateY(-50%);
    background-color: color-mix(in srgb, currentColor, transparent 85%);
  }

  &:active {
    transform: translateY(-50%);
    background-color: color-mix(in srgb, currentColor, transparent 75%);
  }

  svg {
    transition: @transition-fast;
  }
}

.toast-loading-spinner {
  width: 1rem;
  height: 1rem;
  opacity: 0.8;
  animation: spin 1s linear infinite;
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
  font-size: 0.7rem;
  margin-left: 0.25rem;
  opacity: 0.9;
  background: transparent;
  border: none;
  padding: 0;
  color: inherit;
  cursor: pointer;
  transition: opacity @duration-fast @bezier-standard;

  &:hover {
    opacity: 1;
  }

  &:active {
    opacity: 0.6;
  }
}

.theme-success {
  background-color: #10b981;
  color: #ffffff;

  :global(.dark) & {
    background-color: #34d399;
    color: #0f172a;
  }
}

.theme-error {
  background-color: #ef4444;
  color: #ffffff;

  :global(.dark) & {
    background-color: #f87171;
    color: #0f172a;
  }
}

.theme-warning {
  background-color: #f59e0b;
  color: #ffffff;

  :global(.dark) & {
    background-color: #fbbf24;
    color: #0f172a;
  }
}

.theme-loading {
  background-color: #2563eb;
  color: #ffffff;

  :global(.dark) & {
    background-color: #3b82f6;
    color: #0f172a;
  }
}

.theme-info {
  background-color: var(--bg-panel, #ffffff);
  color: var(--text-title, #0f172a);
  border: 1px solid var(--control-border, rgba(15, 23, 42, 0.08));

  :global(.dark) & {
    background-color: #020617;
    color: #ffffff;
    border-color: rgba(255, 255, 255, 0.1);
  }
}

.toast-transition-enter-active,
.toast-transition-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.toast-transition-enter-from,
.toast-transition-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

.toast-transition-move {
  transition: transform 0.3s ease;
}

.toast-transition-leave-active {
  position: absolute;
}
</style>
