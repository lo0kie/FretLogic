<template>
  <div class="flex flex-col gap-xs p-xs" ref="rootRef">
    <template v-if="title">
      <div class="truncate px-md text-2xs leading-tight font-semibold text-fg-disabled select-none">
        {{ title }}
      </div>
      <BaseDivider class="opacity-60" inset="0.25rem" />
    </template>

    <template v-for="(item, index) in items" :key="item.label + index">
      <BaseDivider v-if="item.divided" class="my-0.5 opacity-60" inset="0.25rem" />

      <MenuSubmenu
        v-if="item.expandChildren ?? Boolean(item.children?.length || item.content)"
        :item
        :on-select
        :panel-class
        :panel-scrollbar
        :size
        :item-ref-cb="el => setItemEl(el, index)"
        :ref="el => setSubmenuInstance(el, index)"
        @open="handleSubmenuOpen(index)"
      />

      <button
        v-else
        v-wave="{ disabled: item.disabled }"
        :aria-checked="item.checked"
        :aria-disabled="item.disabled"
        :class="[
          menuRowSizeClass(size),
          item.danger
            ? item.checked
              ? 'bg-tint-danger-88! font-semibold text-danger!'
              : 'text-danger enabled:hover:bg-tint-danger-88! enabled:focus-visible:bg-tint-danger-88!'
            : item.color
              ? item.checked
                ? 'font-semibold'
                : ''
              : item.checked
                ? 'bg-tint-primary-88! font-semibold text-primary!'
                : 'text-fg-title',
        ]"
        :disabled="item.disabled"
        :ref="el => setItemEl(el, index)"
        :role="item.checked !== undefined ? 'menuitemradio' : 'menuitem'"
        :style="getItemStyle(item)"
        :tabindex="item.disabled ? -1 : 0"
        :title="item.title ?? item.label"
        @click.stop="handleItemClick(item)"
        @keydown.enter.prevent.stop="handleItemClick(item)"
        @keydown.space.prevent.stop="handleItemClick(item)"
        @mousedown="item.disabled && $event.preventDefault()"
        data-focusable-outline
        class="group relative flex w-full cursor-pointer items-center rounded-md border-none bg-transparent text-left transition-colors duration-fast outline-none select-none enabled:hover:bg-(--item-hover-bg,var(--bg-panel-hover)) enabled:focus-visible:bg-(--item-hover-bg,var(--bg-panel-hover)) disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
        type="button"
      >
        <!-- 前导槽：勾选在左时 check 占据槽位（替换 icon），否则渲染 icon -->
        <BaseIcon
          v-if="item.checked && item.checkPosition !== 'right'"
          aria-hidden="true"
          class="shrink-0 opacity-85 transition-opacity duration-fast group-enabled:group-hover:opacity-100"
          icon-size="md"
          icon-stroke="bold"
          name="check"
        />
        <BaseIcon
          v-else-if="typeof item.icon === 'string'"
          :name="item.icon"
          aria-hidden="true"
          class="shrink-0 opacity-85 transition-opacity duration-fast group-enabled:group-hover:opacity-100"
          icon-size="md"
          icon-stroke="bold"
        />
        <component
          v-else-if="item.icon"
          :is="item.icon"
          aria-hidden="true"
          class="shrink-0 opacity-85 transition-opacity duration-fast group-enabled:group-hover:opacity-100"
          icon-size="md"
          icon-stroke="bold"
        />

        <span class="min-w-0 flex-1 whitespace-nowrap"> {{ item.label }} </span>

        <span v-if="item.shortcut" class="ml-3 shrink-0 font-mono text-2xs tracking-tight opacity-45 select-none">
          {{ item.shortcut }}
        </span>

        <!-- 勾选在右：行尾追加 check，不占前导图标槽 -->
        <BaseIcon
          v-if="item.checked && item.checkPosition === 'right'"
          aria-hidden="true"
          class="ml-3 shrink-0 opacity-85 transition-opacity duration-fast group-enabled:group-hover:opacity-100"
          icon-size="md"
          icon-stroke="bold"
          name="check"
        />
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onBeforeUpdate, onMounted, ref, useTemplateRef } from 'vue';

import BaseDivider from '@/platform/ui/divider/BaseDivider.vue';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';

import MenuSubmenu from './MenuSubmenu.vue';
import { getItemStyle, menuRowSizeClass } from './menuRowStyle';

import type { MenuItem } from './types';
import type { ComponentSize } from '@/platform/types';

defineOptions({ inheritAttrs: false });

const {
  items = [],
  title = '',
  size = 'md',
  panelClass = 'context-menu-box',
  panelScrollbar = false,
  onSelect = undefined,
} = defineProps<{
  /** 菜单项数据列表（children 级联项委托给 MenuSubmenu 渲染） */
  items?: MenuItem[];
  /** 顶部分组标题；为空时不渲染标题行与分割线 */
  title?: string;
  /** 菜单尺寸档位 */
  size?: ComponentSize;
  /** 级联子菜单面板样式类 */
  panelClass?: string;
  /** 级联子菜单面板是否用 v-scrollbar 自绘滚动条（透传 MenuSubmenu → BasePopover） */
  panelScrollbar?: boolean;
  /** 菜单项选中回调：由容器统一处理（执行 action、关闭浮层等） */
  onSelect?: (item: MenuItem) => void;
}>();

const itemEls = ref<(HTMLButtonElement | null)[]>([]);

/** 收集菜单项 DOM（函数式 ref），供键盘导航聚焦 */
const setItemEl = (el: unknown, index: number) => {
  if (el instanceof HTMLButtonElement) itemEls.value[index] = el;
};

type MenuSubmenuInstance = InstanceType<typeof MenuSubmenu>;
/** 收集级联子面板实例（函数式 ref），供兄弟互斥关闭 */
const submenuInstances = ref<(MenuSubmenuInstance | null)[]>([]);
const setSubmenuInstance = (el: unknown, index: number) => {
  submenuInstances.value[index] = (el as MenuSubmenuInstance | null) ?? null;
};

onBeforeUpdate(() => {
  itemEls.value = [];
  submenuInstances.value = [];
});

/** 级联兄弟互斥：任一子面板打开即关闭上一个打开的兄弟子面板。
 *  兄弟被「点击钉住」后 hover 离开不再自行关闭（pinned 早退），不做互斥会出现
 *  两个子菜单同时展开；close 幂等，重复关闭无副作用 */
let lastOpenSubmenuIndex = -1;
/** 滚动收起后的打开抑制窗口（ms）：惯性/连续滚动期间，迟到的 hover 打开会被下一个
 *  scroll 事件立刻收掉，表现为预览闪一下又消失。窗口内的 open 在同一调用栈内同步关闭——
 *  open+close 不产生任何一次绘制，肉眼无闪烁；窗口过后悬停恢复正常打开 */
const SCROLL_SUPPRESS_OPEN_MS = 250;
let lastScrollClosedAt = 0;
const handleSubmenuOpen = (index: number) => {
  if (Date.now() - lastScrollClosedAt < SCROLL_SUPPRESS_OPEN_MS) {
    submenuInstances.value[index]?.close();
    return;
  }
  if (lastOpenSubmenuIndex !== -1 && lastOpenSubmenuIndex !== index)
    submenuInstances.value[lastOpenSubmenuIndex]?.close();

  lastOpenSubmenuIndex = index;
};

/** 收起本层当前展开的子面板，并复位互斥游标；byScroll 时登记抑制窗口起点 */
const closeAllSubmenus = (byScroll = false) => {
  if (lastOpenSubmenuIndex === -1) return;
  submenuInstances.value[lastOpenSubmenuIndex]?.close();
  lastOpenSubmenuIndex = -1;
  if (byScroll) lastScrollClosedAt = Date.now();
};

// —— 菜单滚动时收起已展开的级联子面板 ——
// 滚轮滚动不派发 mouseover/mouseleave：指针停在原地、列表内容滚走，
// 已展开的子面板会跟着触发元素被 floating-ui 重新定位到视口上/下边缘之外，
// 直到指针移到另一个条目才被互斥关闭。故在捕获阶段监听 window 滚动（scroll 不冒泡，
// 但捕获阶段会沿祖先链传播），滚动容器是本层菜单面板（含本层根节点）时立即收起。
const rootRef = useTemplateRef<HTMLElement>('rootRef');
const handleAncestorScroll = (e: Event) => {
  if (lastOpenSubmenuIndex === -1) return;
  const root = rootRef.value;
  if (!root || !(e.target instanceof Node) || !e.target.contains(root)) return;
  closeAllSubmenus(true);
};
onMounted(() => window.addEventListener('scroll', handleAncestorScroll, true));
onBeforeUnmount(() => window.removeEventListener('scroll', handleAncestorScroll, true));

/** 菜单项点击 / 回车：禁用态忽略，调用 onSelect 回调交给容器处理 */
const handleItemClick = (item: MenuItem) => {
  if (item.disabled) return;
  onSelect?.(item);
};

/** 聚焦第一个可用菜单项 */
const focusFirstItem = () => {
  const first = itemEls.value.find(el => el && !el.disabled);
  first?.focus();
};

defineExpose({
  itemEls,
  focusFirstItem,
});
</script>
