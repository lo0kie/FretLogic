<template>
  <Teleport :disabled="!teleport" to="body">
    <div
      :class="positionClass"
      :style="positionStyle"
      @mouseenter="uiStore.pauseAllTimers"
      @mouseleave="uiStore.resumeAllTimers"
      aria-label="系统通知"
      aria-live="polite"
      aria-relevant="additions text"
      class="z-toast gap-sm pointer-events-none fixed box-border flex flex-col select-none"
      role="region"
    >
      <TransitionGroup :name="transitionName">
        <div
          v-for="(item, index) in displayedToasts"
          :class="[
            TOAST_THEME_MAP[item.type] || TOAST_THEME_MAP.info,
            item.description ? 'py-md! w-auto! items-start! rounded-xl!' : 'whitespace-nowrap',
            stack && index < displayedToasts.length - 1 ? 'scale-[0.98] opacity-90' : '',
            item.customClass,
          ]"
          :key="item.id"
          :role="item.type === 'error' || item.type === 'warning' ? 'alert' : 'status'"
          class="gap-sm px-lg py-sm rounded-pill border-glass-border duration-base pointer-events-auto relative box-border flex w-max max-w-[90vw] shrink-0 items-center border text-xs font-semibold shadow-md transition-all outline-none"
        >
          <slot :item name="card">
            <div :class="{ 'pt-3xs!': item.description }" class="flex shrink-0 items-center justify-center pt-0.5">
              <slot :item name="icon">
                <BaseIcon
                  :class="TOAST_ICON_MAP[item.type]?.iconClass"
                  :name="TOAST_ICON_MAP[item.type]?.name ?? 'info'"
                  aria-hidden="true"
                  size="xl"
                />
              </slot>
            </div>

            <div
              :class="item.description ? 'max-w-sm min-w-0 flex-1! shrink!' : 'whitespace-nowrap'"
              class="flex shrink-0 flex-col"
            >
              <slot :item name="content">
                <span class="text-xs leading-normal font-semibold whitespace-nowrap">
                  {{ item.msg }}
                </span>
                <span
                  v-if="item.description"
                  class="text-2xs mt-2xs leading-relaxed font-normal wrap-break-word whitespace-normal opacity-85"
                >
                  {{ item.description }}
                </span>
              </slot>
            </div>

            <slot :item name="action">
              <button
                v-wave
                v-if="item.onAction"
                :aria-label="`${item.actionText ?? '确定'}操作`"
                @click="handleExecuteAction(item)"
                data-focusable-inline
                class="ml-sm shrink-0 cursor-pointer self-center rounded-sm border-none bg-transparent p-0 text-xs font-bold whitespace-nowrap text-inherit underline opacity-90 outline-none hover:opacity-100"
                type="button"
              >
                {{ item.actionText }}
              </button>
            </slot>

            <button
              v-wave
              v-if="item.closable"
              :class="{ 'pt-3xs! self-start!': item.description }"
              @click="uiStore.removeToast(item.id)"
              data-focusable-inline
              aria-label="关闭通知"
              class="ml-xs p-2xs flex shrink-0 cursor-pointer items-center justify-center self-center rounded-full border-none bg-transparent text-current opacity-50 transition-opacity outline-none hover:opacity-100"
              title="关闭"
              type="button"
            >
              <BaseIcon aria-hidden="true" icon-size="md" icon-stroke="bold" name="x" />
            </button>
          </slot>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useUiStore } from '@/platform/store/uiStore';
import type { Toast, ToastType } from '@/platform/types';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import type { IconName } from '@/platform/ui/icons/icons.registry';

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

/** 各类型提示的图标与附加类（loading 需旋转、其余按类型定透明度） */
const TOAST_ICON_MAP: Record<ToastType, { name: IconName; iconClass: string }> = {
  loading: { name: 'loader-2', iconClass: 'animate-spin opacity-80' },
  success: { name: 'check-circle-2', iconClass: 'opacity-90' },
  error: { name: 'alert-circle', iconClass: 'opacity-90' },
  warning: { name: 'alert-triangle', iconClass: 'opacity-90' },
  info: { name: 'info', iconClass: 'opacity-80' },
};

const POSITION_CLASS_MAP: Record<string, string> = {
  'top-right': 'right-lg items-end',
  'top-left': 'left-lg items-start',
  'bottom-center': 'left-1/2 -translate-x-1/2 items-center',
  'bottom-right': 'right-lg items-end',
  'bottom-left': 'left-lg items-start',
  'top-center': 'left-1/2 -translate-x-1/2 items-center',
};

const positionClass = computed(() => POSITION_CLASS_MAP[props.position] ?? POSITION_CLASS_MAP['top-center']);

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

/** 执行通知动作：无论成败都会移除该通知 */
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
