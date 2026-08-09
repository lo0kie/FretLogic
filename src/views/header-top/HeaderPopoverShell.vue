<template>
  <div class="popover-wrapper">
    <GlobalTooltip :content="tooltip" placement="bottom">
      <ActionButton
        ref="triggerBtnRef"
        icon-only
        :variant="isOpen ? 'subtle' : 'ghost'"
        :primary="isOpen"
        :aria-label="tooltip"
        :aria-expanded="isOpen"
        aria-haspopup="true"
        @click="toggleOpen"
      >
        <SlidersHorizontal :size="18" stroke-width="2.2" aria-hidden="true" />
      </ActionButton>
    </GlobalTooltip>

    <Transition name="dropdown-fade">
      <div
        v-if="isOpen"
        v-on-click-outside="[() => (isOpen = false), { ignore: [triggerBtnRef, '[data-floating-layer]'] }]"
        role="dialog"
        aria-modal="false"
        :aria-label="tooltip"
        class="config-popover-card"
        tabindex="-1"
        @focusout="handleFocusOut"
      >
        <slot></slot>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { useFocusReturn } from '@/services/useFocusReturn';
import { SlidersHorizontal } from '@lucide/vue';
import { vOnClickOutside } from '@vueuse/components';
import { useEventListener } from '@vueuse/core';
import { ComponentPublicInstance, ref, useTemplateRef } from 'vue';

defineProps<{ tooltip: string }>();

const isOpen = ref(false);
const triggerBtnRef = useTemplateRef<ComponentPublicInstance>('triggerBtnRef');

const { captureTrigger, restoreFocusAfter } = useFocusReturn({ warnLabel: '[GlobalConfigPopover]' });

const getTriggerEl = () => triggerBtnRef.value?.$el as HTMLElement | undefined;

const toggleOpen = () => {
  if (!isOpen.value) {
    captureTrigger(getTriggerEl());
  }
  isOpen.value = !isOpen.value;
};

const handleEsc = () => {
  restoreFocusAfter(() => {
    isOpen.value = false;
  });
};

// 用全局 window 监听而非模板 @keydown.esc：
// 浮层内部（slot 传入的子组件，如 BaseSelector 的下拉框）自身可能在 keydown 时
// 调用了 stopPropagation()，导致事件冒泡不到这层容器，模板事件修饰符会失效。
// capture: true 让这层监听在事件到达目标元素之前（冒泡前）就先拿到，
// 不受任何子组件 stopPropagation 的影响。
useEventListener(
  window,
  'keydown',
  (e: KeyboardEvent) => {
    if (!isOpen.value) return;
    if (e.key !== 'Escape') return;

    // 只有当子组件自己没有处理这次 Escape 时才由 Popover 接管关闭；
    // 若担心和子组件内部的 Escape 逻辑重复触发，可以按需加白名单判断，
    // 目前场景下重复调用 isOpen.value = false 是无害的
    e.stopPropagation();
    handleEsc();
  },
  { capture: true }
);

const handleFocusOut = (e: FocusEvent) => {
  const nextFocused = e.relatedTarget as HTMLElement | null;
  const cardEl = e.currentTarget as HTMLElement;

  // 没有明确的下一个焦点目标（比如切换了窗口/标签页），安全起见直接关闭
  if (!nextFocused) {
    isOpen.value = false;
    return;
  }

  // 焦点仍停留在浮层内部 → 不关闭
  if (cardEl.contains(nextFocused)) return;

  // 焦点移向触发按钮本身 → 交给 click handler 处理，这里不重复关闭
  const triggerEl = getTriggerEl();
  if (triggerEl?.contains(nextFocused)) return;

  // 焦点移入了 Popover 内部某个子组件自己 Teleport 出去的浮层（如嵌套的 BaseSelector 下拉框、
  // GlobalContextMenu 等），这些元素在 DOM 结构上脱离了 cardEl，但逻辑上仍属于本次交互，
  // 不应视为"焦点离开了 Popover"
  if (nextFocused.closest('[data-floating-layer]')) return;

  isOpen.value = false;
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.popover-wrapper {
  position: relative;
  z-index: 1001;
}

.config-popover-card {
  position: absolute;
  top: calc(100% + 1rem);
  right: 0;
  width: 15rem;
  padding: 0.8rem 1rem;
  background-color: var(--bg-panel);
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(28px);
  border: 1px solid var(--glass-border);
  border-radius: @radius-lg;
  box-shadow: @shadow-floating;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  z-index: 1100;
  box-sizing: border-box;
  outline: none;
}

.fade-scale-transition(dropdown-fade, ~'0, -6px', 0.96);

:deep(.config-row) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

:deep(.config-label) {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-disabled);
  white-space: nowrap;
}

:deep(.control-wrapper) {
  flex: 1;
  display: flex;
  justify-content: flex-end;
  min-width: 0;

  > * {
    max-width: 10rem;
  }
}

:deep(.selector-trigger-bar) {
  height: 1.5rem !important;
  padding-left: 0.5rem !important;
  padding-right: 0.5rem !important;
}

@media (max-width: 768px) {
  .config-popover-card {
    position: fixed;
    top: 3.6rem;
    left: 4rem;
    right: 1rem;
    width: auto;
    max-width: none;
    padding: 1rem 1.15rem;
    gap: 1rem;
    border-radius: calc(@radius-lg * 1.3);
  }

  :deep(.config-row) {
    gap: 1rem;
  }

  :deep(.config-label) {
    font-size: 0.8rem;
    font-weight: 700;
  }

  :deep(.selector-trigger-bar) {
    height: 2rem !important;
    padding-left: 0.7rem !important;
    padding-right: 0.7rem !important;
    font-size: 0.78rem !important;
  }
}
</style>
