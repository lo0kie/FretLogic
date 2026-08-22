<template>
  <div ref="rootRef" class="app-dropdown">
    <slot name="trigger" :toggle="toggleOpen" :open="open" />

    <Transition name="app-dropdown-fade">
      <div v-if="open" ref="panelRef" class="app-dropdown-panel" data-app-dropdown-panel>
        <slot />
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { onClickOutside } from '@vueuse/core';
import { ref } from 'vue';

const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);

onClickOutside(rootRef, () => {
  open.value = false;
});

function toggleOpen() {
  open.value = !open.value;
}

defineExpose({ open, close: () => (open.value = false), toggleOpen });
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.app-dropdown {
  position: relative;
  display: inline-flex;
}

.app-dropdown-panel {
  position: absolute;
  top: calc(100% + @space-xs);
  left: 0;
  min-width: 10rem;
  padding: @space-xs;
  border: 1px solid var(--border-light);
  border-radius: @radius-md;
  background: var(--bg-panel);
  box-shadow: var(--shadow-lg);
  z-index: var(--z-popover);
}

.app-dropdown-fade-enter-active,
.app-dropdown-fade-leave-active {
  transition:
    opacity var(--duration-fast) var(--bezier-out),
    transform var(--duration-fast) var(--bezier-out);
}

.app-dropdown-fade-enter-from,
.app-dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
