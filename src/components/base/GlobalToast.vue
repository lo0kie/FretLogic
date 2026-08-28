<template>
  <Teleport to="body" :disabled="!teleport">
    <div
      class="fixed z-toast flex flex-col pointer-events-none box-border gap-sm select-none"
      :class="positionClass"
      :style="positionStyle"
      role="region"
      aria-label="系统通知"
      aria-live="polite"
      aria-relevant="additions text"
      @mouseenter="uiStore.pauseAllTimers"
      @mouseleave="uiStore.resumeAllTimers"
    >
      <TransitionGroup :name="transitionName">
        <div
          v-for="(item, index) in displayedToasts"
          :key="item.id"
          class="relative flex items-center gap-sm px-lg py-sm rounded-pill text-xs font-semibold shadow-md pointer-events-auto border border-glass-border box-border shrink-0 outline-none transition-all duration-base w-max max-w-[90vw]"
          :class="[
            TOAST_THEME_MAP[item.type] || TOAST_THEME_MAP.info,
            item.description ? '!rounded-xl !items-start !py-md !w-auto' : 'whitespace-nowrap',
            stack && index < displayedToasts.length - 1 ? 'scale-[0.98] opacity-90' : '',
            item.customClass,
          ]"
          :role="item.type === 'error' || item.type === 'warning' ? 'alert' : 'status'"
        >
          <!-- 作用域插槽：提供完全替换卡片内容的能力，或使用子插槽 -->
          <slot name="card" :item="item">
            <!-- 状态前缀图标 -->
            <div class="shrink-0 flex items-center justify-center pt-0.5" :class="{ '!pt-3xs': item.description }">
              <slot name="icon" :item="item">
                <Loader2 v-if="item.type === 'loading'" :size="16" class="opacity-80 animate-spin" aria-hidden="true" />
                <CheckCircle2 v-else-if="item.type === 'success'" :size="16" class="opacity-90" aria-hidden="true" />
                <AlertCircle v-else-if="item.type === 'error'" :size="16" class="opacity-90" aria-hidden="true" />
                <AlertTriangle v-else-if="item.type === 'warning'" :size="16" class="opacity-90" aria-hidden="true" />
                <Info v-else :size="16" class="opacity-80" aria-hidden="true" />
              </slot>
            </div>

            <!-- 文本与描述内容区（单行消息绝对禁止折行，宽度完全由文本自适应撑开） -->
            <div
              class="flex flex-col shrink-0"
              :class="item.description ? '!shrink !flex-1 min-w-0 max-w-sm' : 'whitespace-nowrap'"
            >
              <slot name="content" :item="item">
                <span class="text-xs font-semibold leading-normal whitespace-nowrap">
                  {{ item.msg }}
                </span>
                <span
                  v-if="item.description"
                  class="text-2xs font-normal opacity-85 leading-relaxed mt-2xs whitespace-normal break-words"
                >
                  {{ item.description }}
                </span>
              </slot>
            </div>

            <!-- 操作按钮 -->
            <slot name="action" :item="item">
              <button
                v-if="item.hasAction && item.onAction"
                v-wave
                type="button"
                class="font-bold underline text-xs ml-sm opacity-90 bg-transparent border-none p-0 text-inherit cursor-pointer outline-none rounded-sm hover:opacity-100 shrink-0 self-center whitespace-nowrap"
                :aria-label="`${item.actionText}操作`"
                data-focusable-inline
                @click="handleExecuteAction(item)"
              >
                {{ item.actionText }}
              </button>
            </slot>

            <!-- 关闭按钮 -->
            <button
              v-if="item.closable"
              v-wave
              type="button"
              class="shrink-0 ml-xs flex items-center justify-center bg-transparent border-none rounded-full text-current opacity-50 cursor-pointer p-2xs outline-none hover:opacity-100 transition-opacity self-center"
              :class="{ '!self-start !pt-3xs': item.description }"
              title="关闭"
              aria-label="关闭通知"
              data-focusable-inline
              @click="uiStore.removeToast(item.id)"
            >
              <X :size="14" :stroke-width="2.5" aria-hidden="true" />
            </button>
          </slot>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useUiStore } from '@/stores/uiStore';
import type { Toast, ToastType } from '@/types';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2, X } from '@lucide/vue';
import { computed } from 'vue';

type ToastPosition = 'top-center' | 'top-right' | 'top-left' | 'bottom-center' | 'bottom-right' | 'bottom-left';

const props = withDefaults(
  defineProps<{
    position?: ToastPosition;
    teleport?: boolean;
    /** 最大显示数量，超出时只渲染最新的 N 条 */
    maxCount?: number;
    /** 是否开启层叠微缩微动效 */
    stack?: boolean;
  }>(),
  {
    position: 'top-center',
    teleport: true,
    maxCount: 5,
    stack: false,
  }
);

const uiStore = useUiStore();

const displayedToasts = computed(() => {
  if (!props.maxCount || props.maxCount <= 0) return uiStore.toasts;
  return uiStore.toasts.slice(-props.maxCount);
});

const TOAST_THEME_MAP: Record<ToastType, string> = {
  success: 'bg-tint-success-82 text-success',
  error: 'bg-tint-danger-82 text-danger',
  warning: 'bg-tint-warning-82 text-warning',
  loading: 'bg-tint-primary-82 text-primary',
  info: 'bg-bg-panel text-text-title',
};

const positionClass = computed(() => {
  switch (props.position) {
    case 'top-right':
      return 'right-lg items-end';
    case 'top-left':
      return 'left-lg items-start';
    case 'bottom-center':
      return 'left-1/2 -translate-x-1/2 items-center';
    case 'bottom-right':
      return 'right-lg items-end';
    case 'bottom-left':
      return 'left-lg items-start';
    case 'top-center':
    default:
      return 'left-1/2 -translate-x-1/2 items-center';
  }
});

// 叠加安全区边距（Safe Area Insets）
const positionStyle = computed(() => {
  if (props.position.startsWith('bottom')) {
    return {
      bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
    };
  }
  return {
    top: 'calc(1rem + env(safe-area-inset-top, 0px))',
  };
});

const transitionName = computed(() =>
  props.position.startsWith('bottom') ? 'v-transition-slide-up' : 'v-transition-slide-down'
);

const handleExecuteAction = async (item: Toast) => {
  if (item.onAction) {
    try {
      await item.onAction();
    } catch (err) {
      console.error('[Toast] Action execution failed:', err);
    } finally {
      uiStore.removeToast(item.id);
    }
  }
};
</script>
