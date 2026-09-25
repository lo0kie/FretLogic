<template>
  <section data-collapse class="base-collapse w-full">
    <!-- inheritAttrs:false + $attrs 重定向：调用方的 class / data-* / aria-* 必须落在头部按钮本体——
         侧栏分组行等自定义折叠头要把拖拽把手类、键盘导航标记、状态 tint 挂在可聚焦元素上，
         这些无法经插槽表达；落到根 section 上则不参与焦点定位 -->
    <!-- 稳定钩子：data-collapse / data-collapse-head 供业务与平台工具（如 useStickyHeads）
         定位折叠段与头部，避免业务依赖组件内部类名（类名重构会静默脱钩）。
         静态属性写在 v-bind 之前，业务经 $attrs 传同名属性时可覆盖 -->
    <button
      v-wave
      v-bind="$attrs"
      :aria-expanded="expanded"
      :class="[
        // 底色内聚到组件：头部自带面板底色（--color-surface-panel）—— 吸附 / 覆盖时不会透出
        // 滚过的内容，业务不再各自下发（此前 5 个消费方各写一遍，且吸附态还得按
        // 「是否被顶在吸附线上」条件切换）。
        // 展开态叠主题 tint，由 noEmphasizeOnExpand 控制（默认叠）：tint 必须带 ! 才能压过
        // hover 基底（同工具类里 hover 变体在样式表靠后）。
        // 吸附（sticky / top / z）等**布局**属性仍由业务经 class 下发——折叠组件不假设宿主布局。
        // 焦点环走平台统一注入的顶层外扩环（标记 data-focusable-outline），不自绘：自绘要么用
        // ring（画在背景相位，被头部内带底色的子元素盖住），要么用覆盖子元素（得自己应付吸附贴边时
        // 被容器 overflow 裁掉上半圈）——顶层环本就是为这两件事建的，见 focusRingOverlay 模块头。
        'group/head relative flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-left transition-colors duration-fast ease-out outline-none select-none',
        'bg-surface-panel hover:bg-surface-panel-hover hover:delay-100',
        expanded && !noEmphasizeOnExpand ? 'bg-tint-panelhover-50!' : '',
      ]"
      :title="headTooltip"
      @click="expanded = !expanded"
      data-collapse-head
      data-focusable-outline
      ref="collapseHeadRef"
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
          class="shrink-0 text-fg-body"
        />
        <component v-else-if="props.icon" :icon-size="props.iconSize" :is="props.icon" class="shrink-0 text-fg-body" />
      </slot>
      <div class="min-w-0 flex-1">
        <slot name="title">
          <span class="flex items-center gap-1.5 truncate text-xs font-semibold tracking-wide text-fg-title">
            {{ title }}
          </span>
        </slot>
      </div>
      <slot name="trailing" />
      <!-- 标题右侧描述：贴行尾、紧邻 chevron。标题区是 flex-1（basis 0），收缩权重为 0，
           因此空间不足时先截断描述、标题始终完整（完整文本见头部原生 tooltip） -->
      <span
        v-if="description || $slots['description']"
        class="min-w-0 shrink truncate text-2xs font-normal text-fg-muted"
      >
        <slot name="description">{{ description }}</slot>
      </span>
      <BaseIcon
        :class="expanded ? 'rotate-0' : '-rotate-90'"
        class="shrink-0 text-fg-body transition-transform duration-base ease-out group-hover/head:text-fg-title"
        icon-size="md"
        name="chevron-down"
      />
    </button>

    <!-- 折叠体：由 v-auto-height 指令测量内容真实高度并写入 style.height（px），height 过渡也由指令注入。
         相比 CSS grid-template-rows 0fr↔1fr 技巧，它不但覆盖「收起↔展开」的轨道动画，
         还能在面板已展开时对内部内容高度变化（如空态↔列表）产生平滑动画。
         unpadded 时内容区不带默认内边距，间距由调用方内容自行控制（如侧栏分组网格自带 px-sm pt-md） -->
    <div
      v-auto-height="{ expanded, initialAuto: props.initialAuto, hold: props.bodyHold }"
      :aria-hidden="!expanded"
      :inert="!expanded ? true : undefined"
      class="overflow-hidden"
      ref="collapseBodyRef"
    >
      <!-- 内容元素单独取 ref：收起补偿要把它在盒内上移（盒下移 + 内容上移相抵），
           视窗里的内容才不会被换成段首那几行。位移目标必须是内容而非折叠体盒本身：
           盒是随 height 收缩的裁剪盒，动它会连带把裁剪边界上移 -->
      <div :class="unpadded ? '' : 'flex flex-col gap-2 p-2'" ref="collapseInnerRef">
        <slot />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from 'vue';

import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import { useCollapseScrollCompensation } from '@/platform/composables/useCollapseScrollCompensation';

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
    /** 行尾补充描述：小字、弱色，贴在折叠头右侧（chevron 左侧，trailing 槽之后）。
     *  默认渲染 description 文本，可用 #description 插槽自定义；空间不足时描述先截断，
     *  完整文本见头部原生 tooltip */
    description?: string;
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
    /** 高度挂起：展开态下折叠体不写 px、直接跟随内容高度（不播放高度过渡）。
     *  用于「内容正被分批补齐、高度尚未定型」的窗口——否则每一批补齐都会成为一次可见的
     *  渐次长高动画。收起态不受影响，仍正常收缩 */
    bodyHold?: boolean;
    /** 关闭展开时的主题强调 tint（默认开）。
     *  关掉的场景：宿主里「展开」本就由别处表达（如工作台面板、开发抽屉），
     *  再叠一层 tint 会与常驻底色形成无意义的两级 */
    noEmphasizeOnExpand?: boolean;
    /** 业务显式注入的滚动容器（收起时的滚动钳位补偿用）：业务本就知道自己的滚动容器，
     *  注入后免去找容器的开销；不传时由平台补偿逻辑沿祖先链查找 */
    scrollContainer?: HTMLElement | null;
  }>(),
  {
    title: undefined,
    description: undefined,
    icon: undefined,
    iconSize: 'md',
    iconStroke: 'regular',
    unpadded: false,
    initialAuto: false,
    bodyHold: false,
    noEmphasizeOnExpand: false,
    scrollContainer: null,
  }
);

defineSlots<{
  default(): unknown;
  /** 标题前导图标 */
  icon?(): unknown;
  /** 标题内容（缺省渲染 title 文本）；用于跑马灯等自定义标题结构 */
  title?(): unknown;
  /** 行尾描述（缺省渲染 description 文本） */
  description?(): unknown;
  /** 行尾附加内容（计数徽标等），渲染于内置 chevron 之前 */
  trailing?(): unknown;
}>();

/** 头部原生 tooltip：有描述时并入（描述被截断时可悬浮看全）；未传 title 时保持原样不下发 */
const headTooltip = computed(() =>
  props.title ? (props.description ? `${props.title} · ${props.description}` : props.title) : undefined
);

// ---------- 收起时的滚动位置补偿 ----------
// 折叠体收缩会同时让「吸附头的钉住位置」与「滚动容器的可滚动量上限」失真：前者表现为「刚点的
// 标题飞出视窗上方」，后者表现为浏览器逐帧强制钳位导致的闪现。两者都属于宿主环境适配（要找容器、
// 要跟过渡同步、要读吸附几何），已抽到平台 composable；组件只提供折叠头 / 折叠体 / 折叠体内容
// 三个元素与展开态，容器优先用业务注入的（业务本来就知道自己的滚动容器）。
// 头的归位只读本段几何（段与头的相对位置），头未吸附时差值恒为 0 —— 未吸附的折叠走同一条路径
// 自然无副作用，故不需要业务声明「我这个折叠头是吸附的」。
const collapseBodyRef = useTemplateRef<HTMLElement>('collapseBodyRef');
const collapseHeadRef = useTemplateRef<HTMLElement>('collapseHeadRef');
const collapseInnerRef = useTemplateRef<HTMLElement>('collapseInnerRef');

useCollapseScrollCompensation({
  bodyRef: collapseBodyRef,
  contentRef: collapseInnerRef,
  headRef: collapseHeadRef,
  expanded,
  containerRef: computed(() => props.scrollContainer),
});
</script>
