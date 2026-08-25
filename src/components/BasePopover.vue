<template>
  <div v-if="$slots.trigger" class="popover-wrapper" :class="{ 'is-block': block }">
    <div
      ref="referenceRef"
      class="popover-trigger"
      :class="{ 'is-block': block }"
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
    <div v-if="isMounted" ref="floatingRef" data-floating-layer class="popover-floating-host" :style="floatingStyles">
      <Transition appear :name="transitionName" @after-leave="handleAfterLeave">
        <div
          v-if="isShown"
          ref="panelRef"
          v-on-click-outside="[handleClickOutside, { ignore: [referenceRef, '[data-floating-layer]'] }]"
          role="dialog"
          :aria-modal="false"
          :aria-label="ariaLabel"
          class="popover-panel"
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
import { focusNextInPageAfter, useFocusReturn } from '@/composables/useFocusReturn';
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

const props = withDefaults(
  defineProps<{
    trigger?: 'click' | 'hover';
    hoverOpenDelay?: number;
    hoverCloseDelay?: number;
    placement?: Placement;
    disabled?: boolean;
    offsetDistance?: number;
    closeOnClickOutside?: boolean;
    closeOnEsc?: boolean;
    closeOnFocusOut?: boolean; // 新增：是否在失去焦点时关闭（鼠标点击外部不由该属性控制）
    autoFocus?: boolean; // 新增：打开时是否自动聚焦内部
    matchTriggerWidth?: boolean; // 新增：浮层宽度是否与触发器保持一致 (如下拉框)
    block?: boolean; // 新增：触发器是否占满父级宽度
    ariaLabel?: string;
    panelClass?: string | string[] | Record<string, boolean>;
    panelStyle?: CSSProperties;
    transitionName?: string;
    virtualRef?: MaybeRef<VirtualElement | null>;
  }>(),
  {
    trigger: 'click',
    hoverOpenDelay: 50,
    hoverCloseDelay: 150,
    placement: 'bottom',
    disabled: false,
    offsetDistance: 8,
    closeOnClickOutside: true,
    closeOnEsc: true,
    closeOnFocusOut: true,
    autoFocus: true,
    matchTriggerWidth: false,
    block: false,
    ariaLabel: '弹出面板',
    panelClass: '',
    panelStyle: () => ({}),
    transitionName: 'popover-fade-scale',
    virtualRef: null,
  }
);

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

const activeReference = computed(() => unref(props.virtualRef) || referenceRef.value);

const middlewareList = computed(() => {
  const m: Middleware[] = [
    offset(props.offsetDistance),
    flip({ fallbackPlacements: ['top', 'bottom-end', 'bottom-start', 'top-end', 'top-start'] }),
    shift({ padding: 12, limiter: limitShift() }),
  ];

  if (props.matchTriggerWidth) {
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

const {
  floatingStyles: computedFloatingStyles,
  isPositioned,
  update,
} = useFloating(activeReference, floatingRef, {
  strategy: 'fixed',
  placement: computed(() => props.placement),
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

watch([isMounted, isPositioned], async ([mounted, positioned]) => {
  if (mounted && positioned && !isShown.value && model.value) {
    await nextTick();
    if (!model.value) return;
    isShown.value = true;

    if (props.autoFocus && props.trigger !== 'hover') {
      await nextTick();
      if (!model.value) return;
      focusPanelContent();
    }
  }
});

const { captureTrigger, clearTrigger, restoreFocusAfter } = useFocusReturn({
  warnLabel: '[BasePopover]',
});

const open = async (sourceEl?: HTMLElement | null) => {
  if (props.disabled) return;

  if (model.value) {
    update();
    return;
  }

  const triggerEl = sourceEl ?? (referenceRef.value?.firstElementChild as HTMLElement | null);
  captureTrigger(triggerEl ?? referenceRef.value ?? undefined);
  model.value = true;
  isMounted.value = true;
  emit('open');
};

const close = () => {
  if (!model.value && !isShown.value) return;
  isShown.value = false;
  model.value = false;
  emit('close');
};

const handleAfterLeave = () => {
  restoreFocusAfter(
    () => {
      isMounted.value = false;
    },
    () => {
      const active = document.activeElement;
      if (active && active !== document.body && (!panelRef.value || !panelRef.value.contains(active))) {
        return true;
      }
      return false;
    }
  );
};

const toggle = () => {
  if (model.value) {
    close();
  } else {
    open();
  }
};

let hoverTimer: ReturnType<typeof setTimeout> | null = null;

const clearHoverTimer = () => {
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
};

const handleTriggerMouseEnter = () => {
  if (props.trigger !== 'hover' || props.disabled) return;
  clearHoverTimer();
  hoverTimer = setTimeout(() => {
    open();
  }, props.hoverOpenDelay);
};

const handleTriggerMouseLeave = () => {
  if (props.trigger !== 'hover') return;
  clearHoverTimer();
  hoverTimer = setTimeout(() => {
    close();
  }, props.hoverCloseDelay);
};

const handlePanelMouseEnter = () => {
  if (props.trigger !== 'hover') return;
  clearHoverTimer();
};

const handlePanelMouseLeave = () => {
  if (props.trigger !== 'hover') return;
  clearHoverTimer();
  hoverTimer = setTimeout(() => {
    close();
  }, props.hoverCloseDelay);
};

watch(model, val => {
  if (!val) {
    clearHoverTimer();
  }
  if (val && !isMounted.value) {
    open();
  } else if (!val && isShown.value) {
    close();
  }
});

const handleClickOutside = (event: MouseEvent) => {
  if (!props.closeOnClickOutside || !model.value) return;
  // 放行右键，让 ContextMenu 有机会接管
  if (event?.button === 2 || event?.type === 'contextmenu') return;
  close();
};

useEventListener(
  window,
  'keydown',
  (e: KeyboardEvent) => {
    if (!model.value || !props.closeOnEsc) return;
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    close();
  },
  { capture: true }
);

const handleFocusOut = (e: FocusEvent) => {
  if (!props.closeOnFocusOut || !model.value) return;

  const nextFocused = e.relatedTarget as HTMLElement | null;
  const cardEl = e.currentTarget as HTMLElement;

  if (nextFocused) {
    if (cardEl.contains(nextFocused)) return;
    if (referenceRef.value?.contains(nextFocused)) return;
    if (nextFocused.closest?.('[data-floating-layer]')) return;
    clearTrigger();
  }

  close();
};

const handleTriggerFocusOut = (e: FocusEvent) => {
  if (!props.closeOnFocusOut || !model.value) return;

  const nextFocused = e.relatedTarget as HTMLElement | null;
  if (nextFocused) {
    if (referenceRef.value?.contains(nextFocused)) return;
    if (panelRef.value?.contains(nextFocused)) return;
    if (nextFocused.closest?.('[data-floating-layer]')) return;
    clearTrigger();
  }

  if (props.trigger !== 'hover') {
    close();
  }
};

const handlePanelKeydown = (e: KeyboardEvent) => {
  if (e.key !== 'Tab' || !panelRef.value) return;

  const innerFocusables = Array.from(
    panelRef.value.querySelectorAll<HTMLElement>(
      'button:not([disabled]):not([aria-disabled="true"]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter(el => el.offsetParent !== null && !el.hasAttribute('inert'));

  const activeEl = document.activeElement as HTMLElement | null;
  const isFirst = innerFocusables.length === 0 || activeEl === innerFocusables[0] || activeEl === panelRef.value;
  const isLast = innerFocusables.length === 0 || activeEl === innerFocusables[innerFocusables.length - 1];

  const trigger =
    referenceRef.value?.querySelector<HTMLElement>(
      'button:not([disabled]), [tabindex]:not([tabindex="-1"]), [href], input:not([disabled])'
    ) || referenceRef.value;

  if (e.shiftKey) {
    if (isFirst) {
      e.preventDefault();
      clearTrigger();
      close();
      if (trigger) {
        trigger.focus();
      }
    }
  } else {
    if (isLast) {
      e.preventDefault();
      clearTrigger();
      close();
      if (trigger) {
        focusNextInPageAfter(trigger);
      }
    }
  }
};

defineExpose({ open, close, toggle, update });
</script>

<style scoped lang="scss">
.popover-wrapper {
  position: relative;
  display: inline-flex;

  &.is-block {
    display: flex;
    width: 100%;
  }
}

.popover-trigger {
  display: inline-flex;

  &.is-block {
    display: flex;
    flex: 1; /* 新增：强制撑满 wrapper */
    width: 100%;
  }
}

.popover-floating-host {
  z-index: var(--z-menu); /* 修改：从 --z-popover-top(92) 提升至 --z-menu(9999)，盖过模态框 */
  pointer-events: auto;
}

.popover-panel {
  box-sizing: border-box;
  outline: none;
  background-color: var(--bg-elevated);
  border: 1px solid var(--glass-border);
  border-radius: $radius-md;
  box-shadow: $shadow-floating;
  backdrop-filter: var(--blur-xl);
  -webkit-backdrop-filter: var(--blur-xl);
  transform-origin: top center;
}

.popover-fade-scale-enter-active {
  transition:
    opacity $duration-fast $bezier-standard,
    transform $duration-fast $bezier-spring;
}
.popover-fade-scale-leave-active {
  transition:
    opacity $duration-fast $bezier-standard,
    transform $duration-fast $bezier-standard;
}
.popover-fade-scale-enter-from {
  opacity: 0;
  transform: scale(0.94) translateY(-4px);
}
.popover-fade-scale-leave-to {
  opacity: 0;
  transform: scale(0.97) translateY(-2px);
}
.popover-fade-scale-enter-to,
.popover-fade-scale-leave-from {
  opacity: 1;
  transform: scale(1) translateY(0);
}
</style>
