<template>
  <BasePopover
    :panel-class
    :panel-scrollbar
    :disabled="item.disabled"
    :offset-distance="MENU_SUBMENU_OFFSET_DISTANCE"
    @close="emit('close')"
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
        :ref="setTriggerRow"
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
      <!-- content 优先：提供渲染函数时面板渲染自定义内容（如和弦指板 Canvas），否则由 #children 插槽渲染子列表。
           子列表**不在这里 import MenuItems**：那会与 MenuItems → MenuSubmenu 形成静态环。
           由宿主（MenuItems）经插槽自引用递归渲染，环即解开，且不引入异步组件与额外 chunk。 -->
      <!-- display:contents 包裹层只用来接子面板内的键盘事件（← 返回上一级）：它不产生盒子，
           对面板布局与滚动零影响（与 BaseMenu 右键分支的包裹层同一手法）。 -->
      <div @keydown="handlePanelKeydown($event)" class="contents" ref="panelRef">
        <component v-if="item.content" :is="item.content" />
        <slot v-else :item name="children" />
      </div>
    </template>
  </BasePopover>
</template>

<script setup lang="ts">
import { nextTick, ref, useTemplateRef } from 'vue';

import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import BasePopover from '@/platform/ui/popover/BasePopover.vue';
import { MENU_SUBMENU_OFFSET_DISTANCE } from '@/platform/utils/constants';
import { FOCUSABLE_SELECTOR } from '@/platform/utils/dom';

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
  /**
   * 子面板收起：供父级复位互斥游标并释放滚动守卫。
   * 收起不止「父级主动关」一条路径 —— 点选、外部点击、Esc、← 键都由 BasePopover 自行关闭，
   * 不转发这条事件父级就永远不知道子面板已经没了（守卫与游标会一直挂着）。
   */
  (e: 'close'): void;
}>();

const popoverRef = useTemplateRef<InstanceType<typeof BasePopover>>('popoverRef');
/** 子面板内容根（含插槽渲染的子列表）：找首个可用项、以及接面板内的键盘事件 */
const panelRef = useTemplateRef<HTMLElement>('panelRef');
/** 触发器行根元素（MenuRow 暴露的 root）：← 返回上一级时归还焦点 */
const triggerRowEl = ref<HTMLButtonElement | null>(null);

/** 包装父级传入的 itemRefCb：既照旧上抛给父级收集键盘导航项，也留一份本地引用供焦点归还 */
const setTriggerRow = (el: unknown) => {
  const node = el && typeof el === 'object' && 'root' in el ? (el as { root?: HTMLElement }).root : el;
  triggerRowEl.value = node instanceof HTMLButtonElement ? node : null;
  props.itemRefCb?.(el);
};

/**
 * 展开本层子面板并把焦点交给面板内首个可用项（供父级 MenuItems 的 → 键入口调用）。
 *
 * 必须等两拍：BasePopover 的 watcher 自身也在 `await nextTick()` 之后才置 isShown，
 * 面板要到再下一拍才渲染出来 —— 只等一拍会拿到空的 panelRef（BaseMenu 的自动聚焦此前就栽在这里）。
 */
const openAndFocusFirst = async () => {
  popoverRef.value?.open();
  await nextTick();
  await nextTick();
  panelRef.value?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
};

/** 子面板内 ←：收起本层并把焦点还给触发器行（→ 进入由父级 MenuItems 处理） */
const handlePanelKeydown = (e: KeyboardEvent) => {
  if (e.key !== 'ArrowLeft') return;
  e.preventDefault();
  e.stopPropagation();
  popoverRef.value?.close();
  triggerRowEl.value?.focus();
};

/** 供父级互斥关闭与 → 键进入：透传 BasePopover 的 close（幂等） */
defineExpose({ close: () => popoverRef.value?.close(), openAndFocusFirst });

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
