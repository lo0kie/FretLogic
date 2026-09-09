<template>
  <!-- ── 按钮/下拉分支：hover | click，委托 BasePopover 原生 trigger slot 管理开关与定位 ── -->
  <BasePopover
    v-if="isRadioTrigger"
    v-model="isOpen"
    :disabled
    :hover-close-delay
    :hover-open-delay
    :offset-distance
    :panel-class
    :panel-style
    :placement
    :trigger
    :auto-focus="false"
    @close="handlePopoverClose()"
    aria-label="菜单"
    ref="popoverRef"
  >
    <template #trigger="{ isOpen: slotIsOpen, pinToggle }">
      <slot :pin-toggle :is-open="slotIsOpen" name="trigger" />
    </template>

    <div :class="panelInnerClass" @keydown="handleMenuKeydown($event)" ref="menuBoxRef" role="menu" tabindex="-1">
      <MenuItems :items :panel-class :size :title :on-select="handleItemSelect" ref="itemsRef" />
    </div>
  </BasePopover>

  <!-- ── 右键分支：contextmenu，手动虚拟锚点 + openMenuAt；包裹层只拦右键，不拦 click ── -->
  <template v-else>
    <div
      :class="{ 'cursor-default': disabled }"
      @contextmenu="handleContextMenu($event)"
      class="context-menu-trigger-wrapper contents"
      ref="triggerWrapperRef"
    >
      <slot :is-open />
    </div>

    <BasePopover
      v-model="isOpen"
      :close-on-context-trigger-click
      :disabled
      :offset-distance
      :panel-class
      :panel-style
      :placement
      :virtual-ref
      :auto-focus="false"
      :context-trigger-el="triggerWrapperRef"
      @close="handlePopoverClose()"
      aria-label="菜单"
      ref="popoverRef"
    >
      <div :class="panelInnerClass" @keydown="handleMenuKeydown($event)" ref="menuBoxRef" role="menu" tabindex="-1">
        <MenuItems :items :panel-class :size :title :on-select="handleItemSelect" ref="itemsRef" />
      </div>
    </BasePopover>
  </template>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';

import MenuItems from '@/platform/ui/menu/MenuItems.vue';
import BasePopover from '@/platform/ui/popover/BasePopover.vue';
import { createVirtualElementRect } from '@/platform/ui/popover/floatingCore';
import { CONTEXT_MENU_REPOSITION_DURATION_MS, CONTEXT_MENU_REPOSITION_EASING } from '@/platform/utils/constants';

import type { ComponentSize } from '@/platform/types';
import type { MenuItem } from '@/platform/ui/menu/types';
import type { Placement } from '@floating-ui/vue';
import type { CSSProperties } from 'vue';

defineOptions({ name: 'BaseMenu', inheritAttrs: false });

const {
  items,
  trigger = 'hover',
  placement: placementProp = undefined,
  size = 'md',
  title = '',
  disabled = false,
  hoverOpenDelay = 50,
  hoverCloseDelay = undefined,
  offsetDistance = 6,
  panelClass = 'context-menu-box',
  panelStyle = {},
  closeOnContextTriggerClick = true,
} = defineProps<{
  /** 菜单项数据列表（支持 children 级联子菜单） */
  items: MenuItem[];
  /** 触发方式：hover（悬停，含点击钉住） | click（左键点击） | contextmenu（右键） */
  trigger?: 'hover' | 'click' | 'contextmenu';
  /** 浮层相对锚点的定位方位；默认 contextmenu→bottom-start（鼠标坐标），其余→bottom-end */
  placement?: Placement;
  /** 菜单尺寸档位 */
  size?: ComponentSize;
  /** 顶部分组标题；为空时不渲染标题行与分割线（透传给 MenuItems） */
  title?: string;
  /** 是否禁用菜单：禁用时不响应触发 */
  disabled?: boolean;
  /** hover 触发时移入后延时打开的毫秒数（仅按钮/下拉分支） */
  hoverOpenDelay?: number;
  /** hover 触发时移出后延时关闭的毫秒数（仅按钮/下拉分支） */
  hoverCloseDelay?: number;
  /** 浮层与锚点之间的间距（px） */
  offsetDistance?: number;
  /** 附加到浮层面板上的类名 */
  panelClass?: string;
  /** 附加到浮层面板上的内联样式 */
  panelStyle?: CSSProperties;
  /** 右键分支：左键点击触发区内部时是否关闭浮层 */
  closeOnContextTriggerClick?: boolean;
}>();

const emit = defineEmits<{
  (e: 'select', item: MenuItem): void;
  (e: 'close'): void;
}>();

// 模块级互斥：一组菜单同时只允许打开一个（打开新菜单时只关其他菜单，非关闭所有浮层）。
// 必须放在模块作用域而非 <script setup> 体，否则每个实例各持一份、跨实例互斥失效。
const mutexCloseRef = ref<(() => void) | null>(null);

/** 尺寸 → 类名静态映射：避免模板字符串拼接（Tailwind/扫描器无法识别动态拼接的类） */
const MENU_SIZE_CLASS: Record<ComponentSize, string> = {
  sm: 'context-menu-size-sm',
  md: 'context-menu-size-md',
  lg: 'context-menu-size-lg',
};

const isOpen = ref(false);
const x = ref(0);
const y = ref(0);

const popoverRef = useTemplateRef<InstanceType<typeof BasePopover>>('popoverRef');
const menuBoxRef = useTemplateRef<HTMLElement>('menuBoxRef');
const itemsRef = useTemplateRef<InstanceType<typeof MenuItems>>('itemsRef');
const triggerWrapperRef = useTemplateRef<HTMLElement>('triggerWrapperRef');

const isRadioTrigger = computed(() => trigger === 'hover' || trigger === 'click');

const placement = computed<Placement>(
  () => placementProp || (trigger === 'contextmenu' ? 'bottom-start' : 'bottom-end')
);

const menuSizeClass = computed(() => MENU_SIZE_CLASS[size] ?? MENU_SIZE_CLASS.md);

/** 面板内层类名：尺寸 + 内部布局（模板内两个分支共用同一段类名数组） */
const panelInnerClass = computed(() => [menuSizeClass.value, 'context-menu-inner flex flex-col gap-xs outline-none']);

/** 右键分支专用虚拟锚点：以鼠标坐标构造定位点 */
const virtualRef = computed(() => (trigger === 'contextmenu' ? createVirtualElementRect(x.value, y.value) : null));

/** 关闭本菜单并清理全局互斥记录 */
const closeMenu = () => {
  popoverRef.value?.close();
};

/** 互斥登记：打开时关掉其他菜单并登记自己，关闭时清空指向自己的登记 */
watch(isOpen, val => {
  if (val) {
    if (mutexCloseRef.value && mutexCloseRef.value !== closeMenu) mutexCloseRef.value();
    mutexCloseRef.value = closeMenu;
  } else if (mutexCloseRef.value === closeMenu) {
    mutexCloseRef.value = null;
  }
});

/** 打开后自动聚焦面板内首个可用项（三态通用） */
watch(isOpen, async val => {
  if (val) {
    await nextTick();
    itemsRef.value?.focusFirstItem();
  }
});

/** 菜单关闭回调：清互斥登记，并向父级转发关闭事件 */
const handlePopoverClose = () => {
  if (mutexCloseRef.value === closeMenu) {
    mutexCloseRef.value = null;
  }
  emit('close');
};

/** 菜单项选中：向上派发 → 执行动作 → 非 keepOpen 项关闭浮层 */
const handleItemSelect = (item: MenuItem) => {
  emit('select', item);
  item.action?.();
  if (!item.keepOpen) closeMenu();
};

/** 在指定坐标打开菜单：先互斥关闭其他菜单，再定位、打开并聚焦首个可用项 */
const openMenuAt = async (clientX: number, clientY: number) => {
  if (disabled || !items?.length) return;
  const wasOpen = isOpen.value;
  const prevX = x.value;
  const prevY = y.value;

  x.value = clientX;
  y.value = clientY;
  isOpen.value = true;

  await nextTick();
  popoverRef.value?.update();

  // 已打开时切换锚点：定位更新后用 WAAPI 从旧坐标平滑滑到新坐标（首次打开走 Transition 入场）
  if (wasOpen) {
    animateReposition(prevX, prevY);
  }
};

/** 换位动画：对浮层宿主做 FLIP 位移（从旧坐标偏移归零），尊重系统减弱动态效果偏好 */
const animateReposition = (prevX: number, prevY: number) => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const host = menuBoxRef.value?.closest<HTMLElement>('[data-floating-layer]');
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

/** 右键事件入口：阻断默认菜单并在鼠标位置打开（右键分支专用） */
const handleContextMenu = (e: MouseEvent) => {
  if (disabled) return;
  e.preventDefault();
  e.stopPropagation();
  void openMenuAt(e.clientX, e.clientY);
};

/** 菜单键盘导航：↑↓ 在可用项间循环（首尾相接），Tab 关闭（三态通用） */
const handleMenuKeydown = (e: KeyboardEvent) => {
  const itemEls = itemsRef.value?.itemEls || [];
  const currentIndex = itemEls.findIndex(el => el === document.activeElement);
  const itemsList = items ?? [];

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    let nextIdx = currentIndex + 1;
    while (nextIdx < itemsList.length && itemsList[nextIdx]?.disabled) nextIdx++;
    if (nextIdx >= itemsList.length) nextIdx = itemsList.findIndex(item => !item.disabled);
    if (nextIdx !== -1) itemEls[nextIdx]?.focus();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    let prevIdx = currentIndex - 1;
    while (prevIdx >= 0 && itemsList[prevIdx]?.disabled) prevIdx--;
    if (prevIdx < 0) {
      prevIdx = itemsList.length - 1;
      while (prevIdx >= 0 && itemsList[prevIdx]?.disabled) prevIdx--;
    }
    if (prevIdx !== -1) itemEls[prevIdx]?.focus();
  } else if (e.key === 'Tab') {
    e.preventDefault();
    closeMenu();
  }
};

onBeforeUnmount(() => {
  if (mutexCloseRef.value === closeMenu) {
    mutexCloseRef.value = null;
  }
});

defineExpose({ openMenuAt, closeMenu });
</script>
