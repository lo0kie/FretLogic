<template>
  <Teleport to="body">
    <Transition :name="transitionName" appear>
      <div v-if="isBarVisible" class="base-floating-bar" :style="{ bottom }" role="toolbar" tabindex="-1">
        <slot :divider="FloatingBarDivider" />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, h, onActivated, onDeactivated, ref } from 'vue';

const props = withDefaults(
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

const isViewActive = ref(true);

onActivated(() => {
  isViewActive.value = true;
});

onDeactivated(() => {
  isViewActive.value = false;
});

const isBarVisible = computed(() => Boolean(props.visible && isViewActive.value));

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

<style scoped lang="scss">
.base-floating-bar {
  display: flex;
  align-items: center;
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-fab);
  pointer-events: auto;
  gap: $space-sm;
  padding: $space-sm $space-md;
  background-color: var(--bg-panel);
  backdrop-filter: var(--blur-xl);
  -webkit-backdrop-filter: var(--blur-xl);
  border: 1px solid var(--glass-border);
  border-radius: $radius-pill;
  box-shadow: $shadow-floating;
  box-sizing: border-box;

  transition:
    bottom $duration-slow $bezier-sidebar,
    background-color $duration-base $bezier-standard,
    border-color $duration-base $bezier-standard,
    box-shadow $duration-base $bezier-standard;

  &:hover {
    box-shadow: var(--focus-ring);
  }
}

@include fade-scale-transition(floating-bar-fade, '-50%, 20px', 0.95, '-50%, 0');
</style>
