<template>
  <section class="base-collapse w-full">
    <!-- inheritAttrs:false + $attrs 重定向：调用方的 class / data-* / aria-* 必须落在头部按钮本体——
         侧栏分组行等自定义折叠头要把拖拽把手类、键盘导航标记、状态 tint 挂在可聚焦元素上，
         这些无法经插槽表达；落到根 section 上则不参与焦点定位 -->
    <button
      v-wave
      v-bind="$attrs"
      :aria-expanded="expanded"
      :title="props.title"
      @click="expanded = !expanded"
      class="group/head flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-left transition-colors duration-fast ease-out outline-none select-none hover:bg-surface-panel-hover focus-visible:ring-2 focus-visible:ring-primary/60"
      type="button"
    >
      <!-- 传入 #icon 插槽时优先使用插槽内容（Vue 插槽默认内容的天然规则）；
           未提供插槽才回退到下方解析 icon prop 渲染前导图标 -->
      <slot name="icon">
        <BaseIcon
          v-if="typeof props.icon === 'string'"
          :icon-stroke
          :icon-size="props.iconSize"
          :name="props.icon"
          class="text-fg-secondary shrink-0"
        />
        <component
          v-else-if="props.icon"
          :icon-size="props.iconSize"
          :is="props.icon"
          class="text-fg-secondary shrink-0"
        />
      </slot>
      <div class="min-w-0 flex-1">
        <slot name="title">
          <span class="flex items-center gap-1.5 truncate text-xs font-semibold tracking-wide text-fg-title">
            {{ title }}
          </span>
        </slot>
      </div>
      <slot name="trailing" />
      <BaseIcon
        :class="expanded ? 'rotate-0' : '-rotate-90'"
        class="text-fg-secondary shrink-0 transition-transform duration-base ease-out group-hover/head:text-fg-title"
        icon-size="md"
        name="chevron-down"
      />
    </button>

    <!-- 折叠体：由 v-auto-height 指令测量内容真实高度并写入 style.height（px），配合 transition-[height]
         平滑过渡。相比 CSS grid-template-rows 0fr↔1fr 技巧，它不但覆盖「收起↔展开」的轨道动画，
         还能在面板已展开时对内部内容高度变化（如空态↔列表）产生平滑动画。
         unpadded 时内容区不带默认内边距，间距由调用方内容自行控制（如侧栏分组网格自带 px-sm pt-md） -->
    <div
      v-auto-height="{ expanded, initialAuto: props.initialAuto }"
      :aria-hidden="!expanded"
      :inert="!expanded ? true : undefined"
      class="overflow-hidden transition-[height] duration-base ease-standard"
    >
      <div :class="unpadded ? '' : 'flex flex-col gap-3 px-3 py-1.5'">
        <slot />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';

import type { IconName } from '@/platform/ui/icons/icons.registry';
import type { IconSizeValue, IconStrokeValue } from '@/platform/ui/icons/iconSizes';
import type { Component } from 'vue';

// attrs 重定向到头部按钮：调用方的 class / data-* / aria-* 需落在真实可聚焦的行元素上
// （拖拽把手、键盘导航标记、状态 tint 等），落在根 section 上无法参与焦点定位与交互
defineOptions({ name: 'BaseCollapse', inheritAttrs: false });

/**
 * 是否展开。受控模式：`v-model:expanded` 绑定即可，由父级决定展开态；
 * 未绑定时内部自持状态。配合排他手风琴（至多一个展开）由父级约束。
 */
const expanded = defineModel<boolean>('expanded', { default: false });

const props = withDefaults(
  defineProps<{
    /** 分组标题 */
    title?: string;
    /** 标题前导图标；支持图标名称字符串或图标组件（传组件时该组件须支持
     *  项目标准图标尺寸档位 `icon-size` prop，如 'sm'，否则尺寸档位静默不生效） */
    icon?: IconName | Component;
    /** 前导图标尺寸，透传给内部 BaseIcon；缺省 'md' 档位 */
    iconSize?: IconSizeValue;
    /** 前导图标描边粗细，透传给内部 BaseIcon（针对 Lucide 等描边类图标） */
    iconStroke?: IconStrokeValue;
    /** 内容区不留默认内边距（px-3 py-1.5）：内容自带间距时开启，避免双层 padding（如侧栏分组网格） */
    unpadded?: boolean;
    /** 挂载即展开时初始高度直接采用 auto 而非 0→N 展开动画：
     *  用于容器整体展开（如设置弹层首次打开）时默认展开的分组无需播放首帧高度过渡 */
    initialAuto?: boolean;
  }>(),
  {
    title: undefined,
    icon: undefined,
    iconSize: 'md',
    iconStroke: 'regular',
    unpadded: false,
    initialAuto: false,
  }
);

defineSlots<{
  default(): unknown;
  /** 标题前导图标 */
  icon?(): unknown;
  /** 标题内容（缺省渲染 title 文本）；用于跑马灯等自定义标题结构 */
  title?(): unknown;
  /** 行尾附加内容（计数徽标等），渲染于内置 chevron 之前 */
  trailing?(): unknown;
}>();
</script>
