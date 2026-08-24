<template>
  <div class="popover-wrapper">
    <div ref="referenceRef" class="popover-trigger" :aria-expanded="model" aria-haspopup="dialog">
      <slot name="trigger" :is-open="model" :toggle="toggle" :open="open" :close="close" />
    </div>

    <!-- 挂载容器：用于 Floating UI 计算坐标，不带任何位移动画 -->
    <div v-if="isMounted" ref="floatingRef" class="popover-floating-host" :style="floatingStyles">
      <!-- 动画主体：仅在坐标就绪后播放入场，并在动画播完后才卸载 -->
      <Transition appear name="popover-fade-scale" @after-leave="handleAfterLeave">
        <div
          v-if="isShown"
          v-on-click-outside="[handleClickOutside, { ignore: [referenceRef, '[data-floating-layer]'] }]"
          role="dialog"
          :aria-modal="false"
          :aria-label="ariaLabel"
          class="popover-panel"
          :class="panelClass"
          tabindex="-1"
          @focusout="handleFocusOut"
        >
          <slot :close="close" />
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useFocusReturn } from '@/composables/useFocusReturn';
import { autoUpdate, flip, limitShift, offset, shift, useFloating, type Placement } from '@floating-ui/vue';
import { vOnClickOutside } from '@vueuse/components';
import { useEventListener } from '@vueuse/core';
import type { CSSProperties } from 'vue';
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';

const {
  placement = 'bottom',
  disabled = false,
  offsetDistance = 8,
  closeOnClickOutside = true,
  closeOnEsc = true,
  ariaLabel = '弹出面板',
  panelClass = '',
  panelStyle = {},
} = defineProps<{
  placement?: Placement;
  disabled?: boolean;
  offsetDistance?: number;
  closeOnClickOutside?: boolean;
  closeOnEsc?: boolean;
  ariaLabel?: string;
  panelClass?: string;
  panelStyle?: CSSProperties;
}>();

const emit = defineEmits<{
  (e: 'open'): void;
  (e: 'close'): void;
}>();

const model = defineModel<boolean>({ default: false });

const referenceRef = useTemplateRef<HTMLElement>('referenceRef');
const floatingRef = useTemplateRef<HTMLElement>('floatingRef');

const isMounted = ref(false);
const isShown = ref(false);

const { floatingStyles: computedFloatingStyles, isPositioned } = useFloating(referenceRef, floatingRef, {
  strategy: 'absolute',
  placement: computed(() => placement),
  whileElementsMounted: autoUpdate,
  middleware: computed(() => [
    offset(offsetDistance),
    flip({
      fallbackPlacements: ['top', 'bottom-end', 'bottom-start', 'top-end', 'top-start'],
    }),
    shift({ padding: 12, limiter: limitShift() }),
  ]),
});

const floatingStyles = computed<CSSProperties>(() => ({
  ...computedFloatingStyles.value,
  ...panelStyle,
}));

// 当坐标计算完毕且处于挂载状态时，启动进场动画
watch([isMounted, isPositioned], async ([mounted, positioned]) => {
  if (mounted && positioned && !isShown.value) {
    await nextTick();
    isShown.value = true;
  }
});

const { captureTrigger, restoreFocusAfter } = useFocusReturn({
  warnLabel: '[BasePopover]',
});

const open = async () => {
  if (disabled || model.value) return;
  const triggerEl = referenceRef.value?.firstElementChild as HTMLElement | null;
  captureTrigger(triggerEl ?? referenceRef.value ?? undefined);
  model.value = true;
  isMounted.value = true;
  emit('open');

  if (isPositioned.value) {
    await nextTick();
    isShown.value = true;
  }
};

const close = () => {
  if (!model.value && !isShown.value) return;
  // 先触发 Transition 的离场动画
  isShown.value = false;
  model.value = false;
  emit('close');
};

const handleAfterLeave = () => {
  restoreFocusAfter(() => {
    isMounted.value = false;
  });
};

const toggle = () => {
  if (model.value) {
    close();
  } else {
    open();
  }
};

watch(model, val => {
  if (val && !isMounted.value) {
    open();
  } else if (!val && isShown.value) {
    close();
  }
});

const handleClickOutside = () => {
  if (!closeOnClickOutside || !model.value) return;
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
  const nextFocused = e.relatedTarget as HTMLElement | null;
  const cardEl = e.currentTarget as HTMLElement;

  if (!nextFocused) {
    close();
    return;
  }

  if (cardEl.contains(nextFocused)) return;
  if (referenceRef.value?.contains(nextFocused)) return;
  if (nextFocused.closest('[data-floating-layer]')) return;

  close();
};

defineExpose({ open, close, toggle });
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.popover-wrapper {
  position: relative;
  display: inline-flex;
}

.popover-trigger {
  display: inline-flex;
}

.popover-floating-host {
  z-index: var(--z-popover-top);
  pointer-events: auto;
}

.popover-panel {
  box-sizing: border-box;
  outline: none;
  background-color: var(--bg-elevated);
  border: 1px solid var(--glass-border);
  border-radius: @radius-lg;
  box-shadow: @shadow-floating;
  backdrop-filter: var(--blur-xl);
  -webkit-backdrop-filter: var(--blur-xl);
  transform-origin: top center;
}

.popover-fade-scale-enter-active {
  transition:
    opacity @duration-fast @bezier-standard,
    transform @duration-fast @bezier-standard;
}

.popover-fade-scale-leave-active {
  transition:
    opacity @duration-fast ease-in,
    transform @duration-fast ease-in;
}

.popover-fade-scale-enter-from,
.popover-fade-scale-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

.popover-fade-scale-enter-to,
.popover-fade-scale-leave-from {
  opacity: 1;
  transform: scale(1);
}
</style>
