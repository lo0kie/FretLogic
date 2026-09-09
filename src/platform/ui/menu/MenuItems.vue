<template>
  <div class="flex flex-col gap-xs p-xs">
    <template v-if="title">
      <div class="truncate px-md py-[0.15rem] text-2xs leading-none font-semibold text-fg-disabled select-none">
        {{ title }}
      </div>
      <div class="mx-1 my-0.5 h-px bg-border-light" role="separator" />
    </template>

    <template v-for="(item, index) in items" :key="item.label + index">
      <div v-if="item.divided" class="mx-1 my-0.5 h-px bg-border-light" role="separator" />

      <MenuSubmenu
        v-if="item.expandChildren ?? Boolean(item.children?.length)"
        :item
        :on-select
        :panel-class
        :size
        :item-ref-cb="el => setItemEl(el, index)"
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
        data-focusable-inline
        class="group relative flex w-full cursor-pointer items-center rounded-md border-none bg-transparent text-left transition-colors duration-fast outline-none select-none enabled:hover:bg-(--item-hover-bg,var(--bg-panel-hover)) enabled:focus-visible:bg-(--item-hover-bg,var(--bg-panel-hover)) disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
        type="button"
      >
        <BaseIcon
          v-if="item.checked"
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
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUpdate, ref } from 'vue';

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
  /** 菜单项选中回调：由容器统一处理（执行 action、关闭浮层等） */
  onSelect?: (item: MenuItem) => void;
}>();

const itemEls = ref<(HTMLButtonElement | null)[]>([]);

/** 收集菜单项 DOM（函数式 ref），供键盘导航聚焦 */
const setItemEl = (el: unknown, index: number) => {
  if (el instanceof HTMLButtonElement) {
    itemEls.value[index] = el;
  }
};

onBeforeUpdate(() => {
  itemEls.value = [];
});

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
