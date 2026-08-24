<template>
  <Transition :name="transitionName">
    <div v-if="visible" class="base-floating-bar" :style="{ bottom }" role="toolbar" tabindex="-1">
      <slot :divider="FloatingBarDivider" />
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { h } from 'vue';

withDefaults(
  defineProps<{
    visible?: boolean;
    bottom?: string;
    transitionName?: string;
  }>(),
  {
    visible: true,
    bottom: '2rem',
    transitionName: 'floating-bar-fade',
  }
);

const FloatingBarDivider = () =>
  h('div', {
    'class': 'bar-divider',
    'role': 'separator',
    'aria-orientation': 'vertical',
    'style': {
      width: '2px',
      height: '1rem',
      backgroundColor: 'var(--border-base)',
      opacity: '0.6',
      flexShrink: '0',
      borderRadius: '9999px',
    },
  });
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.base-floating-bar {
  display: flex;
  align-items: center;
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-fab);
  pointer-events: auto;
  gap: @space-sm;
  padding: @space-sm @space-md;
  background-color: var(--bg-panel);
  backdrop-filter: var(--blur-xl);
  -webkit-backdrop-filter: var(--blur-xl);
  border: 1px solid var(--glass-border);
  border-radius: @radius-pill;
  box-shadow: @shadow-floating;
  box-sizing: border-box;

  transition:
    bottom var(--duration-slow) var(--bezier-out),
    background-color 0.28s ease,
    border-color 0.28s ease,
    box-shadow 0.28s ease;

  &:hover {
    box-shadow: var(--focus-ring);
  }

  :deep(.bar-divider) {
    width: 1px;
    height: 1rem;
    background-color: var(--border-base);
    opacity: 0.6;
    flex-shrink: 0;
  }
}

.fade-scale-transition(floating-bar-fade, ~'-50%, 20px', 0.95, ~'-50%, 0');
</style>
