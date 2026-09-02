<template>
  <div class="p-xs gap-xs box-border flex flex-col">
    <template v-if="title">
      <div
        class="py-xs px-md text-2xs text-text-disabled overflow-hidden font-semibold text-ellipsis whitespace-nowrap select-none"
      >
        {{ title }}
      </div>
      <div class="bg-border-light mx-1 my-0.5 h-px" role="separator" />
    </template>

    <template v-for="(item, index) in items" :key="item.label + index">
      <div v-if="item.divided" class="bg-border-light mx-1 my-0.5 h-px" role="separator" />

      <BasePopover
        v-if="item.children && item.children.length"
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
            :title="item.title"
            @click.stop="!item.disabled && pinToggle()"
            @mousedown="item.disabled && $event.preventDefault()"
            class="group duration-fast relative box-border flex w-full cursor-pointer items-center rounded-md border-none bg-transparent text-left transition-colors outline-none select-none enabled:hover:bg-(--item-hover-bg,var(--bg-panel-hover)) enabled:focus-visible:bg-(--item-hover-bg,var(--bg-panel-hover)) disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
            data-focusable-inline
            role="menuitem"
            type="button"
          >
            <BaseIcon
              v-if="typeof item.icon === 'string'"
              :name="item.icon"
              :size="13"
              aria-hidden="true"
              class="duration-fast shrink-0 opacity-85 transition-opacity group-enabled:group-hover:opacity-100"
            />
            <component
              v-else-if="item.icon"
              :is="item.icon"
              :size="13"
              :stroke-width="2.5"
              aria-hidden="true"
              class="duration-fast shrink-0 opacity-85 transition-opacity group-enabled:group-hover:opacity-100"
            />
            <span class="min-w-0 flex-1 whitespace-nowrap"> {{ item.label }} </span>
            <BaseIcon :size="12" aria-hidden="true" class="-mr-0.5 shrink-0 opacity-50" name="chevron-right" />
          </button>
        </template>

        <template #default>
          <ContextMenuItems :items="item.children" :size @select="emit('select', $event)" />
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
        :title="item.title"
        @click.stop="handleItemClick(item)"
        @keydown.enter.prevent.stop="handleItemClick(item)"
        @keydown.space.prevent.stop="handleItemClick(item)"
        @mousedown="item.disabled && $event.preventDefault()"
        class="group duration-fast relative box-border flex w-full cursor-pointer items-center rounded-md border-none bg-transparent text-left transition-colors outline-none select-none enabled:hover:bg-(--item-hover-bg,var(--bg-panel-hover)) enabled:focus-visible:bg-(--item-hover-bg,var(--bg-panel-hover)) disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
        data-focusable-inline
        type="button"
      >
        <BaseIcon
          v-if="item.checked"
          :size="13"
          aria-hidden="true"
          class="duration-fast shrink-0 opacity-85 transition-opacity group-enabled:group-hover:opacity-100"
          name="check"
        />
        <BaseIcon
          v-else-if="typeof item.icon === 'string'"
          :name="item.icon"
          :size="13"
          aria-hidden="true"
          class="duration-fast shrink-0 opacity-85 transition-opacity group-enabled:group-hover:opacity-100"
        />
        <component
          v-else-if="item.icon"
          :is="item.icon"
          :size="13"
          :stroke-width="2.5"
          aria-hidden="true"
          class="duration-fast shrink-0 opacity-85 transition-opacity group-enabled:group-hover:opacity-100"
        />

        <span class="min-w-0 flex-1 whitespace-nowrap"> {{ item.label }} </span>

        <span v-if="item.shortcut" class="text-2xs ml-3 shrink-0 font-mono tracking-tight opacity-45 select-none">
          {{ item.shortcut }}
        </span>
      </button>
    </template>
  </div>
</template>

<script lang="ts" setup>
import { computed, onBeforeUpdate, ref, type Component, type CSSProperties } from 'vue';

import BaseIcon from '@/components/ui/BaseIcon.vue';
import BasePopover from '@/components/ui/BasePopover.vue';
import type { IconName } from '@/components/ui/icons.registry';

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
  size?: 'sm' | 'md' | 'lg';
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
  sm: 'h-[1.6rem] px-sm text-2xs gap-sm',
  md: 'h-[1.9rem] px-md text-xs gap-sm',
  lg: 'h-[2.3rem] px-md text-xs gap-sm',
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
