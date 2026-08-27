<template>
  <div v-if="$slots.trigger" class="popover-wrapper relative inline-flex" :class="{ 'flex w-full': block }">
    <div
      ref="referenceRef"
      class="popover-trigger inline-flex"
      :class="{ 'flex flex-1 w-full': block }"
      :aria-expanded="model"
      aria-haspopup="dialog"
      @mouseenter="handleTriggerMouseEnter"
      @mouseleave="handleTriggerMouseLeave"
      @focusout="handleTriggerFocusOut"
    >
      <slot name="trigger" :is-open="model" :toggle="toggle" :open="open" :close="close" />
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="isMounted"
      ref="floatingRef"
      data-floating-layer
      class="popover-floating-host z-menu pointer-events-auto"
      :style="floatingStyles"
    >
      <Transition appear :name="transitionName" @after-leave="handleAfterLeave">
        <div
          v-if="isShown"
          ref="panelRef"
          v-on-click-outside="[handleClickOutside, { ignore: [referenceRef] }]"
          role="dialog"
          :aria-modal="false"
          :aria-label="ariaLabel"
          class="popover-panel box-border outline-none bg-bg-elevated border border-glass-border rounded-md shadow-floating backdrop-blur-xl origin-top"
          :class="panelClass"
          :style="panelStyle"
          tabindex="-1"
          @mouseenter="handlePanelMouseEnter"
          @mouseleave="handlePanelMouseLeave"
          @focusout="handleFocusOut"
          @keydown="handlePanelKeydown"
        >
          <slot :close="close" />
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import {
  autoUpdate,
  flip,
  size as floatingSize,
  limitShift,
  offset,
  shift,
  useFloating,
  type Middleware,
  type Placement,
  type VirtualElement,
} from '@floating-ui/vue';
import { vOnClickOutside } from '@vueuse/components';
import { useEventListener } from '@vueuse/core';
import type { CSSProperties, MaybeRef } from 'vue';
import { computed, nextTick, ref, unref, useTemplateRef, watch } from 'vue';

// 解构默认值（本组件无"默认值需要访问其它 props"的项，故全部以解构默认值设置）
const {
  trigger = 'click',
  hoverOpenDelay = 50,
  hoverCloseDelay = 150,
  placement = 'bottom',
  disabled = false,
  offsetDistance = 8,
  closeOnClickOutside = true,
  closeOnEsc = true,
  closeOnFocusOut = true,
  autoFocus = true,
  matchTriggerWidth = false,
  block = false,
  ariaLabel = '弹出面板',
  panelClass = '',
  panelStyle = {},
  transitionName = 'v-transition-scale',
  virtualRef = null,
} = defineProps<{
  trigger?: 'click' | 'hover';
  hoverOpenDelay?: number;
  hoverCloseDelay?: number;
  placement?: Placement;
  disabled?: boolean;
  offsetDistance?: number;
  closeOnClickOutside?: boolean;
  closeOnEsc?: boolean;
  closeOnFocusOut?: boolean; // 是否在失去焦点时关闭
  autoFocus?: boolean; // 打开时是否自动聚焦内部
  matchTriggerWidth?: boolean; // 浮层宽度是否与触发器保持一致 (如下拉框)
  block?: boolean; // 触发器是否占满父级宽度
  ariaLabel?: string;
  panelClass?: string | string[] | Record<string, boolean>;
  panelStyle?: CSSProperties;
  transitionName?: string;
  virtualRef?: MaybeRef<VirtualElement | null>;
}>();

const emit = defineEmits<{
  (e: 'open'): void;
  (e: 'close'): void;
}>();

const model = defineModel<boolean>({ default: false });

const referenceRef = useTemplateRef<HTMLElement>('referenceRef');
const floatingRef = useTemplateRef<HTMLElement>('floatingRef');
const panelRef = useTemplateRef<HTMLDivElement>('panelRef');

const isMounted = ref(false);
const isShown = ref(false);

const activeReference = computed(() => unref(virtualRef) || referenceRef.value);

const middlewareList = computed(() => {
  const m: Middleware[] = [
    offset(offsetDistance),
    flip({
      fallbackPlacements: ['top', 'bottom-end', 'bottom-start', 'top-end', 'top-start', 'left', 'right'],
      padding: 8,
    }),
    shift({ padding: 12, limiter: limitShift() }),
  ];

  if (matchTriggerWidth) {
    m.push(
      floatingSize({
        apply({ rects, elements }) {
          Object.assign(elements.floating.style, {
            width: `${rects.reference.width}px`,
          });
        },
      })
    );
  }
  return m;
});

const { floatingStyles: computedFloatingStyles, update } = useFloating(activeReference, floatingRef, {
  strategy: 'fixed',
  placement: computed(() => placement),
  whileElementsMounted: autoUpdate,
  middleware: middlewareList,
});

const floatingStyles = computed<CSSProperties>(() => ({
  ...computedFloatingStyles.value,
}));

const focusPanelContent = () => {
  if (!panelRef.value) return;
  const focusable = panelRef.value.querySelector<HTMLElement>(
    'button:not([disabled]):not([aria-disabled="true"]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  if (focusable) {
    focusable.focus();
  } else {
    panelRef.value.focus();
  }
};

let hoverTimer: ReturnType<typeof setTimeout> | null = null;

const clearHoverTimer = () => {
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
};

watch(model, async val => {
  if (!val) {
    clearHoverTimer();
    isShown.value = false;
  } else {
    isMounted.value = true;
    await nextTick();
    update();
    if (!model.value) return;
    isShown.value = true;

    if (autoFocus && trigger !== 'hover') {
      await nextTick();
      if (!model.value) return;
      focusPanelContent();
    }
  }
});

const open = async () => {
  if (disabled) return;

  if (model.value) {
    update();
    isShown.value = true;
    return;
  }

  isMounted.value = true;
  model.value = true;
  emit('open');
};

const close = () => {
  if (!model.value && !isShown.value) return;
  isShown.value = false;
  model.value = false;
  emit('close');
};

const handleAfterLeave = () => {
  if (model.value || isShown.value) return;
  isMounted.value = false;
};

const toggle = () => {
  if (model.value) {
    close();
  } else {
    open();
  }
};

const handleTriggerMouseEnter = () => {
  if (trigger !== 'hover' || disabled) return;
  clearHoverTimer();
  hoverTimer = setTimeout(() => {
    open();
  }, hoverOpenDelay);
};

const handleTriggerMouseLeave = () => {
  if (trigger !== 'hover') return;
  clearHoverTimer();
  hoverTimer = setTimeout(() => {
    close();
  }, hoverCloseDelay);
};

const handlePanelMouseEnter = () => {
  if (trigger !== 'hover') return;
  clearHoverTimer();
};

const handlePanelMouseLeave = () => {
  if (trigger !== 'hover') return;
  clearHoverTimer();
  hoverTimer = setTimeout(() => {
    close();
  }, hoverCloseDelay);
};

watch(
  [floatingRef, activeReference],
  ([el, refEl]) => {
    if (el) {
      (el as unknown as { __popoverReference?: HTMLElement | null }).__popoverReference =
        (refEl as HTMLElement | null) || referenceRef.value;
    }
  },
  { immediate: true }
);

const isChildFloatingLayer = (el: HTMLElement | null): boolean => {
  if (!el) return false;
  let targetFloating = el.closest<HTMLElement>('[data-floating-layer]');
  while (targetFloating && targetFloating !== floatingRef.value) {
    const childTrigger = (targetFloating as unknown as { __popoverReference?: HTMLElement | null }).__popoverReference;
    if (!childTrigger) return false;
    if (panelRef.value?.contains(childTrigger) || referenceRef.value?.contains(childTrigger)) {
      return true;
    }
    targetFloating = childTrigger.closest<HTMLElement>('[data-floating-layer]');
  }
  return false;
};

const handleClickOutside = (event: MouseEvent) => {
  if (!closeOnClickOutside || !model.value) return;
  // 放行右键，让 ContextMenu 有机会接管
  if (event?.button === 2 || event?.type === 'contextmenu') return;

  const target = event.target as HTMLElement | null;
  if (!target) return;

  if (referenceRef.value?.contains(target)) return;
  if (panelRef.value?.contains(target)) return;
  if (isChildFloatingLayer(target)) return;

  close();
};

useEventListener(
  window,
  'keydown',
  (e: KeyboardEvent) => {
    if (!model.value || !closeOnEsc) return;
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    close();
  },
  { capture: true }
);

const handleFocusOut = (e: FocusEvent) => {
  if (!closeOnFocusOut || !model.value) return;

  const nextFocused = e.relatedTarget as HTMLElement | null;
  const cardEl = e.currentTarget as HTMLElement;

  if (nextFocused) {
    if (cardEl.contains(nextFocused)) return;
    if (referenceRef.value?.contains(nextFocused)) return;
    if (isChildFloatingLayer(nextFocused)) return;
  }

  close();
};

const handleTriggerFocusOut = (e: FocusEvent) => {
  if (!closeOnFocusOut || !model.value) return;

  const nextFocused = e.relatedTarget as HTMLElement | null;
  if (nextFocused) {
    if (referenceRef.value?.contains(nextFocused)) return;
    if (panelRef.value?.contains(nextFocused)) return;
    if (isChildFloatingLayer(nextFocused)) return;
  }

  if (trigger !== 'hover') {
    close();
  }
};

const handlePanelKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && closeOnEsc) {
    e.preventDefault();
    e.stopPropagation();
    close();
  }
};

defineExpose({ open, close, toggle, update });
</script>
