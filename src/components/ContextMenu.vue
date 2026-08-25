<template>
  <div
    ref="triggerWrapperRef"
    class="context-menu-trigger-wrapper"
    :class="{ 'is-disabled': disabled }"
    @contextmenu="handleContextMenu"
  >
    <slot :is-open="isOpen" />
  </div>

  <BasePopover
    ref="popoverRef"
    v-model="isOpen"
    :virtual-ref="virtualRef"
    placement="bottom-start"
    :offset-distance="6"
    :disabled="disabled"
    aria-label="右键上下文菜单"
    panel-class="context-menu-box"
  >
    <div
      ref="menuBoxRef"
      role="menu"
      tabindex="-1"
      class="context-menu-inner"
      :class="`size-${size}`"
      @keydown="handleMenuKeydown"
    >
      <ContextMenuItems ref="itemsRef" :items="items" :title="title" :size="size" @select="handleItemSelect" />
    </div>
  </BasePopover>
</template>

<script lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';
import BasePopover from './BasePopover.vue';

// 记录全局当前打开的菜单，用于互斥互斥
const globalActiveMenuCloseFn = ref<(() => void) | null>(null);
</script>

<script setup lang="ts">
import type { VirtualElement } from '@floating-ui/vue';
import ContextMenuItems, { type ContextMenuItem } from './ContextMenuItems.vue';

defineOptions({ name: 'ContextMenu', inheritAttrs: false });

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

const popoverRef = useTemplateRef<InstanceType<typeof BasePopover>>('popoverRef');
const itemsRef = useTemplateRef<InstanceType<typeof ContextMenuItems>>('itemsRef');
const triggerWrapperRef = useTemplateRef<HTMLElement>('triggerWrapperRef');

const virtualRef = computed<VirtualElement>(() => ({
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

const closeMenu = () => {
  popoverRef.value?.close();
  if (globalActiveMenuCloseFn.value === closeMenu) {
    globalActiveMenuCloseFn.value = null;
  }
};

const openMenuAt = async (clientX: number, clientY: number, sourceEl?: HTMLElement | null) => {
  if (props.disabled || !props.items?.length) return;

  // 1. 如果有其他菜单打开，关掉它
  if (globalActiveMenuCloseFn.value && globalActiveMenuCloseFn.value !== closeMenu) {
    globalActiveMenuCloseFn.value();
  }

  // 2. 更新当前鼠标的新坐标
  x.value = clientX;
  y.value = clientY;
  globalActiveMenuCloseFn.value = closeMenu;

  // 3. 打开逻辑
  if (isOpen.value) {
    // 已经处于打开状态（连续右键）：只需让 Floating UI 更新坐标瞬移过去
    await nextTick();
    popoverRef.value?.update();
  } else {
    // 尚未打开：走 BasePopover 的 open 生命线
    popoverRef.value?.open(sourceEl);
  }
};

const handleContextMenu = (e: MouseEvent) => {
  if (props.disabled || !props.items || props.items.length === 0) return;

  e.preventDefault();
  e.stopPropagation();

  openMenuAt(e.clientX, e.clientY, e.currentTarget as HTMLElement);
};

const handleItemSelect = (item: ContextMenuItem) => {
  item.action();
  closeMenu();
};

const handleMenuKeydown = (e: KeyboardEvent) => {
  const itemEls = itemsRef.value?.itemEls;
  if (!isOpen.value || !itemEls) return;

  const activeElement = document.activeElement as HTMLElement;
  const currentIndex = itemEls.indexOf(activeElement as HTMLButtonElement);

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    let nextIdx = currentIndex + 1;
    while (nextIdx < props.items.length && props.items[nextIdx]?.disabled) {
      nextIdx++;
    }
    if (nextIdx >= props.items.length) {
      nextIdx = props.items.findIndex(item => !item.disabled);
    }
    if (nextIdx !== -1) itemEls[nextIdx]?.focus();
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
    if (prevIdx !== -1) itemEls[prevIdx]?.focus();
  } else if (e.key === 'Tab') {
    e.preventDefault();
    closeMenu();
  }
};

watch(isOpen, val => {
  if (!val && globalActiveMenuCloseFn.value === closeMenu) {
    globalActiveMenuCloseFn.value = null;
  }
});

defineExpose({ openMenuAt, closeMenu });
</script>

<style scoped lang="scss">
.context-menu-trigger-wrapper {
  display: contents;
  width: 100%;

  &.is-disabled {
    cursor: default;
  }
}

.context-menu-inner {
  display: flex;
  flex-direction: column;
  gap: $space-xs;
  outline: none;
}
</style>
