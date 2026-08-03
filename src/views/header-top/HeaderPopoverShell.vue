<template>
  <div class="popover-wrapper" ref="popoverContainerRef">
    <GlobalTooltip :content="tooltip" placement="bottom">
      <ActionButton icon-only variant="ghost" :active="isOpen" @click="isOpen = !isOpen">
        <SlidersHorizontal :size="18" stroke-width="2.2" />
      </ActionButton>
    </GlobalTooltip>

    <Transition name="dropdown-fade">
      <div v-if="isOpen" class="config-popover-card" ref="cardRef">
        <slot></slot>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { SlidersHorizontal } from '@lucide/vue';
import { onClickOutside, useEventListener } from '@vueuse/core';
import { ref, useTemplateRef } from 'vue';

defineProps<{
  tooltip: string;
}>();

const isOpen = ref(false);
const popoverContainerRef = useTemplateRef<HTMLDivElement>('popoverContainerRef');
const cardRef = useTemplateRef<HTMLDivElement>('cardRef');

onClickOutside(popoverContainerRef, () => (isOpen.value = false), { ignore: [cardRef, '.floating-position-wrapper'] });

useEventListener(
  window,
  'contextmenu',
  (e: MouseEvent) => {
    if (!isOpen.value) return;

    const target = e.target as Node;

    const isInside =
      popoverContainerRef.value?.contains(target) ||
      cardRef.value?.contains(target) ||
      (target instanceof Element && target.closest('.floating-position-wrapper'));

    if (!isInside) {
      isOpen.value = false;
    }
  },
  { capture: true }
);
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
}

.fade-scale-transition(dropdown-fade, ~'0, -6px', 0.96);

/* 🌟 全局穿透样式：统一规范配置行 (Config Row) 的排版 */
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

  /* 限制输入框、分段控制器等组件占据可用宽度 */
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
