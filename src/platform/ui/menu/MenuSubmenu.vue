<template>
  <BasePopover
    :panel-class
    :panel-scrollbar
    :disabled="item.disabled"
    :offset-distance="MENU_SUBMENU_OFFSET_DISTANCE"
    @open="emit('open')"
    block
    placement="right-start"
    ref="popoverRef"
    trigger="hover"
  >
    <template #trigger="{ isOpen: isSubOpen, pinToggle }">
      <!-- inheritAttrs:false + $attrs 重定向：级联项的「触发器本体」是这行 MenuRow（其根为真实 button），
           调用方的 class / data-* / aria-* 必须落在它上面；落在本组件的根（BasePopover）无效——
           那是 fragment 根（v-if 的触发包裹 div + Teleport 浮层），attrs 无法自动透传。 -->
      <MenuRow
        v-bind="$attrs"
        :item
        :size
        :expanded="isSubOpen"
        :ref="itemRefCb"
        @activate="handleTriggerClick(pinToggle)"
        has-popup
      >
        <template #trailing>
          <!-- 自定义内容项（如指板预览）是叶子：不渲染级联箭头，点击行为为选中 -->
          <BaseIcon
            v-if="!item.content"
            aria-hidden="true"
            class="-mr-0.5 shrink-0 opacity-50"
            icon-size="md"
            icon-stroke="bold"
            name="chevron-right"
          />
        </template>
      </MenuRow>
    </template>

    <template #default>
      <!-- content 优先：提供渲染函数时面板渲染自定义内容（如和弦指板 Canvas），否则渲染 children 列表 -->
      <component v-if="item.content" :is="item.content" />
      <MenuItems v-else :on-select :size :items="item.children" :model="item.model" :on-pick="item.onPick" />
    </template>
  </BasePopover>
</template>

<script setup lang="ts">
import { useTemplateRef } from 'vue';

import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import BasePopover from '@/platform/ui/popover/BasePopover.vue';
import { MENU_SUBMENU_OFFSET_DISTANCE } from '@/platform/utils/constants';

import MenuItems from './MenuItems.vue';
import MenuRow from './MenuRow.vue';

import type { MenuItem } from './types';
import type { ComponentSize } from '@/platform/types';

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  /** 级联菜单项（含 children 或 content） */
  item: MenuItem;
  /** 菜单尺寸档位 */
  size?: ComponentSize;
  /** 触发项 DOM 回调：父级用于收集键盘导航焦点项 */
  itemRefCb?: (el: unknown) => void;
  /** 级联子菜单面板样式类 */
  panelClass?: string;
  /** 面板是否用 v-scrollbar 自绘滚动条（透传 BasePopover） */
  panelScrollbar?: boolean;
  /** 选中回调：由子级菜单向上的 select 透传，交给容器处理 */
  onSelect?: (item: MenuItem) => void;
}>();

const emit = defineEmits<{
  /** 子面板打开：供父级 MenuItems 做级联兄弟互斥（关闭上一个打开的兄弟子面板） */
  (e: 'open'): void;
}>();

const popoverRef = useTemplateRef<InstanceType<typeof BasePopover>>('popoverRef');

/** 供父级互斥关闭：透传 BasePopover 的 close（幂等） */
defineExpose({ close: () => popoverRef.value?.close() });

/** 触发项点击：自定义内容项（content）视为叶子——点击即选中并关闭；
 *  普通级联项维持「点击钉住/再点关闭」的既有交互 */
const handleTriggerClick = (pinToggle: () => void) => {
  const { item } = props;
  if (item.disabled) return;
  if (item.content) {
    props.onSelect?.(item);
    return;
  }
  pinToggle();
};
</script>
