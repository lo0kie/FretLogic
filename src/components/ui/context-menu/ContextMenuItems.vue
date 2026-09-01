<template>
  <div class="p-xs flex flex-col gap-xs box-border">
    <template v-if="title">
      <div
        class="py-xs px-md text-2xs font-semibold text-text-disabled whitespace-nowrap overflow-hidden text-ellipsis select-none"
      >
        {{ title }}
      </div>
      <div class="h-px bg-border-light my-0.5 mx-1" role="separator" />
    </template>

    <template v-for="(item, index) in items" :key="item.label + index">
      <div v-if="item.divided" class="h-px bg-border-light my-0.5 mx-1" role="separator" />

      <BasePopover
        v-if="item.children && item.children.length"
        trigger="hover"
        placement="right-start"
        :offset-distance="4"
        :disabled="item.disabled"
        panel-class="context-menu-box"
      >
        <template #trigger="{ isOpen: isSubOpen, pinToggle }">
          <button
            :ref="el => setItemEl(el, index)"
            type="button"
            role="menuitem"
            :aria-haspopup="true"
            :aria-expanded="isSubOpen"
            :disabled="item.disabled"
            :tabindex="item.disabled ? -1 : 0"
            :aria-disabled="item.disabled"
            data-focusable-inline
            class="group flex items-center rounded-md border-none bg-transparent w-full text-left box-border relative select-none cursor-pointer transition-colors duration-fast outline-none disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent enabled:hover:bg-(--item-hover-bg,var(--bg-panel-hover)) enabled:focus-visible:bg-(--item-hover-bg,var(--bg-panel-hover))"
            :class="[
              currentSizeClass,
              isSubOpen ? 'bg-bg-panel-hover' : '',
              item.danger ? 'text-danger' : 'text-text-title',
            ]"
            :style="getItemStyle(item)"
            :title="item.title"
            @mousedown="item.disabled && $event.preventDefault()"
            @click.stop="!item.disabled && pinToggle()"
          >
            <component
              :is="item.icon"
              v-if="item.icon"
              :size="13"
              :stroke-width="2.5"
              class="shrink-0 opacity-85 group-enabled:group-hover:opacity-100 transition-opacity duration-fast"
              aria-hidden="true"
            />
            <span class="flex-1 min-w-0 whitespace-nowrap"> {{ item.label }} </span>
            <ChevronRight :size="12" class="opacity-50 shrink-0 -mr-0.5" aria-hidden="true" />
          </button>
        </template>

        <template #default>
          <ContextMenuItems :items="item.children" :size @select="emit('select', $event)" />
        </template>
      </BasePopover>

      <button
        v-else
        :ref="el => setItemEl(el, index)"
        v-wave="{ disabled: item.disabled }"
        type="button"
        :role="item.checked !== undefined ? 'menuitemradio' : 'menuitem'"
        :disabled="item.disabled"
        :tabindex="item.disabled ? -1 : 0"
        :aria-disabled="item.disabled"
        :aria-checked="item.checked"
        data-focusable-inline
        class="group flex items-center rounded-md border-none bg-transparent w-full text-left box-border relative select-none cursor-pointer transition-colors duration-fast outline-none disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent enabled:hover:bg-(--item-hover-bg,var(--bg-panel-hover)) enabled:focus-visible:bg-(--item-hover-bg,var(--bg-panel-hover))"
        :class="[
          currentSizeClass,
          item.danger
            ? item.checked
              ? '!bg-tint-danger-88 !text-danger font-semibold'
              : 'text-danger enabled:hover:!bg-tint-danger-88 enabled:focus-visible:!bg-tint-danger-88'
            : item.color
              ? item.checked
                ? 'font-semibold'
                : ''
              : item.checked
                ? '!bg-tint-primary-88 !text-primary font-semibold'
                : 'text-text-title',
        ]"
        :style="getItemStyle(item)"
        :title="item.title"
        @mousedown="item.disabled && $event.preventDefault()"
        @click.stop="handleItemClick(item)"
        @keydown.enter.prevent.stop="handleItemClick(item)"
        @keydown.space.prevent.stop="handleItemClick(item)"
      >
        <Check
          v-if="item.checked"
          :size="13"
          :stroke-width="2.5"
          class="shrink-0 opacity-85 group-enabled:group-hover:opacity-100 transition-opacity duration-fast"
          aria-hidden="true"
        />
        <component
          :is="item.icon"
          v-else-if="item.icon"
          :size="13"
          :stroke-width="2.5"
          class="shrink-0 opacity-85 group-enabled:group-hover:opacity-100 transition-opacity duration-fast"
          aria-hidden="true"
        />

        <span class="flex-1 min-w-0 whitespace-nowrap"> {{ item.label }} </span>

        <span v-if="item.shortcut" class="text-2xs opacity-45 font-mono tracking-tight ml-3 shrink-0 select-none">
          {{ item.shortcut }}
        </span>
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import BasePopover from '@/components/ui/BasePopover.vue';
import { Check, ChevronRight } from '@lucide/vue';
import { computed, onBeforeUpdate, ref, type Component, type CSSProperties } from 'vue';

export interface ContextMenuItem {
  label: string;
  icon?: Component;
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
