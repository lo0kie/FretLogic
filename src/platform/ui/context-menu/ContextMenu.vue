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
    :virtual-ref
    :offset-distance="6"
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
      <ContextMenuItems :items :size @select="handleItemSelect" ref="itemsRef" />
    </div>
  </BasePopover>
</template>

<script lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';

import type { ComponentSize } from '@/platform/types';
import BasePopover from '@/platform/ui/popover/BasePopover.vue';

// 记录全局当前打开的菜单，用于互斥关闭
const globalActiveMenuCloseFn = ref<(() => void) | null>(null);
</script>

<script setup lang="ts">
import { createVirtualElementRect } from '@/platform/ui/popover/floatingCore';
import { CONTEXT_MENU_REPOSITION_DURATION_MS, CONTEXT_MENU_REPOSITION_EASING } from '@/platform/utils/constants';

import ContextMenuItems, { type ContextMenuItem } from './ContextMenuItems.vue';

defineOptions({ name: 'ContextMenu', inheritAttrs: false });

const {
  items,
  disabled = false,
  size = 'md',
} = defineProps<{
  items: ContextMenuItem[];
  disabled?: boolean;
  size?: ComponentSize;
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

const virtualRef = computed(() => createVirtualElementRect(x.value, y.value));

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

  const wasOpen = isOpen.value;
  const prevX = x.value;
  const prevY = y.value;

  x.value = clientX;
  y.value = clientY;
  isOpen.value = true;

  // 已打开时切换锚点：定位更新后用 WAAPI 从旧坐标平滑滑到新坐标（首次打开走 Transition 入场）
  if (wasOpen) {
    await nextTick();
    popoverRef.value?.update();
    animateReposition(prevX, prevY);
    return;
  }

  await nextTick();
  popoverRef.value?.update();
  // 自动聚焦首个有效菜单项
  itemsRef.value?.focusFirstItem();
};

/** 换位动画：对浮层宿主做 FLIP 位移（从旧坐标偏移归零），尊重系统减弱动态效果偏好 */
const animateReposition = (prevX: number, prevY: number) => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const rootEl = itemsRef.value?.$el as HTMLElement | undefined;
  const host = rootEl?.closest<HTMLElement>('[data-floating-layer]');
  if (!host) return;
  host.animate(
    [{ transform: `translate(${prevX - x.value}px, ${prevY - y.value}px)` }, { transform: 'translate(0, 0)' }],
    {
      composite: 'add', // floating-ui 用 transform 定位宿主，动画必须叠加而非替换，否则会瞬移到原点
      duration: CONTEXT_MENU_REPOSITION_DURATION_MS,
      easing: CONTEXT_MENU_REPOSITION_EASING,
    }
  );
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
