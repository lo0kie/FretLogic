<template>
  <!-- 状态类 ARIA 属性只在该状态存在时才下发：Vue 会把 `false` 渲成 aria-checked="false" /
       aria-expanded="false"，而这两个属性是「可勾选 / 有子菜单」的形态声明——普通菜单项与每个
       叶子行带上它，等于对读屏器谎报形态（读屏会把一行普通项念成可展开项）。
       aria-expanded 与服务端同源的 hasPopup 取同一个闸（两者都由级联触发器 MenuSubmenu 下发）。 -->
  <button
    v-wave="{ disabled: item.disabled }"
    :aria-checked="item.checked ?? undefined"
    :aria-disabled="item.disabled"
    :aria-expanded="hasPopup ? expanded : undefined"
    :aria-haspopup="hasPopup || undefined"
    :class="[menuRowSizeClass(size), stateClasses]"
    :disabled="item.disabled"
    :role="item.checked !== undefined ? 'menuitemradio' : 'menuitem'"
    :style="getItemStyle(item)"
    :tabindex="item.disabled ? -1 : 0"
    :title="item.title ?? item.label"
    @click.stop="emit('activate')"
    @keydown.enter.prevent.stop="emit('activate')"
    @keydown.space.prevent.stop="emit('activate')"
    @mousedown="item.disabled && $event.preventDefault()"
    data-focusable-outline
    class="group relative flex w-full cursor-pointer items-center rounded-md border-none bg-transparent text-left transition-colors duration-fast outline-none select-none enabled:hover:bg-(--item-hover-bg,var(--bg-panel-hover)) enabled:focus-visible:bg-(--item-hover-bg,var(--bg-panel-hover)) disabled:cursor-not-allowed disabled:text-fg-disabled disabled:hover:bg-transparent"
    ref="rootRef"
    type="button"
  >
    <slot name="leading">
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
    </slot>

    <span class="min-w-0 flex-1 whitespace-nowrap"> {{ item.label }} </span>

    <slot name="trailing" />
  </button>
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from 'vue';

import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';

import { getItemStyle, menuRowSizeClass } from './menuRowStyle';

import type { MenuItem } from './types';
import type { ComponentSize } from '@/platform/types';

/**
 * 菜单行壳：菜单项（MenuItems）与级联子菜单触发器（MenuSubmenu）共用的一行。
 *
 * 抽出来的动因：两处原先各写一份**逐字相同**的行壳类串、尺寸映射、`getItemStyle` 注入、
 * 三段图标分支、禁用处理与 `@mousedown` 兜底 —— 任何一处改（例如禁用态透明度）都要改两遍。
 *
 * 行的**状态呈现**由本组件负责（勾选/危险态/自定义色的底色与文字色、展开态底色），
 * 行的**内容与行为**留在消费方：前后槽位走插槽，激活（点击/回车/空格）只派发 `activate`。
 * 注意 `@keydown.enter/space` 必须带 `.prevent`：按钮原生会在 Enter 上再派发一次 click，
 * 不拦住就是「一键两事」。
 */
const {
  item,
  size = 'md',
  expanded = false,
  hasPopup = false,
} = defineProps<{
  /** 菜单项数据（label / icon / checked / checkPosition / shortcut / danger / color / disabled / title） */
  item: MenuItem;
  /** 尺寸档位，决定行高与字号 */
  size?: ComponentSize;
  /** 级联子菜单触发器：面板展开中 */
  expanded?: boolean;
  /** 级联子菜单触发器：下发 aria-haspopup */
  hasPopup?: boolean;
}>();

const emit = defineEmits<{ (e: 'activate'): void }>();

/** 行状态类：勾选底色随危险态换色；自定义 color 项只补字重（底色由 getItemStyle 内联给）；
 *  级联子菜单触发器展开时以面板悬停色标示（子菜单行的 checked 恒为 undefined，故与此分支不冲突） */
const stateClasses = computed(() => {
  const open = expanded ? 'bg-surface-panel-hover' : '';
  if (item.danger)
    return item.checked
      ? 'bg-tint-danger-88! font-semibold text-danger!'
      : [open, 'text-danger', open ? '' : 'enabled:hover:bg-tint-danger-88! enabled:focus-visible:bg-tint-danger-88!'];
  if (item.color) return [open, item.checked ? 'font-semibold' : ''];
  if (item.checked) return 'bg-tint-primary-88! font-semibold text-primary!';
  return [open, 'text-fg-title'];
});

const rootRef = useTemplateRef<HTMLElement>('rootRef');
/** 暴露根按钮元素：菜单的键盘导航要拿它 focus()，函数式 ref 到手的是本组件实例而非元素 */
defineExpose({ root: rootRef });
</script>
