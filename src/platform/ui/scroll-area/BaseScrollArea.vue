<template>
  <component
    v-edge-fade="fadeBinding"
    v-scrollbar="scrollbarBinding"
    v-wheel-scroll="wheelBinding"
    :is="tag"
    @scroll="handleScroll()"
    ref="rootRef"
  >
    <slot />
  </component>
</template>

<script setup lang="ts">
/**
 * BaseScrollArea 滚动容器原语：把「可滚动区域」这件基础能力收成一处，业务层不再手拼
 * overflow-* / no-scrollbar + v-edge-fade + v-scrollbar + onScroll: 按锚点关闭浮层 这套组合。
 *
 * 内聚的能力：
 * - overflow 与原生滚动条隐藏：由 v-scrollbar 指令注入（enabled:false 被动模式同样注入），本组件不手写；
 * - 边缘羽化（v-edge-fade）：单轴时显式定向，双轴时交回指令按溢出自动判定；
 * - 自绘滚动条（v-scrollbar）：单轴时显式定向；
 * - 可选滚轮接管（v-wheel-scroll）：横向列表用 smooth / double / triple / overscroll 等档位；
 * - 可选「滚动即关闭浮层」（closePopovers）：内容区滚动时收起**锚点在区内**的下拉与右键菜单；
 *
 * 注意：浮层（BasePopover 面板）内部的滚动容器必须保持 closePopovers 关闭，
 * 否则滚动面板会把自己的浮层一起关掉。
 *
 * 根元素即滚动容器本身：消费方传的 class / style / 原生事件 / 指令（v-grid-nav、v-auto-height…）
 * 都经 attrs 落到本元素上，故替换原来的裸容器 div 时 DOM 结构不变。
 *
 * 模板硬约束（勿破）：<template> 的第一个节点必须是根元素，**禁止在根元素之前写模板注释**。
 * SFC 模板注释在 dev 下会保留 → 编译产物由「单个元素」变成「根片段（注释 + 元素）」，
 * 即 PatchFlags.DEV_ROOT_FRAGMENT。Vue 只在 renderComponentRoot 里把它解包一次用于 attrs 继承，
 * instance.subTree 拿到手的仍是 Fragment；而 <Transition> 的过渡钩子沿组件根递归下发
 * （setTransitionHooks 见 runtime-core），落到 Fragment 上后 unmount 只对元素节点
 * （vnode.shapeFlag & 1）调用 leave —— 钩子永不触发。后果：<Transition mode="out-in"> 的
 * state.isLeaving 永远卡在 true，宿主此后恒渲染 emptyPlaceholder，整块内容空白
 * （回归现场：乐谱页 ScoreInteractiveArea 以本组件为根，切 tab 后主内容区全空）。
 */
import { computed, onBeforeUnmount, onMounted, reactive, useTemplateRef } from 'vue';

import { useRafThrottle } from '@/platform/composables/useRafThrottle';
import { closePopoversWithin } from '@/platform/ui/popover/popoverRegistry';

import type { EdgeFadeBinding } from '@/platform/directives/vEdgeFade';
import type { ScrollbarBinding } from '@/platform/directives/vScrollbar';
import type { WheelScrollOptions } from '@/platform/directives/vWheelScroll';
import type {
  ScrollAreaAxis,
  ScrollAreaFade,
  ScrollAreaScrollbar,
  ScrollAreaState,
  ScrollAreaWheel,
} from '@/platform/ui/scroll-area/scrollAreaHandle';

const props = withDefaults(
  defineProps<{
    /** 渲染标签：默认 div；列表语义场景可传 'ul' 等 */
    tag?: string;
    /** 生效轴向：'y' 纵向（默认）| 'x' 横向 | 'both' 双轴 */
    axis?: ScrollAreaAxis;
    /** 边缘羽化：true（默认，按 axis 定向）/ false 关闭 / 数值·CSS 长度·选项对象透传 v-edge-fade */
    fade?: ScrollAreaFade;
    /** 自绘滚动条：true（默认，按 axis 定向）/ false 关闭 / 选项对象透传 v-scrollbar
     *  （含滚动气泡提示，如 :scrollbar="{ bubble: true }" 或 { bubble: { format } }） */
    scrollbar?: ScrollAreaScrollbar;
    /** 滚轮接管：false（默认，原生滚动）/ true 默认档 / 选项对象透传 v-wheel-scroll
     *  （smooth / double / triple / overscroll / disabled 等；修饰符穿不过组件，翻倍走 { double: true }、三倍走 { triple: true }） */
    wheel?: ScrollAreaWheel;
    /** 滚动时是否关闭全部打开中浮层；默认 false（浮层内部滚动容器必须保持关闭） */
    closePopovers?: boolean;
  }>(),
  {
    tag: 'div',
    axis: 'y',
    fade: true,
    scrollbar: true,
    wheel: false,
    closePopovers: false,
  }
);

const rootRef = useTemplateRef<HTMLElement>('rootRef');

/** 单轴时把方向显式下发给指令；双轴留空 → 指令按溢出自动判定（与手写无修饰符写法等价） */
const axisDirection = computed(() => (props.axis === 'both' ? undefined : props.axis));

// overflow 工具类与 no-scrollbar 均不在此手写：v-scrollbar 指令（含 enabled:false 被动模式）
// 统一注入对应轴的 overflow 并隐藏原生滚动条，滚动基建由指令单点托管

const fadeBinding = computed<EdgeFadeBinding>(() => {
  const value = props.fade;
  if (value === false) return false;
  if (value === true) return { direction: axisDirection.value };
  if (typeof value === 'number' || typeof value === 'string') {
    return { size: value, direction: axisDirection.value };
  }
  // 选项对象里显式写了 direction 时以它为准
  return { ...value, direction: value.direction ?? axisDirection.value };
});

const scrollbarBinding = computed<ScrollbarBinding>(() => {
  const value = props.scrollbar;
  // false：指令保持常驻模板但整体惰性（不注入样式、不挂 overlay），避免用 v-if 双分支切换指令挂载
  if (value === false) return { enabled: false };
  if (value === true) return { direction: axisDirection.value };
  return { ...value, direction: value.direction ?? axisDirection.value };
});

const wheelBinding = computed<WheelScrollOptions>(() => {
  const value = props.wheel;
  if (value === true) return { disabled: false };
  if (value === false) return { disabled: true };
  return value;
});

// ===== 响应式滚动状态：宿主经句柄消费，免去各自手写 scroll 监听与尺寸测量 =====
const scrollState = reactive<ScrollAreaState>({
  scrollLeft: 0,
  scrollTop: 0,
  scrollWidth: 0,
  scrollHeight: 0,
  clientWidth: 0,
  clientHeight: 0,
  scrollableX: 0,
  scrollableY: 0,
});

/** 从真实元素回读一次滚动与尺寸快照（可滚动距离随快照一并派生） */
const sync = () => {
  const el = rootRef.value;
  if (!el) return;
  scrollState.scrollLeft = el.scrollLeft;
  scrollState.scrollTop = el.scrollTop;
  scrollState.scrollWidth = el.scrollWidth;
  scrollState.scrollHeight = el.scrollHeight;
  scrollState.clientWidth = el.clientWidth;
  scrollState.clientHeight = el.clientHeight;
  scrollState.scrollableX = Math.max(0, el.scrollWidth - el.clientWidth);
  scrollState.scrollableY = Math.max(0, el.scrollHeight - el.clientHeight);
};

/**
 * 滚动即收起浮层 —— 只收「锚点在本滚动容器内」的那些。
 *
 * 无差别 closeAllPopovers 会连带收掉锚点在容器外的浮层（侧边栏顶部的排序/筛选菜单就锚在
 * 工具栏上，与滚动区平级），内容滚动并不会让它们错位，却被一起关掉。见 popoverRegistry 的说明。
 *
 * 按帧合帧：一次处理要读 6 个布局属性并写 8 个 reactive 字段，还要遍历浮层注册表逐个读 rect；
 * 动量滚动下同一帧可派发多次 scroll，合并后每帧至多一次。代价是状态刷新与「滚动收起浮层」
 * 最晚晚一帧生效——视觉上仍是滚一下就收。
 *
 * 尺寸 / 子节点观察者走同一份帧（见 scheduleMeasureSync）：RO / MO 回调里就地 sync 的代价与
 * scroll 路径完全相同，而且更糟——sync 写的是 reactive 字段，写回引发重渲染又可能改尺寸，
 * 于是「回调 → 写状态 → 重渲染 → 再回调」自我驱动循环；折叠动画期间子元素每帧改尺寸时，
 * 更是每帧一次全量重测。合并到帧末后同一帧内至多跑一次。
 */
// 「本帧内发生过滚动」标记：滚动要收浮层，单纯改尺寸不要（锚点未错位，收了是误伤）。
// 不用给 schedule 传载荷，是因为载荷会被后来的调用覆盖——同帧内先滚动、后改尺寸就会丢掉
// 这次滚动，标记法保证「本帧只要滚过就一定收」。
let popoversNeedClose = false;

const { schedule: scheduleScrollSync } = useRafThrottle(() => {
  sync();
  if (popoversNeedClose) {
    popoversNeedClose = false;
    if (props.closePopovers) closePopoversWithin(rootRef.value);
  }
});

const handleScroll = () => {
  popoversNeedClose = true;
  scheduleScrollSync();
};

/** 尺寸 / 子节点变化触发的重测与 scroll 合并到同一帧，但不请求收起浮层 */
const scheduleMeasureSync = () => scheduleScrollSync();

// 滚动与容器尺寸变化抓不到「仅内容尺寸变化」（列表项增删/子元素缩放，scroll 距离变了但容器不变）：
// 用「直接子元素 ResizeObserver + childList MutationObserver」补齐，可滚动距离变化始终能被宿主 watch 到
let containerObserver: ResizeObserver | null = null;
let childrenObserver: ResizeObserver | null = null;
let childrenMutationObserver: MutationObserver | null = null;

/** 重建子元素观察：先断开全部再逐个观察当前直接子元素（增删后全量重挂，避免悬挂旧节点） */
const observeChildren = () => {
  const el = rootRef.value;
  if (!el || !childrenObserver) return;
  childrenObserver.disconnect();
  for (const child of el.children) {
    childrenObserver.observe(child);
  }
};

onMounted(() => {
  const el = rootRef.value;
  if (!el) return;
  sync();
  containerObserver = new ResizeObserver(scheduleMeasureSync);
  containerObserver.observe(el);
  childrenObserver = new ResizeObserver(scheduleMeasureSync);
  observeChildren();
  childrenMutationObserver = new MutationObserver(() => {
    scheduleMeasureSync();
    observeChildren();
  });
  childrenMutationObserver.observe(el, { childList: true });
});
onBeforeUnmount(() => {
  containerObserver?.disconnect();
  childrenObserver?.disconnect();
  childrenMutationObserver?.disconnect();
  containerObserver = null;
  childrenObserver = null;
  childrenMutationObserver = null;
});

defineExpose({ element: rootRef, scrollState, sync });
</script>
