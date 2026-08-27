<template>
  <div
    ref="triggerWrapperRef"
    class="context-menu-trigger-wrapper contents w-full"
    :class="{ 'cursor-default': disabled }"
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
    @close="handlePopoverClose"
  >
    <div
      ref="menuBoxRef"
      role="menu"
      tabindex="-1"
      class="context-menu-inner flex flex-col gap-xs outline-none"
      :class="`context-menu-size-${size}`"
      @keydown="handleMenuKeydown"
    >
      <ContextMenuItems ref="itemsRef" :items="items" :title="title" :size="size" @select="handleItemSelect" />
    </div>
  </BasePopover>
</template>

<script lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';
import BasePopover from '@/components/base/BasePopover.vue';

// 记录全局当前打开的菜单，用于互斥互斥
const globalActiveMenuCloseFn = ref<(() => void) | null>(null);
</script>

<script setup lang="ts">
import type { VirtualElement } from '@floating-ui/vue';
import ContextMenuItems, { type ContextMenuItem } from './ContextMenuItems.vue';

defineOptions({ name: 'ContextMenu', inheritAttrs: false });

const {
  items,
  title = '',
  disabled = false,
  size = 'md',
} = defineProps<{
  items: ContextMenuItem[];
  title?: string;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}>();

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

const handlePopoverClose = () => {
  if (globalActiveMenuCloseFn.value === closeMenu) {
    globalActiveMenuCloseFn.value = null;
  }
};

const closeMenu = () => {
  popoverRef.value?.close();
  handlePopoverClose();
};

const openMenuAt = async (clientX: number, clientY: number, _sourceEl?: HTMLElement | null) => {
  if (disabled || !items?.length) return;

  // 1. 如果有其他菜单打开，关掉它
  if (globalActiveMenuCloseFn.value && globalActiveMenuCloseFn.value !== closeMenu) {
    globalActiveMenuCloseFn.value();
  }
  globalActiveMenuCloseFn.value = closeMenu;

  x.value = clientX;
  y.value = clientY;
  isOpen.value = true;

  await nextTick();
  popoverRef.value?.update();

  const firstEnabledIndex = items.findIndex(item => !item.disabled);
  if (firstEnabledIndex !== -1) {
    const itemEls = itemsRef.value?.itemEls || [];
    itemEls[firstEnabledIndex]?.focus();
  }
};

const handleContextMenu = (e: MouseEvent) => {
  if (disabled) return;
  e.preventDefault();
  e.stopPropagation();
  openMenuAt(e.clientX, e.clientY, triggerWrapperRef.value);
};

const handleItemSelect = (item: ContextMenuItem) => {
  item.action();
  closeMenu();
};

const handleMenuKeydown = (e: KeyboardEvent) => {
  const itemEls = itemsRef.value?.itemEls || [];
  const currentIndex = itemEls.findIndex(el => el === document.activeElement);

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    let nextIdx = currentIndex + 1;
    while (nextIdx < items.length && items[nextIdx]?.disabled) {
      nextIdx++;
    }
    if (nextIdx >= items.length) {
      nextIdx = items.findIndex(item => !item.disabled);
    }
    if (nextIdx !== -1) itemEls[nextIdx]?.focus();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    let prevIdx = currentIndex - 1;
    while (prevIdx >= 0 && items[prevIdx]?.disabled) {
      prevIdx--;
    }
    if (prevIdx < 0) {
      prevIdx = items.length - 1;
      while (prevIdx >= 0 && items[prevIdx]?.disabled) {
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
