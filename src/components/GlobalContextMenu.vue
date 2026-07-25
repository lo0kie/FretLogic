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
          <component :is="item.icon" v-if="item.icon" :size="13" :stroke-width="2.5" />
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
  background-color: transparent;
}

.context-menu-box {
  position: fixed;
  z-index: 9999;
  padding: 0.3rem;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 130px;
  background-color: var(--bg-panel);
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(28px);
  border: 1px solid var(--glass-border);
  border-radius: @radius-lg;
  box-shadow: @shadow-floating;
  box-sizing: border-box;

  :global(.dark) & {
    box-shadow: @shadow-floating-dark;
  }
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.4rem 0.6rem;
  font-size: 0.73rem;
  font-weight: 500;
  border-radius: @radius-md;
  border: none;
  background-color: transparent;
  width: 100%;
  text-align: left;
  box-sizing: border-box;
  transition: @transition-fast;

  &.is-normal {
    color: var(--text-title);

    &:hover {
      background-color: var(--color-primary);
      color: #ffffff;
    }
  }

  &.is-danger {
    color: var(--color-danger);

    &:hover {
      background-color: var(--color-danger);
      color: #ffffff;
    }
  }

  &.is-disabled {
    opacity: 0.35;
    cursor: not-allowed;
    pointer-events: none;
  }

  &:not(.is-disabled) {
    cursor: pointer;
  }
}

.menu-fade-enter-active {
  transition:
    opacity @duration-fast @bezier-standard,
    transform @duration-fast @bezier-standard;
}

.menu-fade-leave-active {
  transition:
    opacity @duration-fast @bezier-standard,
    transform @duration-fast @bezier-standard;
}

.menu-fade-enter-from,
.menu-fade-leave-to {
  opacity: 0;
  transform: scale(0.92) translateY(-4px);
}
</style>
