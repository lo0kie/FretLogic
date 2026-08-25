<template>
  <div class="menu-items-wrapper">
    <template v-if="title">
      <div class="menu-title">
        {{ title }}
      </div>
      <div class="menu-divider" role="separator" />
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
      class="menu-item"
      :class="[
        `size-${size}`,
        item.danger ? 'is-danger' : 'is-normal',
        item.disabled ? 'is-disabled' : '',
        item.checked ? 'is-checked' : '',
      ]"
      :style="getItemStyle(item)"
      :title="item.title"
      @mousedown="item.disabled && $event.preventDefault()"
      @click.stop="handleItemClick(item)"
      @keydown.enter.prevent.stop="handleItemClick(item)"
      @keydown.space.prevent.stop="handleItemClick(item)"
    >
      <!-- 如果处于选中态，Check 优先渲染，覆盖左侧默认 icon -->
      <Check v-if="item.checked" :size="13" :stroke-width="2.5" class="menu-item-icon" aria-hidden="true" />
      <component
        :is="item.icon"
        v-else-if="item.icon"
        :size="13"
        :stroke-width="2.5"
        class="menu-item-icon"
        aria-hidden="true"
      />

      <span class="menu-item-label">{{ item.label }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { HEIGHT_LG, HEIGHT_MD, HEIGHT_SM } from '@/utils/constants';
import { Check } from '@lucide/vue';
import type { CSSProperties, FunctionalComponent } from 'vue';
import { useTemplateRef } from 'vue';

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

withDefaults(
  defineProps<{
    items?: ContextMenuItem[];
    title?: string;
    size?: 'sm' | 'md' | 'lg';
  }>(),
  {
    items: () => [],
    title: '',
    size: 'md',
  }
);

const emit = defineEmits<{
  (e: 'select', item: ContextMenuItem): void;
}>();

const itemEls = useTemplateRef<HTMLButtonElement[]>('itemEls');

const handleItemClick = (item: ContextMenuItem) => {
  if (item.disabled || item.checked) return;
  emit('select', item);
};

// 提取样式计算逻辑
const getItemStyle = (item: ContextMenuItem): CSSProperties | undefined => {
  if (!item.color || item.disabled) return undefined;

  return {
    '--item-color': item.color,
    '--item-bg-hover': `color-mix(in srgb, ${item.color} 12%, transparent)`,
    '--item-bg-checked': `color-mix(in srgb, ${item.color} 18%, transparent)`,
  } as CSSProperties;
};

defineExpose({
  itemEls,
});
</script>

<style scoped lang="scss">
.menu-items-wrapper {
  padding: $space-xs;
  display: flex;
  flex-direction: column;
  gap: $space-xs;
  box-sizing: border-box;
}

.menu-title {
  padding: $space-xs $space-md $space-xs;
  font-size: $fs-2xs;
  font-weight: 600;
  color: var(--text-disabled);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: none;
}

.menu-divider {
  height: 1px;
  background-color: var(--border-light);
  margin: $space-2xs $space-xs $space-xs;
}

.menu-item {
  display: flex;
  align-items: center;
  border-radius: $radius-md;
  border: none;
  background-color: transparent;
  width: 100%;
  text-align: left;
  box-sizing: border-box;
  transition:
    background-color $duration-fast ease,
    color $duration-fast ease;
  position: relative;
  user-select: none;
  cursor: pointer;

  &.size-sm {
    height: v-bind('HEIGHT_SM');
    padding: 0 $space-sm;
    font-size: $fs-2xs;
    gap: $space-sm;
  }

  &.size-md {
    height: v-bind('HEIGHT_MD');
    padding: 0 $space-md;
    font-size: $fs-xs;
    gap: $space-sm;
  }

  &.size-lg {
    height: v-bind('HEIGHT_LG');
    padding: 0 $space-md;
    font-size: $fs-xs;
    gap: $space-sm;
  }

  .menu-item-icon {
    flex-shrink: 0;
    color: var(--item-color, inherit);
    opacity: 0.85;
    transition: opacity $duration-fast ease;
  }

  .menu-item-label {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
  }

  &.is-normal {
    color: var(--item-color, var(--text-title));

    &:not(.is-disabled):hover {
      /* 修复: var(--bg-hover) -> var(--bg-panel-hover) */
      background-color: var(--item-bg-hover, var(--bg-panel-hover));

      .menu-item-icon {
        opacity: 1;
      }
    }

    &.is-checked {
      background-color: var(--item-bg-checked, color-mix(in srgb, var(--color-primary) 10%, transparent));
      color: var(--item-color, var(--color-primary));
      font-weight: 600;

      .menu-item-icon {
        opacity: 1;
      }
    }
  }

  &.is-danger {
    color: var(--item-color, var(--color-danger));

    .menu-item-icon {
      color: var(--item-color, var(--color-danger));
    }

    &:not(.is-disabled):hover {
      background-color: var(--item-bg-hover, color-mix(in srgb, var(--color-danger) 10%, transparent));

      .menu-item-icon {
        opacity: 1;
      }
    }

    &.is-checked {
      background-color: var(--item-bg-checked, color-mix(in srgb, var(--color-danger) 12%, transparent));
      font-weight: 600;
    }
  }

  &.is-disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
}
</style>
