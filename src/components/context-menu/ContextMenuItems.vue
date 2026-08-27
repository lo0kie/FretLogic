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

    <button
      v-for="item in items"
      :key="item.label"
      ref="itemEls"
      v-wave="{ disabled: item.disabled }"
      type="button"
      :role="item.checked !== undefined ? 'menuitemradio' : 'menuitem'"
      :tabindex="item.disabled ? -1 : 0"
      :aria-disabled="item.disabled"
      :aria-checked="item.checked"
      data-focusable-inline
      class="group flex items-center rounded-md border-none bg-transparent w-full text-left box-border relative select-none cursor-pointer transition-colors duration-fast outline-none disabled:opacity-35 disabled:cursor-not-allowed disabled:pointer-events-none hover:bg-(--item-hover-bg,var(--bg-panel-hover)) focus-visible:bg-(--item-hover-bg,var(--bg-panel-hover))"
      :class="[
        currentSizeClass,
        item.danger
          ? item.checked
            ? '!bg-tint-danger-88 !text-danger font-semibold'
            : 'text-danger hover:!bg-tint-danger-88 focus-visible:!bg-tint-danger-88'
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
        class="shrink-0 opacity-85 group-hover:opacity-100 transition-opacity duration-fast"
        aria-hidden="true"
      />
      <component
        :is="item.icon"
        v-else-if="item.icon"
        :size="13"
        :stroke-width="2.5"
        class="shrink-0 opacity-85 group-hover:opacity-100 transition-opacity duration-fast"
        aria-hidden="true"
      />

      <span class="flex-1 min-w-0 whitespace-nowrap"> {{ item.label }} </span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { Check } from '@lucide/vue';
import type { CSSProperties, FunctionalComponent } from 'vue';
import { computed, useTemplateRef } from 'vue';

export interface ContextMenuItem {
  label: string;
  icon?: FunctionalComponent;
  action: () => void;
  checked?: boolean;
  color?: string;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
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

const itemEls = useTemplateRef<HTMLButtonElement[]>('itemEls');

const SIZE_MAP: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-[1.6rem] px-sm text-2xs gap-sm',
  md: 'h-[1.9rem] px-md text-xs gap-sm',
  lg: 'h-[2.3rem] px-md text-xs gap-sm',
};

const currentSizeClass = computed(() => SIZE_MAP[size] ?? SIZE_MAP.md);

const handleItemClick = (item: ContextMenuItem) => {
  if (item.disabled || item.checked) return;
  emit('select', item);
};

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

defineExpose({
  itemEls,
});
</script>
