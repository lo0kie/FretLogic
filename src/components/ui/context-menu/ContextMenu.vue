<template>
  <div
    :class="{ 'cursor-default': disabled }"
    @contextmenu="handleContextMenu"
    class="context-menu-trigger-wrapper contents"
    ref="triggerWrapperRef"
  >
    <slot :is-open />
  </div>

  <BasePopover
    v-model="isOpen"
    :disabled
    :offset-distance="6"
    :virtual-ref
    @close="handlePopoverClose"
    aria-label="右键上下文菜单"
    panel-class="context-menu-box"
    placement="bottom-start"
    ref="popoverRef"
  >
    <div
      :class="`context-menu-size-${size}`"
      @keydown="handleMenuKeydown"
      class="context-menu-inner gap-xs flex flex-col outline-none"
      ref="menuBoxRef"
      role="menu"
      tabindex="-1"
    >
      <ContextMenuItems :items :size :title @select="handleItemSelect" ref="itemsRef" />
    </div>
  </BasePopover>
</template>

<script lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';

import BasePopover from '@/components/ui/BasePopover.vue';

// 记录全局当前打开的菜单，用于互斥关闭
const globalActiveMenuCloseFn = ref<(() => void) | null>(null);
</script>

<script lang="ts" setup>
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

const emit = defineEmits<{
  (e: 'close'): void;
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

/** 菜单关闭回调：若全局互斥记录仍指向自己则清除，并向父级转发关闭事件 */
const handlePopoverClose = () => {
  if (globalActiveMenuCloseFn.value === closeMenu) {
    globalActiveMenuCloseFn.value = null;
  }
  emit('close');
};

/** 关闭本菜单并清理全局互斥记录 */
const closeMenu = () => {
  popoverRef.value?.close();
  handlePopoverClose();
};

/** 在指定坐标打开菜单：先互斥关闭其他菜单，再定位、打开并聚焦首个可用项 */
const openMenuAt = async (clientX: number, clientY: number, _sourceEl?: HTMLElement | null) => {
  if (disabled || !items?.length) return;

  // 如果有其他菜单打开，关掉它
  if (globalActiveMenuCloseFn.value && globalActiveMenuCloseFn.value !== closeMenu) {
    globalActiveMenuCloseFn.value();
  }
  globalActiveMenuCloseFn.value = closeMenu;

  x.value = clientX;
  y.value = clientY;
  isOpen.value = true;

  await nextTick();
  popoverRef.value?.update();
  // 自动聚焦首个有效菜单项
  itemsRef.value?.focusFirstItem();
};

/** 右键事件入口：阻断默认菜单并在鼠标位置打开 */
const handleContextMenu = (e: MouseEvent) => {
  if (disabled) return;
  e.preventDefault();
  e.stopPropagation();
  openMenuAt(e.clientX, e.clientY, triggerWrapperRef.value);
};

/** 菜单项选中：执行动作并关闭菜单 */
const handleItemSelect = (item: ContextMenuItem) => {
  item.action?.();
  closeMenu();
};

/** 菜单键盘导航：↑↓ 在可用项间循环（首尾相接），Tab 关闭 */
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

onBeforeUnmount(() => {
  if (globalActiveMenuCloseFn.value === closeMenu) {
    globalActiveMenuCloseFn.value = null;
  }
});

defineExpose({ openMenuAt, closeMenu });
</script>
