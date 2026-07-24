<template>
  <div ref="triggerRef" @contextmenu="handleContextMenu" class="context-menu-trigger-wrapper">
    <slot></slot>
  </div>

  <Teleport to="body">
    <Transition name="fade-clear">
      <div v-if="isOpen" class="context-menu-backdrop" @pointerdown.prevent.stop="closeMenu"></div>
    </Transition>

    <Transition name="menu-fade">
      <div v-if="isOpen" ref="menuRef" class="context-menu-box" :style="{ left: `${x}px`, top: `${y}px` }">
        <button
          v-for="(item, idx) in items"
          :key="idx"
          :disabled="item.disabled"
          @click.stop="handleItemClick(item)"
          class="menu-item"
          :class="[item.danger ? 'is-danger' : 'is-normal', item.disabled ? 'is-disabled' : '']"
        >
          <component :is="item.icon" v-if="item.icon" :size="14" :stroke-width="2.5" />
          <span>{{ item.label }}</span>
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<script lang="ts">
const globalActiveMenuCloseFn = ref<(() => void) | null>(null);

export default { name: 'GlobalContextMenu' };
</script>

<script setup lang="ts">
import { useEventListener } from '@vueuse/core';
import { FunctionalComponent, nextTick, onBeforeUnmount, ref } from 'vue';

export interface ContextMenuItem {
  label: string;
  icon?: FunctionalComponent;
  action: () => void;
  danger?: boolean;
  disabled?: boolean;
}

const props = defineProps<{
  items: ContextMenuItem[];
}>();

const isOpen = ref(false);
const x = ref(0);
const y = ref(0);

const triggerRef = ref<HTMLElement | null>(null);
const menuRef = ref<HTMLElement | null>(null);

const closeMenu = () => {
  isOpen.value = false;
  if (globalActiveMenuCloseFn.value === closeMenu) {
    globalActiveMenuCloseFn.value = null;
  }
};

const adjustPosition = () => {
  nextTick(() => {
    if (!menuRef.value) return;
    const menuRect = menuRef.value.getBoundingClientRect();

    if (x.value + menuRect.width > window.innerWidth) {
      x.value = window.innerWidth - menuRect.width - 8;
    }
    if (y.value + menuRect.height > window.innerHeight) {
      y.value = window.innerHeight - menuRect.height - 8;
    }
  });
};

const openMenuManual = (clientX: number, clientY: number) => {
  if (!props.items || props.items.length === 0) return;

  if (globalActiveMenuCloseFn.value && globalActiveMenuCloseFn.value !== closeMenu) {
    globalActiveMenuCloseFn.value();
  }

  isOpen.value = true;
  x.value = clientX;
  y.value = clientY;

  globalActiveMenuCloseFn.value = closeMenu;
  adjustPosition();
};

const handleContextMenu = (e: MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();

  if (!props.items || props.items.length === 0) return;

  if (globalActiveMenuCloseFn.value && globalActiveMenuCloseFn.value !== closeMenu) {
    globalActiveMenuCloseFn.value();
  }

  isOpen.value = true;
  x.value = e.clientX;
  y.value = e.clientY;

  globalActiveMenuCloseFn.value = closeMenu;
  adjustPosition();
};

const handleItemClick = (item: ContextMenuItem) => {
  if (item.disabled) return;
  item.action();
  closeMenu();
};

useEventListener(window, 'pointerdown', (e: PointerEvent) => {
  if (!isOpen.value || !menuRef.value) return;
  if (!menuRef.value.contains(e.target as Node)) {
    closeMenu();
  }
});

onBeforeUnmount(() => {
  if (globalActiveMenuCloseFn.value === closeMenu) {
    globalActiveMenuCloseFn.value = null;
  }
});

defineExpose({
  open: openMenuManual,
  close: closeMenu,
  isOpen,
});
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.context-menu-trigger-wrapper {
  width: 100%;
}

.context-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9998;
  background-color: color-mix(in srgb, var(--bg-main) 4%, transparent);

  :global(.dark) & {
    background-color: color-mix(in srgb, #000000 20%, transparent);
  }
}

.context-menu-box {
  position: fixed;
  z-index: 9999;
  padding: 0.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 140px;
  background-color: color-mix(in srgb, var(--bg-panel) 94%, transparent);
  border: 1px solid var(--border-base);
  border-radius: @radius-md;
  box-shadow: @shadow-lg;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-sizing: border-box;

  :global(.dark) & {
    box-shadow: @shadow-floating-dark;
  }
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.625rem;
  font-size: 0.7rem;
  font-weight: 700;
  border-radius: @radius-md;
  border: none;
  background-color: transparent;
  width: 100%;
  text-align: left;
  box-sizing: border-box;
  transition:
    background-color @duration-fast,
    color @duration-fast;

  &.is-normal {
    color: var(--text-body);

    &:hover {
      background-color: var(--bg-panel-hover);
      color: var(--text-title);
    }
  }

  &.is-danger {
    color: var(--color-danger);

    &:hover {
      background-color: rgba(239, 68, 68, 0.1);

      :global(.dark) & {
        background-color: rgba(239, 68, 68, 0.2);
      }
    }
  }

  &.is-disabled {
    opacity: 0.3;
    cursor: not-allowed;
    pointer-events: none;
  }

  &:not(.is-disabled) {
    cursor: pointer;
  }
}

.menu-fade-enter-active {
  transition:
    opacity 0.12s @bezier-standard,
    transform 0.12s @bezier-standard;
}

.menu-fade-leave-active {
  transition:
    opacity 0.08s @bezier-standard,
    transform 0.08s @bezier-standard;
}

.menu-fade-enter-from,
.menu-fade-leave-to {
  opacity: 0;
  transform: scale(0.96) translateY(-4px);
}
</style>
