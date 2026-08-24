<template>
  <div
    class="context-menu-trigger-wrapper"
    :class="{ 'is-disabled': disabled, 'is-open': isOpen }"
    v-bind="$attrs"
    @contextmenu="handleContextMenu"
  >
    <slot :is-open :open="openMenuAt" :close="closeMenu" />
  </div>

  <Teleport to="body">
    <div v-if="isRendered" ref="floatingRef" :style="floatingStyles" class="floating-position-wrapper">
      <Transition name="menu-fade" appear @after-leave="isRendered = false">
        <div
          v-if="isOpen"
          ref="menuBoxRef"
          role="menu"
          tabindex="-1"
          aria-label="右键上下文菜单"
          class="context-menu-box"
          :class="sizeClass"
          @keydown="handleMenuKeydown"
        >
          <template v-if="title">
            <div class="menu-title">
              {{ title }}
            </div>
            <div class="menu-divider" role="separator" />
          </template>

          <!-- 模板中的菜单项 -->
          <button
            v-for="item in items"
            :key="item.label"
            ref="itemEls"
            v-wave="{ disabled: item.disabled }"
            type="button"
            role="menuitem"
            :tabindex="item.disabled ? -1 : 0"
            :aria-disabled="item.disabled"
            data-focusable-inline
            class="menu-item"
            :class="[item.danger ? 'is-danger' : 'is-normal', item.disabled ? 'is-disabled' : '']"
            :title="item.title"
            @click.stop="handleItemClick(item)"
            @keydown.enter.prevent.stop="handleItemClick(item)"
            @keydown.space.prevent.stop="handleItemClick(item)"
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
import type { FunctionalComponent } from 'vue';
import { nextTick, ref, computed, onBeforeUnmount, useTemplateRef, watch } from 'vue';
const globalActiveMenuCloseFn = ref<(() => void) | null>(null);
</script>

<script setup lang="ts">
import { HEIGHT_LG, HEIGHT_MD, HEIGHT_SM } from '@/utils/constants';
import { useFocusReturn } from '@/composables/useFocusReturn';
import { autoUpdate, flip, shift, useFloating } from '@floating-ui/vue';
import { useEventListener } from '@vueuse/core';

export interface ContextMenuItem {
  label: string;
  icon?: FunctionalComponent;
  action: () => void;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
}

defineOptions({ name: 'GlobalContextMenu', inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    items: ContextMenuItem[];
    title?: string;
    disabled?: boolean;
    size?: 'sm' | 'md' | 'lg';
  }>(),
  { disabled: false, size: 'md', title: '' }
);

const isOpen = ref(false);
const x = ref(0);
const y = ref(0);

const floatingRef = useTemplateRef<HTMLElement>('floatingRef');
const menuBoxRef = useTemplateRef<HTMLDivElement>('menuBoxRef');
const itemEls = useTemplateRef<HTMLButtonElement[]>('itemEls');

const { captureTrigger, restoreFocusAfter } = useFocusReturn({
  warnLabel: '[GlobalContextMenu]',
});

const virtualRef = computed(() => ({
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
}));
const sizeClass = computed(() => `size-${props.size}`);

const { floatingStyles, update } = useFloating(virtualRef, floatingRef, {
  placement: 'bottom-start',
  whileElementsMounted: (reference, floating, update) => autoUpdate(reference, floating, update),
  middleware: [flip(), shift({ padding: 8 })],
});

const isRendered = ref(false);

watch(isOpen, open => {
  if (open) isRendered.value = true;
});

let stopListeners: (() => void)[] = [];

const closeMenu = () => {
  isOpen.value = false;
  if (globalActiveMenuCloseFn.value === closeMenu) {
    globalActiveMenuCloseFn.value = null;
  }
};

const openMenuAt = async (clientX: number, clientY: number, sourceEl?: HTMLElement | null) => {
  if (props.disabled || !props.items || props.items.length === 0) return;

  if (globalActiveMenuCloseFn.value && globalActiveMenuCloseFn.value !== closeMenu) {
    globalActiveMenuCloseFn.value();
  }

  captureTrigger(sourceEl);

  x.value = clientX;
  y.value = clientY;
  isOpen.value = true;

  globalActiveMenuCloseFn.value = closeMenu;

  await nextTick();

  update();
};

const handleContextMenu = (e: MouseEvent) => {
  if (props.disabled || !props.items || props.items.length === 0) return;

  e.preventDefault();
  e.stopPropagation();

  // wrapper 本身是 display:contents，不可聚焦；真正可交互的元素在 slot 内部，
  // useFocusReturn 内部会自动向下查找，这里直接传 wrapper 即可
  openMenuAt(e.clientX, e.clientY, e.currentTarget as HTMLElement);
};

const handleItemClick = (item: ContextMenuItem) => {
  if (item.disabled) return;
  item.action();
  closeMenuAndRestoreFocus();
};

const closeMenuAndRestoreFocus = () => {
  restoreFocusAfter(closeMenu);
};

const handleMenuKeydown = (e: KeyboardEvent) => {
  if (!isOpen.value || !itemEls.value) return;

  const activeElement = document.activeElement as HTMLElement;
  const currentIndex = itemEls.value.indexOf(activeElement as HTMLButtonElement);

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    let nextIdx = currentIndex + 1;
    while (nextIdx < props.items.length && props.items[nextIdx]?.disabled) {
      nextIdx++;
    }
    if (nextIdx >= props.items.length) {
      nextIdx = props.items.findIndex(item => !item.disabled);
    }
    if (nextIdx !== -1) itemEls.value[nextIdx]?.focus();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    let prevIdx = currentIndex - 1;
    while (prevIdx >= 0 && props.items[prevIdx]?.disabled) {
      prevIdx--;
    }
    if (prevIdx < 0) {
      prevIdx = props.items.length - 1;
      while (prevIdx >= 0 && props.items[prevIdx]?.disabled) {
        prevIdx--;
      }
    }
    if (prevIdx !== -1) itemEls.value[prevIdx]?.focus();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    closeMenuAndRestoreFocus();
  } else if (e.key === 'Tab') {
    e.preventDefault();
    closeMenuAndRestoreFocus();
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
          closeMenuAndRestoreFocus();
        }
      })
    );
    stopListeners.push(useEventListener(window, 'resize', closeMenuAndRestoreFocus));
    stopListeners.push(
      useEventListener(window, 'scroll', closeMenuAndRestoreFocus, {
        capture: true,
        passive: true,
      })
    );

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
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.context-menu-trigger-wrapper {
  display: contents;
  width: 100%;

  &.is-disabled {
    cursor: default;
  }
}

.floating-position-wrapper {
  z-index: var(--z-menu);
  pointer-events: auto;
}

.context-menu-box {
  padding: @space-xs;
  display: flex;
  flex-direction: column;
  gap: @space-xs;
  min-width: 130px;
  background-color: var(--bg-panel);
  backdrop-filter: var(--blur-lg);
  -webkit-backdrop-filter: var(--blur-lg);
  border: 1px solid var(--glass-border);
  border-radius: @radius-lg;
  box-shadow: @shadow-floating;
  box-sizing: border-box;
  transform-origin: top left;
  outline: none;
}

.menu-title {
  padding: @space-xs @space-md @space-xs;
  font-size: @fs-2xs;
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
  margin: @space-2xs @space-xs @space-xs;
}

.menu-item {
  display: flex;
  align-items: center;
  font-weight: 500;
  border-radius: @radius-md;
  border: none;
  background-color: transparent;
  width: 100%;
  text-align: left;
  box-sizing: border-box;
  transition: @transition-fast;

  .size-sm & {
    height: v-bind('HEIGHT_SM');
    padding: 0 @space-sm;
    font-size: @fs-2xs;
    gap: @space-sm;
  }

  .size-md & {
    height: v-bind('HEIGHT_MD');
    padding: 0 @space-md;
    font-size: @fs-xs;
    gap: @space-sm;
  }

  .size-lg & {
    height: v-bind('HEIGHT_LG');
    padding: 0 @space-md;
    font-size: @fs-xs;
    gap: @space-sm;
  }

  &.is-normal {
    color: var(--text-title);

    &:not(.is-disabled):hover {
      background-color: var(--color-primary);
      color: var(--text-on-accent);
    }
  }

  &.is-danger {
    color: var(--color-danger);

    &:not(.is-disabled):hover {
      background-color: var(--color-danger);
      color: var(--text-on-accent);
    }
  }

  &.is-disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  &:not(.is-disabled) {
    cursor: pointer;
  }
}

.fade-scale-transition(menu-fade);
</style>
