<template>
  <div ref="triggerRef" @contextmenu="handleContextMenu" class="context-menu-trigger-wrapper">
    <slot></slot>
  </div>

  <Teleport to="body">
    <Transition name="fade-clear">
      <div v-if="isOpen" class="context-menu-backdrop" @pointerdown.prevent.stop="closeMenu"></div>
    </Transition>

    <div v-if="isOpen" ref="floatingRef" :style="floatingStyles" class="floating-position-wrapper">
      <Transition name="menu-fade" appear>
        <div class="context-menu-box">
          <template v-if="title">
            <div class="menu-title">{{ title }}</div>
            <div class="menu-divider"></div>
          </template>

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
    </div>
  </Teleport>
</template>

<script lang="ts">
const globalActiveMenuCloseFn = ref<(() => void) | null>(null);
</script>

<script setup lang="ts">
import { autoUpdate, flip, shift, useFloating } from '@floating-ui/vue';
import { useEventListener } from '@vueuse/core';
import { FunctionalComponent, onBeforeUnmount, ref, watch } from 'vue';

export interface ContextMenuItem {
  label: string;
  icon?: FunctionalComponent;
  action: () => void;
  danger?: boolean;
  disabled?: boolean;
}

defineOptions({ name: 'GlobalContextMenu' });

const props = defineProps<{
  items: ContextMenuItem[];
  title?: string;
}>();

const isOpen = ref(false);
const x = ref(0);
const y = ref(0);

const triggerRef = ref<HTMLElement | null>(null);
const floatingRef = ref<HTMLElement | null>(null);

const virtualRef = ref({
  getBoundingClientRect() {
    return {
      x: x.value,
      y: y.value,
      top: y.value,
      left: x.value,
      bottom: y.value,
      right: x.value,
      width: 0,
      height: 0,
    };
  },
});

const { floatingStyles } = useFloating(virtualRef, floatingRef, {
  placement: 'bottom-start',
  whileElementsMounted: (reference, floating, update) => autoUpdate(reference, floating, update),
  middleware: [flip(), shift({ padding: 8 })],
});

let stopListeners: (() => void)[] = [];

const closeMenu = () => {
  isOpen.value = false;
  if (globalActiveMenuCloseFn.value === closeMenu) {
    globalActiveMenuCloseFn.value = null;
  }
};

const openMenuAt = (clientX: number, clientY: number) => {
  if (!props.items || props.items.length === 0) return;

  if (globalActiveMenuCloseFn.value && globalActiveMenuCloseFn.value !== closeMenu) {
    globalActiveMenuCloseFn.value();
  }

  x.value = clientX;
  y.value = clientY;
  isOpen.value = true;

  globalActiveMenuCloseFn.value = closeMenu;
};

const handleContextMenu = (e: MouseEvent) => {
  if (!props.items || props.items.length === 0) return;

  e.preventDefault();
  e.stopPropagation();

  openMenuAt(e.clientX, e.clientY);
};

const handleItemClick = (item: ContextMenuItem) => {
  if (item.disabled) return;
  item.action();
  closeMenu();
};

watch(isOpen, open => {
  stopListeners.forEach(stop => stop());
  stopListeners = [];

  if (open) {
    stopListeners.push(
      useEventListener(window, 'pointerdown', (e: PointerEvent) => {
        if (!floatingRef.value) return;
        if (!floatingRef.value.contains(e.target as Node)) {
          closeMenu();
        }
      })
    );
    stopListeners.push(useEventListener(window, 'resize', closeMenu));
    stopListeners.push(useEventListener(window, 'scroll', closeMenu, { capture: true, passive: true }));
  }
});

onBeforeUnmount(() => {
  stopListeners.forEach(stop => stop());
  stopListeners = [];
  if (globalActiveMenuCloseFn.value === closeMenu) {
    globalActiveMenuCloseFn.value = null;
  }
});

defineExpose({
  open: openMenuAt,
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

.floating-position-wrapper {
  z-index: 9999;
  pointer-events: auto;
}

.context-menu-box {
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
  transform-origin: top left;
}

.menu-title {
  padding: 0.25rem 0.6rem 0.15rem;
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--text-disabled);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: none;
}

.menu-divider {
  height: 1px;
  background-color: var(--border-light);
  margin: 0.15rem 0.2rem 0.2rem;
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

.menu-fade-enter-active,
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
