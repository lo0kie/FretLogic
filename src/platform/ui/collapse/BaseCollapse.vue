<template>
  <section class="base-collapse w-full" ref="rootRef">
    <!-- inheritAttrs:false + $attrs 重定向：调用方的 class / data-* / aria-* 必须落在头部按钮本体——
         侧栏分组行等自定义折叠头要把拖拽把手类、键盘导航标记、状态 tint 挂在可聚焦元素上，
         这些无法经插槽表达；落到根 section 上则不参与焦点定位 -->
    <button
      v-wave
      v-bind="$attrs"
      :aria-expanded="expanded"
      :class="[
        'group/head flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-left transition-colors duration-fast ease-out outline-none select-none hover:bg-surface-panel-hover hover:delay-100 focus-visible:ring-2 focus-visible:ring-primary/60',
        // 吸附态需自铺底色遮挡下方滚过的内容，故仅适用于底色同为 surface-panel 的面板
        sticky ? 'sticky z-panel bg-surface-panel' : '',
      ]"
      :style="stickyStyle"
      :title="headTooltip"
      @click="expanded = !expanded"
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
      ref="collapseBodyRef"
    >
      <div :class="unpadded ? '' : 'flex flex-col gap-3 px-3 py-1.5'">
        <slot />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';

import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import { COLLAPSE_SCROLL_COMPENSATION_MAX_MS } from '@/platform/utils/constants';

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
    /** 折叠头吸附在最近滚动容器顶部：长内容滚动时标题不随内容滚走。
     *  吸附期间头部自铺 bg-surface-panel 底色遮挡下方内容，故仅适用于面板底色同为
     *  surface-panel 的场景 */
    sticky?: boolean;
    /** 吸附偏移（CSS 长度，默认 '0px'）：上方另有常驻粘性头部时用它让位，可为负值。
     *  基准是容器**可视上沿**（已补偿容器 padding-top，见下方吸附补偿说明） */
    stickyOffset?: string;
  }>(),
  {
    title: undefined,
    description: undefined,
    icon: undefined,
    iconSize: 'md',
    iconStroke: 'regular',
    unpadded: false,
    initialAuto: false,
    sticky: false,
    stickyOffset: '0px',
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

// ---------- 收起时的滚动钳位补偿 ----------
// 折叠体收缩会同步缩小祖先滚动容器的可滚动量（scrollHeight - clientHeight）。浏览器的滚动
// 钳位在过渡期间的每一帧布局后都会同步执行：只要 scrollTop 越界就瞬时拉回，没有动画——
// 这个动作被压缩进 height 过渡曲线的高速中段，感知为闪现。
// 原方案「预判收起后上限 + scrollTo(smooth)」防住了触发时刻的钳位，却防不住过渡过程中的
// 逐帧钳位：原生平滑滚动与 CSS height 过渡两条时间线互不感知，smooth 启动阶段缓动位移极少，
// 强制钳位总是先一步介入。
// 现方案：rAF 逐帧读取实时 scrollHeight（随 height 过渡逐帧变化），每一帧抢先于浏览器钳位
// 把 scrollTop 收紧到当前上限——补偿与高度过渡同源同步，逐帧微调视觉上平滑跟随收起节奏，
// 钳位条件（scrollTop + clientHeight > scrollHeight）永远没有成立的机会。
const rootRef = useTemplateRef<HTMLElement>('rootRef');
const collapseBodyRef = useTemplateRef<HTMLElement>('collapseBodyRef');

/** 沿祖先链向上找最近的纵向滚动容器（v-scrollbar 注入的内联 overflowY 同样命中） */
const findScrollParent = (): HTMLElement | null => {
  let el = rootRef.value?.parentElement ?? null;
  while (el && el !== document.body && el !== document.documentElement) {
    const overflowY = window.getComputedStyle(el).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') return el;
    el = el.parentElement;
  }
  return null;
};

// ---------- 吸附：补偿滚动容器的顶部 padding ----------
// sticky 的坐标以滚动容器的**内容盒**为原点（容器的内边距同样约束粘性盒，它不会上移进 padding 带）。
// 于是裸的 top: 0 实际吸附在「内容盒顶」：容器若有 padding-top，那条 padding 带会一直露着正在滚出的
// 内容——标题遮住了它下方的内容，头顶那一条却漏着。测量容器 padding-top 并从吸附线里减掉，头部才
// 真正贴住可视上沿（容器无 padding-top 时结果与裸 top 一致）。
const stickyInsetTop = ref(0);

const measureStickyInset = () => {
  if (!props.sticky) return;
  const container = findScrollParent();
  stickyInsetTop.value = container ? Number.parseFloat(window.getComputedStyle(container).paddingTop) || 0 : 0;
};

onMounted(measureStickyInset);
watch(() => props.sticky, measureStickyInset);

/** 仅在开启 sticky 时下发 top 偏移，未开启则完全不写 style（避免与 $attrs 里的 style 相扰） */
const stickyStyle = computed(() =>
  props.sticky ? { top: `calc(${props.stickyOffset} - ${stickyInsetTop.value}px)` } : undefined
);

// 逐帧循环句柄提升到组件作用域：收起途中被重新展开、或组件卸载时都能正确取消上一轮
let compensationRafId: number | null = null;
let compensationCleanup: (() => void) | null = null;

const stopScrollCompensation = () => {
  if (compensationRafId !== null) cancelAnimationFrame(compensationRafId);
  compensationRafId = null;
  compensationCleanup?.();
  compensationCleanup = null;
};

onBeforeUnmount(stopScrollCompensation);

watch(expanded, (open, prevOpen) => {
  // 展开方向无需补偿；收起途中被重新展开时停掉仍在运行的上一轮循环
  if (!prevOpen || open) {
    stopScrollCompensation();
    return;
  }
  const container = findScrollParent();
  const collapseBody = collapseBodyRef.value;
  if (!container || !collapseBody) return;
  const { scrollTop, scrollHeight, clientHeight } = container;
  if (scrollTop <= 0) return;
  // 预判量仅用作「是否需要补偿」的门槛（watch 先于渲染冲刷，量到的是收起前状态）：
  // 收起后的可滚动上限若仍不小于当前 scrollTop，全程不会触发钳位，无需启动逐帧循环
  const maxScrollAfter = Math.max(0, scrollHeight - collapseBody.offsetHeight - clientHeight);
  if (scrollTop <= maxScrollAfter) return;

  stopScrollCompensation(); // 兜底：清掉可能残留的上一轮循环

  // height 实际过渡的元素就是 collapseBody 本体（transition-[height] 挂在其上），在其上监听收尾；
  // 同元素若有其他属性过渡（opacity 等）会多次触发 transitionend，按 propertyName 过滤
  const handleTransitionEnd = (e: TransitionEvent) => {
    if (e.target !== collapseBody || e.propertyName !== 'height') return;
    // 末帧布局与最后一次 rAF 之间可能还差 ≤1px，收尾补一次钳位再停
    const liveMax = Math.max(0, container.scrollHeight - container.clientHeight);
    if (container.scrollTop > liveMax) container.scrollTop = liveMax;
    stopScrollCompensation();
  };
  collapseBody.addEventListener('transitionend', handleTransitionEnd);
  compensationCleanup = () => collapseBody.removeEventListener('transitionend', handleTransitionEnd);

  const startedAt = performance.now();
  const tick = () => {
    compensationRafId = null;
    const liveMax = Math.max(0, container.scrollHeight - container.clientHeight);
    if (container.scrollTop > liveMax) container.scrollTop = liveMax;
    // 兜底上限：过渡被禁用（如 prefers-reduced-motion）时 transitionend 永不触发，循环不能无限空转
    if (performance.now() - startedAt >= COLLAPSE_SCROLL_COMPENSATION_MAX_MS) {
      stopScrollCompensation();
      return;
    }
    compensationRafId = requestAnimationFrame(tick);
  };
  compensationRafId = requestAnimationFrame(tick);
});
</script>
