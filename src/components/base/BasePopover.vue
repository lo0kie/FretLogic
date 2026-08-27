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
      @focusin="handleTriggerFocusIn"
      @focusout="handleTriggerFocusOut"
      @click="handleTriggerClick"
      @contextmenu="handleTriggerContextMenu"
    >
      <slot name="trigger" :is-open="model" :toggle="toggle" :open="open" :close="close" />
    </div>
  </div>

  <Teleport :to="teleportTo ?? 'body'" :disabled="disabledTeleport">
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
          role="dialog"
          :aria-modal="false"
          :aria-label="ariaLabel"
          class="popover-panel relative z-10 box-border outline-none bg-bg-elevated border border-glass-border rounded-md shadow-floating backdrop-blur-xl origin-top"
          :class="panelClass"
          :style="panelStyle"
          tabindex="-1"
          @mouseenter="handlePanelMouseEnter"
          @mouseleave="handlePanelMouseLeave"
          @focusout="handleFocusOut"
          @keydown="handlePanelKeydown"
        >
          <div v-if="showArrow" ref="arrowRef" class="popover-arrow pointer-events-none" :style="arrowStyle" />
          <slot :close="close" />
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<script lang="ts">
const globalFloatingReferenceMap = new WeakMap<HTMLElement, HTMLElement>();
</script>

<script setup lang="ts">
import {
  autoUpdate,
  flip,
  arrow as floatingArrow,
  size as floatingSize,
  limitShift,
  offset,
  shift,
  useFloating,
  type Middleware,
  type Placement,
  type VirtualElement,
} from '@floating-ui/vue';
import { useEventListener } from '@vueuse/core';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  unref,
  useTemplateRef,
  watch,
  type CSSProperties,
  type MaybeRef,
} from 'vue';

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
  matchTriggerWidth = false,
  matchTriggerWidthStrategy = 'width',
  showArrow = false,
  block = false,
  teleportTo = 'body',
  disabledTeleport = false,
  ariaLabel = '弹出面板',
  panelClass = '',
  panelStyle = {},
  transitionName = 'v-transition-scale',
  virtualRef = null,
  autoFocus = false,
} = defineProps<{
  trigger?: 'click' | 'hover' | 'focus' | 'contextmenu';
  hoverOpenDelay?: number;
  hoverCloseDelay?: number;
  placement?: Placement;
  disabled?: boolean;
  offsetDistance?: number;
  closeOnClickOutside?: boolean;
  closeOnEsc?: boolean;
  closeOnFocusOut?: boolean;
  matchTriggerWidth?: boolean;
  matchTriggerWidthStrategy?: 'width' | 'minWidth';
  showArrow?: boolean;
  block?: boolean;
  teleportTo?: string | HTMLElement;
  disabledTeleport?: boolean;
  ariaLabel?: string;
  panelClass?: string | string[] | Record<string, boolean>;
  panelStyle?: CSSProperties;
  transitionName?: string;
  virtualRef?: MaybeRef<VirtualElement | null>;
  autoFocus?: boolean;
}>();

const emit = defineEmits<{
  (e: 'open'): void;
  (e: 'close'): void;
}>();

const model = defineModel<boolean>({ default: false });
const referenceRef = useTemplateRef<HTMLElement>('referenceRef');
const floatingRef = useTemplateRef<HTMLElement>('floatingRef');
const panelRef = useTemplateRef<HTMLDivElement>('panelRef');
const arrowRef = useTemplateRef<HTMLElement>('arrowRef');
const isMounted = ref(false);
const isShown = ref(false);
const contextMenuVirtualRef = ref<VirtualElement | null>(null);

/** 当前是否有指针按住（用于忽略拖拽过程中的 focusout） */
const isPointerDown = ref(false);

const activeReference = computed(() => unref(virtualRef) || contextMenuVirtualRef.value || referenceRef.value);

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
          if (matchTriggerWidthStrategy === 'minWidth') {
            Object.assign(elements.floating.style, {
              minWidth: `${rects.reference.width}px`,
            });
          } else {
            Object.assign(elements.floating.style, {
              width: `${rects.reference.width}px`,
            });
          }
        },
      })
    );
  }
  if (showArrow) {
    m.push(floatingArrow({ element: () => arrowRef.value, padding: 6 }));
  }
  return m;
});

const {
  floatingStyles: computedFloatingStyles,
  middlewareData,
  placement: currentPlacement,
  update,
} = useFloating(activeReference, floatingRef, {
  strategy: 'fixed',
  placement: computed(() => placement),
  whileElementsMounted: autoUpdate,
  middleware: middlewareList,
});

const floatingStyles = computed<CSSProperties>(() => ({
  ...computedFloatingStyles.value,
}));

const arrowStyle = computed<CSSProperties>(() => {
  if (!showArrow || !middlewareData.value.arrow) return {};
  const { x, y } = middlewareData.value.arrow;
  const activeSide = (currentPlacement.value || placement).split('-')[0] as 'top' | 'bottom' | 'left' | 'right';
  const staticSide = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[activeSide];
  const border: Record<string, string> = {
    borderTopWidth: staticSide === 'top' ? '0px' : '1px',
    borderBottomWidth: staticSide === 'bottom' ? '0px' : '1px',
    borderLeftWidth: staticSide === 'left' ? '0px' : '1px',
    borderRightWidth: staticSide === 'right' ? '0px' : '1px',
  };
  return {
    position: 'absolute',
    width: '8px',
    height: '8px',
    background: 'var(--color-bg-elevated)',
    borderStyle: 'solid',
    borderColor: 'var(--color-glass-border)',
    transform: 'rotate(45deg)',
    zIndex: 0,
    left: x != null ? `${x}px` : '',
    top: y != null ? `${y}px` : '',
    [staticSide]: '-4px',
    ...border,
  };
});

let hoverTimer: ReturnType<typeof setTimeout> | null = null;
const clearHoverTimer = () => {
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
};

watch(
  [floatingRef, activeReference],
  ([el, refEl]) => {
    if (el && refEl instanceof HTMLElement) globalFloatingReferenceMap.set(el, refEl);
  },
  { immediate: true }
);

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
    if (autoFocus) {
      await nextTick();
      const firstFocusable = panelRef.value?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      (firstFocusable || panelRef.value)?.focus();
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
  contextMenuVirtualRef.value = null;
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

const handleTriggerClick = () => {
  if (trigger !== 'click' || disabled) return;
  toggle();
};

const handleTriggerContextMenu = (e: MouseEvent) => {
  if (trigger !== 'contextmenu' || disabled) return;
  e.preventDefault();
  contextMenuVirtualRef.value = {
    getBoundingClientRect() {
      return {
        x: e.clientX,
        y: e.clientY,
        top: e.clientY,
        bottom: e.clientY,
        left: e.clientX,
        right: e.clientX,
        width: 0,
        height: 0,
      };
    },
  };
  open();
};

const handleTriggerFocusIn = () => {
  if (trigger !== 'focus' || disabled) return;
  open();
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

const isChildFloatingLayer = (el: HTMLElement | null): boolean => {
  if (!el) return false;
  let targetFloating = el.closest<HTMLElement>('[data-floating-layer]');
  while (targetFloating && targetFloating !== floatingRef.value) {
    const childTrigger = globalFloatingReferenceMap.get(targetFloating);
    if (!childTrigger) return false;
    if (panelRef.value?.contains(childTrigger) || referenceRef.value?.contains(childTrigger)) {
      return true;
    }
    targetFloating = childTrigger.closest<HTMLElement>('[data-floating-layer]');
  }
  return false;
};

const isEventInside = (target: EventTarget | null): boolean => {
  if (!(target instanceof Node)) return false;
  if (referenceRef.value?.contains(target)) return true;
  if (panelRef.value?.contains(target)) return true;
  if (target instanceof HTMLElement && isChildFloatingLayer(target)) return true;
  return false;
};

// ─── 关键：用 pointerdown 做 outside，而不是 click ───
// 只有「按下点」在外部才关闭 → 内按下、外松开不会关
useEventListener(
  window,
  'pointerdown',
  (e: PointerEvent) => {
    isPointerDown.value = true;

    if (!closeOnClickOutside || !model.value || !isShown.value) return;
    if (e.button === 2) return; // 右键留给 ContextMenu
    if (isEventInside(e.target)) return;

    close();
  },
  true
);

useEventListener(
  window,
  'pointerup',
  () => {
    isPointerDown.value = false;
  },
  true
);

useEventListener(
  window,
  'pointercancel',
  () => {
    isPointerDown.value = false;
  },
  true
);

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
  // 鼠标拖拽过程中的失焦不关（例如选项 focus 后拖到外面松开）
  if (isPointerDown.value) return;

  const nextFocused = e.relatedTarget as HTMLElement | null;
  if (nextFocused) {
    if (isEventInside(nextFocused)) return;
    close();
  }
};

const handleTriggerFocusOut = (e: FocusEvent) => {
  if (!closeOnFocusOut || !model.value) return;
  if (isPointerDown.value) return;
  if (trigger !== 'focus') return;

  const nextFocused = e.relatedTarget as HTMLElement | null;
  if (nextFocused && isEventInside(nextFocused)) return;
  close();
};

const handlePanelKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && closeOnEsc) {
    e.preventDefault();
    e.stopPropagation();
    close();
  }
};

onBeforeUnmount(clearHoverTimer);

defineExpose({ open, close, toggle, update });
</script>
