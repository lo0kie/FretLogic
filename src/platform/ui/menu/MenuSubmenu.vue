<template>
  <BasePopover
    :panel-class
    :disabled="item.disabled"
    :offset-distance="MENU_SUBMENU_OFFSET_DISTANCE"
    placement="right-start"
    trigger="hover"
  >
    <template #trigger="{ isOpen: isSubOpen, pinToggle }">
      <button
        :aria-disabled="item.disabled"
        :aria-expanded="isSubOpen"
        :aria-haspopup="true"
        :class="[
          menuRowSizeClass(size),
          isSubOpen ? 'bg-surface-panel-hover' : '',
          item.danger ? 'text-danger' : 'text-fg-title',
        ]"
        :disabled="item.disabled"
        :ref="itemRefCb"
        :style="getItemStyle(item)"
        :tabindex="item.disabled ? -1 : 0"
        :title="item.title ?? item.label"
        @click.stop="!item.disabled && pinToggle()"
        @mousedown="item.disabled && $event.preventDefault()"
        data-focusable-inline
        class="group relative flex w-full cursor-pointer items-center rounded-md border-none bg-transparent text-left transition-colors duration-fast outline-none select-none enabled:hover:bg-(--item-hover-bg,var(--bg-panel-hover)) enabled:focus-visible:bg-(--item-hover-bg,var(--bg-panel-hover)) disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
        role="menuitem"
        type="button"
      >
        <BaseIcon
          v-if="typeof item.icon === 'string'"
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
        <BaseIcon
          aria-hidden="true"
          class="-mr-0.5 shrink-0 opacity-50"
          icon-size="md"
          icon-stroke="bold"
          name="chevron-right"
        />
      </button>
    </template>

    <template #default>
      <MenuItems :on-select :icon-size="size" :items="item.children" />
    </template>
  </BasePopover>
</template>

<script setup lang="ts">
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import BasePopover from '@/platform/ui/popover/BasePopover.vue';
import { MENU_SUBMENU_OFFSET_DISTANCE } from '@/platform/utils/constants';

import MenuItems from './MenuItems.vue';
import { getItemStyle, menuRowSizeClass } from './menuRowStyle';

import type { MenuItem } from './types';
import type { ComponentSize } from '@/platform/types';

defineOptions({ inheritAttrs: false });

defineProps<{
  /** 级联菜单项（含 children） */
  item: MenuItem;
  /** 菜单尺寸档位 */
  size?: ComponentSize;
  /** 触发项 DOM 回调：父级用于收集键盘导航焦点项 */
  itemRefCb?: (el: unknown) => void;
  /** 级联子菜单面板样式类 */
  panelClass?: string;
  /** 选中回调：由子级菜单向上的 select 透传，交给容器处理 */
  onSelect?: (item: MenuItem) => void;
}>();
</script>
