<template>
  <div class="p-xs gap-xs box-border flex flex-col">
    <template v-if="title">
      <div
        class="px-md text-2xs text-text-disabled overflow-hidden py-[0.15rem] leading-none font-semibold text-ellipsis whitespace-nowrap select-none"
      >
        {{ title }}
      </div>
      <div class="bg-border-light mx-1 my-0.5 h-px" role="separator" />
    </template>

    <template v-for="(item, index) in items" :key="item.label + index">
      <div v-if="item.divided" class="bg-border-light mx-1 my-0.5 h-px" role="separator" />

      <BasePopover
        v-if="item.expandChildren ?? Boolean(item.children?.length)"
        :disabled="item.disabled"
        :offset-distance="4"
        panel-class="context-menu-box"
        placement="right-start"
        trigger="hover"
      >
        <template #trigger="{ isOpen: isSubOpen, pinToggle }">
          <button
            :aria-disabled="item.disabled"
            :aria-expanded="isSubOpen"
            :aria-haspopup="true"
            :class="[
              currentSizeClass,
              isSubOpen ? 'bg-bg-panel-hover' : '',
              item.danger ? 'text-danger' : 'text-text-title',
            ]"
            :disabled="item.disabled"
            :ref="el => setItemEl(el, index)"
            :style="getItemStyle(item)"
            :tabindex="item.disabled ? -1 : 0"
            :title="item.title ?? item.label"
            @click.stop="!item.disabled && pinToggle()"
            @mousedown="item.disabled && $event.preventDefault()"
            data-focusable-inline
            class="group duration-fast relative box-border flex w-full cursor-pointer items-center rounded-md border-none bg-transparent text-left transition-colors outline-none select-none enabled:hover:bg-(--item-hover-bg,var(--bg-panel-hover)) enabled:focus-visible:bg-(--item-hover-bg,var(--bg-panel-hover)) disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
            role="menuitem"
            type="button"
          >
            <BaseIcon
              v-if="typeof item.icon === 'string'"
              :name="item.icon"
              aria-hidden="true"
              class="duration-fast shrink-0 opacity-85 transition-opacity group-enabled:group-hover:opacity-100"
              icon-stroke="bold"
              size="md"
            />
            <component
              v-else-if="item.icon"
              :is="item.icon"
              aria-hidden="true"
              class="duration-fast shrink-0 opacity-85 transition-opacity group-enabled:group-hover:opacity-100"
              icon-stroke="bold"
              size="md"
            />
            <span class="min-w-0 flex-1 whitespace-nowrap"> {{ item.label }} </span>
            <BaseIcon
              aria-hidden="true"
              class="-mr-0.5 shrink-0 opacity-50"
              icon-stroke="bold"
              name="chevron-right"
              size="md"
            />
          </button>
        </template>

        <template #default>
          <ContextMenuItems :size :items="item.children" @select="emit('select', $event)" />
        </template>
      </BasePopover>

      <button
        v-else
        v-wave="{ disabled: item.disabled }"
        :aria-checked="item.checked"
        :aria-disabled="item.disabled"
        :class="[
          currentSizeClass,
          item.danger
            ? item.checked
              ? 'bg-tint-danger-88! text-danger! font-semibold'
              : 'text-danger enabled:hover:bg-tint-danger-88! enabled:focus-visible:bg-tint-danger-88!'
            : item.color
              ? item.checked
                ? 'font-semibold'
                : ''
              : item.checked
                ? 'bg-tint-primary-88! text-primary! font-semibold'
                : 'text-text-title',
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
        class="group duration-fast relative box-border flex w-full cursor-pointer items-center rounded-md border-none bg-transparent text-left transition-colors outline-none select-none enabled:hover:bg-(--item-hover-bg,var(--bg-panel-hover)) enabled:focus-visible:bg-(--item-hover-bg,var(--bg-panel-hover)) disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
        type="button"
      >
        <BaseIcon
          v-if="item.checked"
          aria-hidden="true"
          class="duration-fast shrink-0 opacity-85 transition-opacity group-enabled:group-hover:opacity-100"
          icon-stroke="bold"
          name="check"
          size="md"
        />
        <BaseIcon
          v-else-if="typeof item.icon === 'string'"
          :name="item.icon"
          aria-hidden="true"
          class="duration-fast shrink-0 opacity-85 transition-opacity group-enabled:group-hover:opacity-100"
          icon-stroke="bold"
          size="md"
        />
        <component
          v-else-if="item.icon"
          :is="item.icon"
          aria-hidden="true"
          class="duration-fast shrink-0 opacity-85 transition-opacity group-enabled:group-hover:opacity-100"
          icon-stroke="bold"
          size="md"
        />

        <span class="min-w-0 flex-1 whitespace-nowrap"> {{ item.label }} </span>

        <span v-if="item.shortcut" class="text-2xs ml-3 shrink-0 font-mono tracking-tight opacity-45 select-none">
          {{ item.shortcut }}
        </span>
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUpdate, ref, type Component, type CSSProperties } from 'vue';

import type { ComponentSize } from '@/platform/types';
import { CONTROL_HEIGHT_CLASSES } from '@/platform/ui/controlSizes';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import type { IconName } from '@/platform/ui/icons/icons.registry';
import BasePopover from '@/platform/ui/popover/BasePopover.vue';

export interface ContextMenuItem {
  label: string;
  icon?: IconName | Component;
  action?: () => void;
  checked?: boolean;
  color?: string;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
  /** 点击后是否保持菜单打开状态（不自动关闭浮层） */
  keepOpen?: boolean;
  /** 快捷键提示文本，如 Ctrl+C */
  shortcut?: string;
  /** 是否在此项前插入分割线 */
  divided?: boolean;
  /**
   * 是否展开 children 为级联子菜单；不传时以「是否带 children」决定，
   * 显式传入 true/false 则强制采用该布尔值。
   * 置为 false 时即使带 children 也按普通项渲染，使用 action 作为点击行为，
   * 便于「单子项时不弹出子菜单」等场景，免去调用方在两种形态间切换对象。
   */
  expandChildren?: boolean;
  /** 级联子菜单列表 */
  children?: ContextMenuItem[];
}

defineOptions({ inheritAttrs: false });

const {
  items = [],
  title = '',
  size = 'md',
} = defineProps<{
  items?: ContextMenuItem[];
  title?: string;
  size?: ComponentSize;
}>();

const emit = defineEmits<{
  (e: 'select', item: ContextMenuItem): void;
}>();

const itemEls = ref<Array<HTMLButtonElement | null>>([]);

/** 收集菜单项 DOM（函数式 ref），供键盘导航聚焦 */
const setItemEl = (el: unknown, index: number) => {
  if (el instanceof HTMLButtonElement) {
    itemEls.value[index] = el;
  }
};

onBeforeUpdate(() => {
  itemEls.value = [];
});

const SIZE_MAP: Record<'sm' | 'md' | 'lg', string> = {
  sm: `${CONTROL_HEIGHT_CLASSES.sm} px-sm text-2xs gap-sm`,
  md: `${CONTROL_HEIGHT_CLASSES.md} px-md text-xs gap-sm`,
  lg: `${CONTROL_HEIGHT_CLASSES.lg} px-md text-xs gap-sm`,
};

const currentSizeClass = computed(() => SIZE_MAP[size] ?? SIZE_MAP.md);

/** 菜单项点击 / 回车：禁用态忽略，向上派发 select */
const handleItemClick = (item: ContextMenuItem) => {
  if (item.disabled) return;
  emit('select', item);
};

/** 自定义 color 项的内联样式：选中底色与 hover 底色按色彩混合生成 */
const getItemStyle = (item: ContextMenuItem): CSSProperties | undefined => {
  if (item.disabled) return undefined;
  if (item.color) {
    return {
      'color': item.color,
      'backgroundColor': item.checked ? `color-mix(in srgb, ${item.color} 18%, transparent)` : undefined,
      '--item-hover-bg': `color-mix(in srgb, ${item.color} 12%, transparent)`,
    } as CSSProperties;
  }
  return undefined;
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
