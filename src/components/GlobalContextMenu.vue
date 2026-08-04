<template>
  <div @contextmenu="handleContextMenu" class="context-menu-trigger-wrapper" v-bind="$attrs">
    <slot></slot>
  </div>

  <Teleport to="body">
    <Transition name="fade-clear">
      <div v-if="isOpen" class="context-menu-backdrop" @pointerdown.prevent.stop="closeMenu"></div>
    </Transition>

    <div v-if="isOpen" ref="floatingRef" :style="floatingStyles" class="floating-position-wrapper">
      <Transition name="menu-fade" appear>
        <!-- 🌟 1. 补全 role="menu" 与键盘导航 -->
        <div
          ref="menuBoxRef"
          role="menu"
          tabindex="-1"
          aria-label="右键上下文菜单"
          class="context-menu-box"
          @keydown="handleMenuKeydown"
        >
          <template v-if="title">
            <div class="menu-title">{{ title }}</div>
            <div class="menu-divider" role="separator"></div>
          </template>

          <!-- 🌟 2. 补全 role="menuitem" 与 tabindex -->
          <button
            v-wave
            v-for="item in items"
            :key="item.label"
            ref="itemEls"
            type="button"
            role="menuitem"
            :tabindex="item.disabled ? -1 : 0"
            :disabled="item.disabled"
            @click.stop="handleItemClick(item)"
            @keydown.enter.prevent.stop="handleItemClick(item)"
            @keydown.space.prevent.stop="handleItemClick(item)"
            class="menu-item"
            :class="[item.danger ? 'is-danger' : 'is-normal', item.disabled ? 'is-disabled' : '']"
          >
            <component :is="item.icon" v-if="item.icon" :size="13" :stroke-width="2.5" aria-hidden="true" />
            <span>{{ item.label }}</span>
          </button>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<script lang="ts">
import { nextTick, ref } from 'vue';
const globalActiveMenuCloseFn = ref<(() => void) | null>(null);
</script>

<script setup lang="ts">
import { autoUpdate, flip, shift, useFloating } from '@floating-ui/vue';
import { useEventListener } from '@vueuse/core';
import { FunctionalComponent, onBeforeUnmount, useTemplateRef, watch } from 'vue';

export interface ContextMenuItem {
  label: string;
  icon?: FunctionalComponent;
  action: () => void;
  danger?: boolean;
  disabled?: boolean;
}

defineOptions({ name: 'GlobalContextMenu', inheritAttrs: false });

const props = defineProps<{
  items: ContextMenuItem[];
  title?: string;
}>();

const isOpen = ref(false);
const x = ref(0);
const y = ref(0);

const floatingRef = useTemplateRef<HTMLElement>('floatingRef');
const menuBoxRef = useTemplateRef<HTMLDivElement>('menuBoxRef');
const itemEls = useTemplateRef<HTMLButtonElement[]>('itemEls');

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

// 🌟 键盘方向键与 Esc 逻辑拦截
const handleMenuKeydown = (e: KeyboardEvent) => {
  if (!isOpen.value || !itemEls.value) return;

  const activeElement = document.activeElement as HTMLElement;
  const currentIndex = itemEls.value.indexOf(activeElement as HTMLButtonElement);

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    let nextIdx = currentIndex + 1;
    while (nextIdx < props.items.length && props.items[nextIdx].disabled) {
      nextIdx++;
    }
    if (nextIdx >= props.items.length) {
      nextIdx = props.items.findIndex(item => !item.disabled);
    }
    if (nextIdx !== -1) itemEls.value[nextIdx]?.focus();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    let prevIdx = currentIndex - 1;
    while (prevIdx >= 0 && props.items[prevIdx].disabled) {
      prevIdx--;
    }
    if (prevIdx < 0) {
      prevIdx = props.items.length - 1;
      while (prevIdx >= 0 && props.items[prevIdx].disabled) {
        prevIdx--;
      }
    }
    if (prevIdx !== -1) itemEls.value[prevIdx]?.focus();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    closeMenu();
  }
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

    // 🌟 自动聚焦第一个可用菜单项
    nextTick(() => {
      const firstEnabledIdx = props.items.findIndex(item => !item.disabled);
      if (firstEnabledIdx !== -1) {
        itemEls.value?.[firstEnabledIdx]?.focus();
      } else {
        menuBoxRef.value?.focus();
      }
    });
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
  cursor: context-menu;
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
  outline: none;
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
  outline: none;

  &.is-normal {
    color: var(--text-title);

    &:hover,
    &:focus-visible {
      background-color: var(--color-primary);
      color: #ffffff;
    }
  }

  &.is-danger {
    color: var(--color-danger);

    &:hover,
    &:focus-visible {
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

.fade-scale-transition(menu-fade);

@media (max-width: 768px) {
  .context-menu-box {
    min-width: 160px;
    padding: 0.4rem;
    gap: 0.2rem;
    border-radius: calc(@radius-lg * 1.2);
  }

  .menu-title {
    padding: 0.35rem 0.8rem 0.2rem;
    font-size: 0.78rem;
  }

  .menu-divider {
    margin: 0.2rem 0.3rem 0.25rem;
  }

  .menu-item {
    padding: 0.65rem 0.85rem;
    font-size: 0.88rem;
    gap: 0.6rem;
    border-radius: calc(@radius-md * 1.2);
  }
}
</style>
