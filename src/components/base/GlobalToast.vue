<template>
  <div
    class="fixed top-4 left-1/2 -translate-x-1/2 z-toast flex flex-col items-center gap-xs pointer-events-none box-border"
    role="region"
    aria-label="系统通知"
    @mouseenter="uiStore.pauseAllTimers"
    @mouseleave="uiStore.resumeAllTimers"
  >
    <TransitionGroup name="v-transition-slide-down">
      <div
        v-for="item in uiStore.toasts"
        :key="item.id"
        class="relative inline-flex items-center gap-xs py-1.5 px-3.5 rounded-full text-xs font-semibold shadow-md pointer-events-auto border border-glass-border box-border whitespace-nowrap shrink-0 outline-none transition-all duration-base focus-within:ring-2 focus-within:ring-primary/70"
        :class="[TOAST_THEME_MAP[item.type] || TOAST_THEME_MAP.info, { '!pr-8': item.closable }]"
        :role="item.type === 'error' || item.type === 'warning' ? 'alert' : 'status'"
        :aria-live="item.type === 'error' || item.type === 'warning' ? 'assertive' : 'polite'"
        :aria-atomic="true"
      >
        <Loader2
          v-if="item.type === 'loading'"
          class="w-3.5 h-3.5 opacity-80 shrink-0 animate-spin"
          aria-hidden="true"
        />
        <span> {{ item.msg }} </span>

        <button
          v-if="item.hasAction && item.onAction"
          v-wave
          type="button"
          class="font-bold underline text-xs ml-1 opacity-90 bg-transparent border-none p-0 text-inherit cursor-pointer outline-none rounded-sm hover:opacity-100"
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
          class="absolute top-1/2 right-2 -translate-y-1/2 w-4 h-4 flex items-center justify-center bg-transparent border-none rounded-full text-current opacity-50 cursor-pointer p-0 outline-none hover:opacity-100"
          title="关闭"
          aria-label="关闭通知"
          data-focusable-inline
          @click="uiStore.removeToast(item.id)"
        >
          <X class="w-2.5 h-2.5" stroke-width="3" aria-hidden="true" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { useUiStore } from '@/stores/uiStore';
import type { Toast, ToastType } from '@/types';
import { Loader2, X } from '@lucide/vue';

const uiStore = useUiStore();

const TOAST_THEME_MAP: Record<ToastType, string> = {
  success: 'bg-tint-success-82 text-success',
  error: 'bg-tint-danger-82 text-danger',
  warning: 'bg-tint-warning-82 text-warning',
  loading: 'bg-tint-primary-82 text-primary',
  info: 'bg-bg-panel text-text-title',
};

const handleExecuteAction = (item: Toast) => {
  if (item.onAction) {
    item.onAction();
    uiStore.removeToast(item.id);
  }
};
</script>
