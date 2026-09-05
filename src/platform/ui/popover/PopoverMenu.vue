<script setup lang="ts">
import { useTemplateRef } from 'vue';

import type { Placement } from '@floating-ui/vue';

import ActionButton from '../button/ActionButton.vue';
import ContextMenuItems, { type ContextMenuItem } from '../context-menu/ContextMenuItems.vue';
import BaseIcon from '../icons/BaseIcon.vue';
import type { IconName } from '../icons/icons.registry.ts';
import BasePopover from './BasePopover.vue';

defineOptions({ name: 'PopoverMenu' });

/**
 * 带下拉菜单的图标按钮：收敛「BasePopover(hover) + ActionButton 触发器 + ContextMenuItems
 * 选中后执行 action 并按 keepOpen 决定是否关闭」的固定组合。
 * 打开态按钮自动切换 primary/subtle 主题；图标可用 #icon 插槽自定义（如随状态切换的图标）。
 */
const {
  items,
  ariaLabel = undefined,
  title = undefined,
  icon = undefined,
  iconClass = undefined,
  placement = 'bottom-end',
  trigger = 'hover',
  disabled = false,
} = defineProps<{
  /** 菜单项（支持 children 级联子菜单） */
  items: ContextMenuItem[];
  /** 触发按钮的无障碍标签 */
  ariaLabel?: string;
  /** 触发按钮的原生 title 提示 */
  title?: string;
  /** 触发按钮图标；需要动态图标/自定义内容时改用 #icon 插槽 */
  icon?: IconName;
  /** 图标配色类（如随主题切换的 text-color-*） */
  iconClass?: string;
  /** 浮层位置 */
  placement?: Placement;
  /** 触发方式 */
  trigger?: 'click' | 'hover';
  /** 禁用按钮与浮层 */
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'select', item: ContextMenuItem): void;
}>();

const popoverRef = useTemplateRef<InstanceType<typeof BasePopover>>('popoverRef');

/** 菜单项选中：向上派发 → 执行动作 → 非 keepOpen 项关闭浮层 */
const handleSelect = (item: ContextMenuItem) => {
  emit('select', item);
  item.action?.();
  if (!item.keepOpen) popoverRef.value?.close();
};
</script>

<template>
  <BasePopover :disabled :placement :trigger ref="popoverRef">
    <template #trigger="{ isOpen, pinToggle }">
      <ActionButton
        :aria-label
        :disabled
        :title
        :aria-expanded="isOpen"
        :aria-haspopup="items.length > 0 ? 'menu' : undefined"
        :color="isOpen ? 'primary' : 'default'"
        :variant="isOpen ? 'subtle' : 'ghost'"
        @click="pinToggle()"
        icon-only
      >
        <slot :is-open name="icon">
          <BaseIcon v-if="icon" :class="iconClass" :name="icon" icon-size="xl" icon-stroke="regular" />
        </slot>
      </ActionButton>
    </template>

    <template #default>
      <ContextMenuItems :items @select="handleSelect" />
    </template>
  </BasePopover>
</template>
