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
          <X :size="10" :stroke-width="3" />
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
  transition: @transition-fast;
  white-space: nowrap;
  flex-shrink: 0;
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

  &:hover {
    opacity: 1;
    background-color: color-mix(in srgb, currentColor, transparent 85%);
  }
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
</style>
