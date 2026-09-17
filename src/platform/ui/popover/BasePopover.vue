<template>
  <div v-if="$slots['trigger']" :class="{ 'flex w-full': block }" class="popover-wrapper relative inline-flex">
    <div
      :class="{ 'flex w-full flex-1': block }"
      @click="handleTriggerClick()"
      @contextmenu="handleTriggerContextMenu($event)"
      @focusin="handleTriggerFocusIn()"
      @focusout="handleTriggerFocusOut($event)"
      @mouseenter="handleTriggerMouseEnter($event)"
      @mouseleave="handleTriggerMouseLeave($event)"
      @mousemove="handleTriggerMouseMove($event)"
      class="popover-trigger inline-flex"
      ref="referenceRef"
    >
      <slot :close :open :pin-toggle :toggle :is-open="model" name="trigger" />
    </div>
  </div>

  <Teleport :disabled="disabledTeleport" :to="teleportTo ?? 'body'">
    <div
      v-if="isMounted"
      :style="[floatingStyles, { zIndex: floatingZIndex }]"
      data-floating-layer
      class="popover-floating-host pointer-events-auto"
      ref="floatingRef"
    >
      <!-- panelScrollbar：面板自身作为滚动容器挂 v-scrollbar（注入 overflow 并隐藏原生滚动条），
           高度上限仍由 panelClass 提供。指令经 enabled 绑定值惰性启停，面板保持单分支——
           禁止改回 Transition 内 v-if/v-else 双分支（分支切换会触发 insertBefore 补丁错误） -->
      <Transition :name="transitionName" @after-leave="handleAfterLeave()" appear>
        <div
          v-if="isShown"
          v-scrollbar="panelScrollbarBinding"
          :aria-label
          :aria-modal="false"
          :class="panelClass"
          :style="mergedPanelStyle"
          @focusout="handleFocusOut($event)"
          @mouseenter="handlePanelMouseEnter()"
          @mouseleave="handlePanelMouseLeave($event)"
          class="popover-panel relative z-panel rounded-md border border-glass-border bg-surface-elevated shadow-floating backdrop-blur-xl outline-none"
          ref="panelRef"
          role="dialog"
          tabindex="-1"
        >
          <div v-if="showArrow" :style="arrowStyle" class="popover-arrow pointer-events-none" ref="arrowRef" />
          <slot :close />
        </div>
      </Transition>
      <!-- v-scrollbar overlay 独立挂载层：模板内恒无子节点，Vue 永不 diff 它的 children。
           必须常驻（不与 isShown 联动）且晚于面板挂载，overlay 才能盖在面板之上且 ref 先就绪。
           禁止让指令把 overlay 追加到浮层宿主本身——宿主的 children 由 Transition 动态切换，
           外来节点会破坏补丁锚点（insertBefore NotFoundError） -->
      <div
        v-if="panelScrollbar"
        aria-hidden="true"
        class="popover-scrollbar-layer pointer-events-none absolute inset-0 z-panel"
        ref="scrollbarLayerRef"
      />
    </div>
  </Teleport>
</template>

<script lang="ts">
// 双 script 块的 SFC 视为同一模块：import 必须整体置于第一个块顶部（import/first），
// 下方 <script setup> 直接复用这些绑定
import { computed, nextTick, onBeforeUnmount, provide, ref, unref, useTemplateRef, watch } from 'vue';

import { useEventListener } from '@vueuse/core';

import { buildFloatingArrowStyle } from '@/platform/ui/popover/floatingArrow';
import {
  buildFloatingMiddlewares,
  createVirtualElementRect,
  resolveArrowAwareOffset,
} from '@/platform/ui/popover/floatingCore';
import { acquireFloatingZ, FLOATING_Z_BASE, releaseFloatingZ } from '@/platform/ui/popover/floatingZ';
import { POPOVER_PIN_KEY } from '@/platform/ui/popover/popoverPin';
import { registerOpenPopover, unregisterOpenPopover } from '@/platform/ui/popover/popoverRegistry';
import { useFloatingPosition } from '@/platform/ui/popover/useFloatingPosition';
import { POPOVER_HOVER_CLOSE_DELAY_MS } from '@/platform/utils/constants';

import type { ScrollbarOptions } from '@/platform/directives/vScrollbar';
import type { Placement, VirtualElement } from '@floating-ui/dom';
import type { CSSProperties, MaybeRef } from 'vue';

/**
 * 调试日志开关与实例序号（仅开发期）。
 *
 * `import.meta.env.DEV` 在生产构建被 Vite 替换为字面量 false，下方所有 `if (IS_DEV)` 分支
 * 随之成为死代码被摇掉——与「DevPanel 是否进产物」无关，这里只关心日志本身不进生产。
 */
const IS_DEV = import.meta.env.DEV;

/** 浮层实例递增序号：dev 日志里区分同一时刻的多个浮层（层级竞争、互斥关闭都靠它定位） */
const popoverInstanceSeqState = { seq: 0 };

// 浮层全局状态：必须放在模块作用域（<script setup> 体每次实例化都会重新执行），
// 否则每个实例各自持有独立登记表，跨实例的引用映射与层级预算（父面板不反超子浮层）都会失效
const globalFloatingReferenceMap = new WeakMap<HTMLElement, HTMLElement>();

interface PopoverLayerEntry {
  el: HTMLElement | null;
  z: number;
  /** 是否处于打开态：关场动画期间 model 已为 false 但宿主尚未卸载，需与「真正打开」区分以判定最上层 */
  open: boolean;
}

/** 打开中的浮层实例登记（供 bring-to-front 时计算后代层级预算，保证父面板不反超打开中的子浮层） */
const openedPopovers = new Set<PopoverLayerEntry>();

/**
 * 全局指针位置：所有浮层实例共享一个监听，供关闭前做**几何复核**。
 *
 * 只靠 `:hover` 判定「指针是否还在区域内」有个致命盲点：`:hover` 只描述**最顶层**命中的元素。
 * 相邻菜单、级联子菜单、Tooltip 等任何另一个浮层压在指针下时，本浮层的 `:hover` 会凭空消失，
 * 而它的面板其实正被指针压着 —— 计时到期就关，现象即「鼠标明明还压在菜单上，它自己关了」。
 * 几何判定不看层级，只看坐标是否落在合法矩形内，正好补上这一刀。
 *
 * 用「最近一次 pointermove 的坐标」而不是「mouseleave 时的坐标（leavePoint）」：后者在指针
 * 快速移动时可能已经远在界外，且指针停下后永远不会再刷新，据此判据会时真时假 —— 这正是
 * 「偶尔自己关」这类不稳定现象的温床。
 */
let pointerX = -1;
let pointerY = -1;
/** 是否已有可用坐标（指针离开窗口后失效，此时不宜再据旧坐标判定「在里面」） */
let pointerTracked = false;
let pointerBound = false;

const trackPointer = (e: PointerEvent) => {
  pointerX = e.clientX;
  pointerY = e.clientY;
  pointerTracked = true;
};

/** 指针移出文档（移到浏览器 UI / 其它窗口）：坐标就此作废，回退到「不在区域内」的保守判定 */
const dropPointer = () => {
  pointerTracked = false;
};

/** 首个浮层实例初始化时挂上唯一的全局监听（捕获 + 被动，开销可忽略） */
const ensurePointerTracking = () => {
  if (pointerBound) return;
  pointerBound = true;
  window.addEventListener('pointermove', trackPointer, { capture: true, passive: true });
  document.addEventListener('pointerleave', dropPointer, { capture: true, passive: true });
  window.addEventListener('blur', dropPointer);
};
</script>

<script setup lang="ts">
const model = defineModel<boolean>({ default: false });

const {
  trigger = 'click',
  hoverOpenDelay = 50,
  hoverCloseDelay = POPOVER_HOVER_CLOSE_DELAY_MS,
  placement = 'bottom',
  disabled = false,
  offsetDistance = 8,
  closeOnClickOutside = true,
  closeOnEsc = true,
  closeOnFocusOut = true,
  matchTriggerWidth = false,
  matchTriggerWidthStrategy = 'width',
  showArrow = false,
  block = false,
  teleportTo = 'body',
  disabledTeleport = false,
  ariaLabel = '弹出面板',
  panelClass = '',
  panelStyle = {},
  transitionName = 'v-transition-scale',
  virtualRef = null,
  contextTriggerEl = null,
  closeOnContextTriggerClick = true,
  autoFocus = false,
  panelScrollbar = false,
} = defineProps<{
  /** 触发方式：click / hover / focus / contextmenu */
  trigger?: 'click' | 'hover' | 'focus' | 'contextmenu';
  /** hover 触发时移入后延时打开的毫秒数 */
  hoverOpenDelay?: number;
  /** hover 触发时移出后延时关闭的毫秒数 */
  hoverCloseDelay?: number;
  /** 浮层相对锚点的定位方位（floating-ui Placement） */
  placement?: Placement;
  /** 禁用一切触发与开关交互 */
  disabled?: boolean;
  /** 浮层与锚点之间的间距（px） */
  offsetDistance?: number;
  /** 按下浮层与触发器外部区域时是否关闭 */
  closeOnClickOutside?: boolean;
  /** 按 Esc 键是否关闭浮层 */
  closeOnEsc?: boolean;
  /** 焦点移出浮层合法区域时是否关闭 */
  closeOnFocusOut?: boolean;
  /** 浮层宽度是否对齐触发元素 */
  matchTriggerWidth?: boolean;
  /** 宽度对齐策略：width 固定等宽 / minWidth 仅不小于触发器 */
  matchTriggerWidthStrategy?: 'width' | 'minWidth';
  /** 是否显示指向锚点的小箭头 */
  showArrow?: boolean;
  /** 触发器包裹层是否撑满整行宽度 */
  block?: boolean;
  /** 浮层 Teleport 的挂载目标（选择器或元素，默认 body） */
  teleportTo?: string | HTMLElement;
  /** 是否禁用 Teleport（浮层就近渲染在组件原位） */
  disabledTeleport?: boolean;
  /** 浮层面板的无障碍标签 */
  ariaLabel?: string;
  /** 附加到浮层面板上的类名 */
  panelClass?: string | string[] | Record<string, boolean>;
  /** 附加到浮层面板上的内联样式 */
  panelStyle?: CSSProperties;
  /** 浮层进出场过渡动画名 */
  transitionName?: string;
  /** 虚拟锚点引用（如鼠标坐标构造的定位点），设置后浮层锚定它而非触发元素 */
  virtualRef?: MaybeRef<VirtualElement | null>;
  /** 虚拟锚点模式下真实承载右键事件的触发元素（如 ContextMenu 的包裹层），纳入合法区域判定 */
  contextTriggerEl?: HTMLElement | null;
  /** 左键点击 contextTriggerEl 内部时是否关闭浮层；触发元素本身就是持续编辑面（如搜索输入框）时应关掉 */
  closeOnContextTriggerClick?: boolean;
  /** 打开后是否自动聚焦面板内首个可聚焦元素 */
  autoFocus?: boolean;
  /** 面板是否用 v-scrollbar 指令自绘滚动条（替换原生滚动条）；高度上限由 panelClass 提供 */
  panelScrollbar?: boolean;
}>();

const emit = defineEmits<{
  (e: 'open'): void;
  (e: 'close'): void;
}>();

/** dev 日志标识：#序号 + 无障碍标签，用于在同一时刻多个浮层的日志里认出具体实例 */
const instanceId = `#${++popoverInstanceSeqState.seq}(${ariaLabel})`;

/** dev 日志用调用栈：关闭入口有 8 处，光看 reason 不够，得能看见是谁调的 */
const callStack = (): string =>
  (new Error().stack ?? '')
    .split('\n')
    .slice(1, 7)
    .map(s => s.trim().replace(/^at\s+/, ''))
    .join(' <- ');

const referenceRef = useTemplateRef<HTMLElement>('referenceRef');
const floatingRef = useTemplateRef<HTMLElement>('floatingRef');
const panelRef = useTemplateRef<HTMLDivElement>('panelRef');
const scrollbarLayerRef = useTemplateRef<HTMLElement>('scrollbarLayerRef');
const arrowRef = useTemplateRef<HTMLElement>('arrowRef');
const isMounted = ref(false);
const isShown = ref(false);
const contextMenuVirtualRef = ref<VirtualElement | null>(null);

/** 当前是否有指针按住（用于忽略拖拽过程中的 focusout） */
const isPointerDown = ref(false);

// 本实例在打开中浮层登记表（模块级 openedPopovers）里的条目（el 由 floatingRef watch 填充）
const ownLayerEntry: PopoverLayerEntry = { el: null, z: FLOATING_Z_BASE, open: false };

const activeReference = computed(() => unref(virtualRef) || contextMenuVirtualRef.value || referenceRef.value);

const middlewareList = computed(() =>
  buildFloatingMiddlewares({
    // showArrow 时箭头外露 ≈ size·√2/2 - 1（size=14 → ≈9px），浮层间距需大于外露量，否则箭头会戳到触发元素
    offsetDistance: resolveArrowAwareOffset(offsetDistance, showArrow),
    showArrow,
    getArrowEl: () => arrowRef.value,
    matchTriggerWidth,
    matchTriggerWidthStrategy,
  })
);

// 定位编排走 platform 内的 useFloatingPosition（直接 computePosition + autoUpdate），
// 不再用 @floating-ui/vue 的 useFloating——它的 open/isPositioned 语义、组件实例解包
// 在本组件全是空转，且其 options 里的 whileElementsMounted 只是 autoUpdate 的透传。
// 三个输出的消费方式不变：placement 是 flip 后的实际方位（不是入参 placement）
const {
  floatingStyles,
  middlewareData,
  placement: currentPlacement,
  update,
} = useFloatingPosition({
  reference: activeReference,
  floating: floatingRef,
  placement: () => placement,
  middleware: middlewareList,
  strategy: 'fixed',
});

/**
 * 浮层入场缩放的原点：跟随实际(flip 后)placement，让面板从「贴着触发点的那一侧」长出，
 * 而不是固定 top 中心（视觉像从中心弹开）。
 *
 * floating-ui 的 placement 描述「浮层相对锚点的方位」：
 *  - main 轴为 bottom/top/left/right → 贴锚点的边是该方位的反边（bottom → 从面板 top 生长）；
 *  - cross 轴为 start/end → 另一个维度也贴近锚点（bottom-start → top-left 角贴触发点）。
 * 无 cross 时该维度居中，水平主轴与垂直主轴分别拼装 transform-origin。
 */
const panelTransformOrigin = computed<string>(() => {
  const p = currentPlacement.value || placement;
  const [main = '', cross] = p.split('-');
  const mainNear: Record<string, string> = { bottom: 'top', top: 'bottom', right: 'left', left: 'right' };
  const mainIsVertical = main === 'bottom' || main === 'top';

  // 主轴贴边（必含）；交叉轴仅在有 start/end 时贴近，否则居中
  const mainPart = mainNear[main] ?? 'center';
  const crossPart =
    cross === 'start'
      ? mainIsVertical
        ? 'left'
        : 'top'
      : cross === 'end'
        ? mainIsVertical
          ? 'right'
          : 'bottom'
        : 'center';

  return mainIsVertical ? `${mainPart} ${crossPart}` : `${crossPart} ${mainPart}`;
});

const mergedPanelStyle = computed<CSSProperties>(() => ({
  transformOrigin: panelTransformOrigin.value,
  ...(typeof panelStyle === 'object' && !Array.isArray(panelStyle) ? panelStyle : {}),
}));

/** v-scrollbar 绑定值：开启时接管面板纵轴；关闭时惰性占位（指令常驻模板但不注入任何样式/DOM）。
 *  面板必须保持单分支——<Transition> 内 v-if/v-else 双分支切换会触发 insertBefore 补丁错误 */
const panelScrollbarBinding = computed<ScrollbarOptions>(() =>
  panelScrollbar ? { direction: 'y', endInset: 8, overlayParent: () => scrollbarLayerRef.value } : { enabled: false }
);

const arrowStyle = computed<CSSProperties>(() => {
  if (!showArrow || !middlewareData.value.arrow) return {};
  const { x, y } = middlewareData.value.arrow;

  return buildFloatingArrowStyle({
    arrowX: x,
    arrowY: y,
    placement: currentPlacement.value || placement,
    background: 'var(--color-surface-elevated)',
    borderColor: 'var(--color-glass-border)',
    backdropFilter: 'var(--blur-xl)',
    borderWidth: 1, // 直接告诉构建函数：父容器有 1px 边框，帮我修掉偏差
  });
});

/**
 * hover 开/关延时共用的计时槽。
 *
 * 计时器触发时必须把槽位清空（见下方 scheduleOpen / scheduleClose）：否则「槽位非空」不再等价于
 * 「有计时在等待」——已触发的旧 id 会一直占着槽位，让凭 `!hoverTimer` 判断「当前没有计时」的调用点
 * 恒判为假（关闭安全网装不上），而任何一次区域内的 mouseover 又把它清成 null 使判据恢复为真。
 * 同一操作两次结果不同，正是「偶尔」这类不确定现象的温床。
 */
let hoverTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 关闭后是否抑制「再次悬停打开」。
 *
 * 选中菜单项后面板关闭，而指针往往还停在触发器上（点完手没动）；另一种情况是列表因排序
 * 变更重排，浏览器对指针下的元素重做命中测试而**补发** mouseenter（指针压根没动）。
 * 两者都会让刚关掉的菜单立刻又弹出来，现象即「选完又开，反复闪」。
 *
 * 抑制一直持续到**指针真的移动过**（见 releaseSuppressIfPointerMoved）或离开触发器为止，
 * 符合「一次操作只弹一次」的直觉，也不会影响首次打开。
 */
let suppressHoverReopen = false;

/**
 * 抑制生效那一刻的指针坐标。
 *
 * 它是区分两类事件的关键：**指针没动却被补发的 mouseenter**（列表重排后浏览器重做命中测试）
 * 坐标与关闭时完全一致，而**用户真的把鼠标移回来了**必然产生位移。
 */
let suppressAnchor: { x: number; y: number } | null = null;

/** 判定「指针确实移动过」的位移阈值（px）：低于此值视为手抖或坐标取整，不算移动 */
const HOVER_REOPEN_MOVE_THRESHOLD_PX = 4;

/**
 * 指针自抑制生效后确实移动过 → 解除抑制（返回是否可继续走打开流程）。
 *
 * 只靠触发器 mouseleave 解除是不够的：选中菜单项时指针停在**面板**上，触发器根本没收过
 * mouseleave，抑制也就没有解除的机会 —— 用户移回触发器时 mouseenter 被吃掉，必须再移出
 * 一次才开，现象即「切换排序后要第二次移入才显示」。位移才是「用户主动移回来了」的可靠判据。
 */
const releaseSuppressIfPointerMoved = (x: number, y: number): boolean => {
  if (!suppressHoverReopen) return true;
  const moved =
    !suppressAnchor ||
    Math.abs(x - suppressAnchor.x) >= HOVER_REOPEN_MOVE_THRESHOLD_PX ||
    Math.abs(y - suppressAnchor.y) >= HOVER_REOPEN_MOVE_THRESHOLD_PX;
  if (!moved) return false;
  suppressHoverReopen = false;
  suppressAnchor = null;
  return true;
};

/**
 * 是否正由 close() 内部置 false：供下方 watch 区分「走 close()」与「外部直接改 v-model」。
 * 后者不经过任何关闭入口，日志里若不单独标出，这类关闭就是完全隐形的。
 */
let closingInternally = false;

/** 清除 hover 计时器（对已触发的 id 调 clear 是空操作，槽位语义不受影响） */
const clearHoverTimer = () => {
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
};

ensurePointerTracking();

/** 指针给定坐标是否落在「合法区域任一矩形外扩 offsetDistance」内（几何判定，与层级无关）。
 *  触发器 / contextTriggerEl / 浮层宿主**各自**外扩后逐一判定：取并集会把面板两侧、
 *  触发器左右的大片空白也算成合法区域，菜单会黏住不走。 */
const isPointerInRect = (point: { x: number; y: number }): boolean => {
  const pad = Math.max(offsetDistance, 4);
  for (const el of [referenceRef.value, contextTriggerEl, floatingRef.value]) {
    const r = el?.getBoundingClientRect();
    if (!r) continue;
    if (point.x >= r.left - pad && point.x <= r.right + pad && point.y >= r.top - pad && point.y <= r.bottom + pad) {
      return true;
    }
  }
  return false;
};

/**
 * 指针此刻是否真的落在合法区域内 —— 关闭计时到期前的复核，由三层判据组成：
 *
 * 1. `:hover`：由浏览器按当前命中目标维护，指针确实压在触发器上时恒为真。
 *    浮层一挂载 / 一重排，浏览器会对指针下的元素重新做命中测试并补发 mouseout / mouseover，
 *    这类补发不代表指针移动，却足以把关闭计时装上；而指针此后静止便再无 mouseover 来取消它
 *    —— 到期复核一次即可免掉「鼠标没移出，菜单闪一下就关了」。
 * 2. 子浮层链：面板内 Selector 的下拉等后代浮层同样算「区域内」，
 *    宿主层逐一枚举后用 isChildFloatingLayer 归属判定（该函数在下方定义，此处仅在调用点求值）。
 * 3. **几何复核（关键）**：`:hover` 只描述**最顶层**命中的元素。相邻菜单、级联子菜单、Tooltip
 *    等任何另一个浮层压在指针下时，本浮层的 `:hover` 会凭空消失，而面板其实正被指针压着 ——
 *    少了这一刀就会出现「鼠标还压在菜单上，它自己关了」。几何判定不看层级，只看坐标是否落在
 *    合法矩形内，正好补上这个盲点。坐标取「最近一次 pointermove」（见模块级 pointerX/Y）。
 */
const isPointerInside = (): boolean => {
  if (referenceRef.value?.matches(':hover')) return true;
  for (const layer of document.querySelectorAll<HTMLElement>('[data-floating-layer]:hover')) {
    if (layer === floatingRef.value || isChildFloatingLayer(layer)) return true;
  }
  // 几何复核：`:hover` 只认最顶层元素，别的浮层压在指针下时会假性失效
  // （见模块级 pointerX/Y 注释）。有实时坐标就用实时坐标；只有在从未收到过 pointermove
  // 的场景（触摸、程序化打开）才退回「离开时坐标」的走廊判定。
  return pointerTracked ? isPointerInRect({ x: pointerX, y: pointerY }) : isPointerInCorridor();
};

/** 延时打开：槽位若被占用则重新计时（触发器 mouseenter 唯一入口） */
const scheduleOpen = (delay: number) => {
  clearHoverTimer();
  // 抑制窗口内不自动重开（指针未移动过 → 视为补发事件，见 suppressHoverReopen 注释）
  if (suppressHoverReopen) return;
  hoverTimer = setTimeout(() => {
    hoverTimer = null;
    open();
  }, delay);
};

/**
 * 最近一次「疑似离开」时的指针坐标（触发器移出 / 面板移出 / 全局 hover 路由判定落在区域外）。
 * 仅在从未收到过 pointermove 时作为兜底坐标参与判定（见 isPointerInside 第 3 层的分支）。
 */
let leavePoint: { x: number; y: number } | null = null;

/**
 * 指针是否仍落在合法区域（几何判定）——**兜底路径**，仅在还没有任何 pointermove 坐标时生效
 * （触摸设备、或浮层在指针从未移动过的情况下被程序打开）。
 *
 * 正常鼠标操作下计时到期前用的是「最近一次 pointermove 的实时坐标」：指针停下后不会再派发
 * 事件，leavePoint 会永远停在离开那一刻的位置，据此判定就会一直沿用过期坐标。
 */
const isPointerInCorridor = (): boolean => {
  if (!leavePoint) return false;
  return isPointerInRect(leavePoint);
};

/**
 * 延时关闭：三条路径（触发器移出 / 面板移出 / 全局 hover 路由判定落入区域外）共用，
 * 到期时先复核钉住态与指针位置，指针仍在区域内则视为事件抖动、不关。
 */
const scheduleClose = (delay: number) => {
  clearHoverTimer();
  hoverTimer = setTimeout(() => {
    hoverTimer = null;
    const inside = isPointerInside();
    if (IS_DEV) {
      console.debug(`[popover${instanceId}] hover 计时到期`, {
        delay,
        pinned: pinned.value,
        inside,
        triggerHover: referenceRef.value?.matches(':hover') ?? null,
        pointer: pointerTracked ? { x: pointerX, y: pointerY } : 'untracked',
        // 几何复核的判定依据：三个合法矩形与外扩量，缺一不可（漏掉哪个矩形就会误判为「已离开」）
        pad: Math.max(offsetDistance, 4),
        rects: [referenceRef.value, contextTriggerEl, floatingRef.value].map(el => {
          const r = el?.getBoundingClientRect();
          return r
            ? `${Math.round(r.left)},${Math.round(r.top)} ~ ${Math.round(r.right)},${Math.round(r.bottom)}`
            : null;
        }),
      });
    }
    if (pinned.value || inside) {
      // 判为「仍在区域内」后不自动续计时：指针此刻就在区域内，等它真离开时必然有新的
      // mouseleave / mouseover 重新装上计时；而「指针已停在区域外」这一情形由 isPointerInside
      // 的实时坐标直接判否并关闭，不需要靠续计时兜底。
      leavePoint = null;
      return;
    }
    close('hover-timeout');
  }, delay);
};

watch(
  [floatingRef, activeReference],
  ([el, refEl]) => {
    ownLayerEntry.el = el ?? null;
    if (el && refEl instanceof HTMLElement) globalFloatingReferenceMap.set(el, refEl);
  },
  { immediate: true }
);

/**
 * 本浮层的锚点元素：右键（虚拟锚点）模式下取承载右键的真实触发元素，否则取触发包裹层。
 * 供注册表按「锚点是否落在某个滚动容器内」精确关闭（见 popoverRegistry.closePopoversWithin）。
 */
const getAnchorEl = (): HTMLElement | null => contextTriggerEl ?? referenceRef.value ?? null;

// 全局注册：打开中的浮层登记关闭函数与锚点，供容器滚动等场景联动关闭（close 幂等，嵌套重复关闭安全）
watch(model, val => {
  if (val) registerOpenPopover(close, getAnchorEl);
  else unregisterOpenPopover(close);
});

watch(model, async val => {
  if (!val) {
    if (IS_DEV && !closingInternally) {
      console.debug(`[popover${instanceId}] model 被外部直接置 false（未走 close()）`, { stack: callStack() });
    }
    clearHoverTimer();
    isShown.value = false;
  } else {
    // v-model 外部置 true 的打开路径不经过 open()，必须在这里补层级分配，
    // 否则浮层停留在兜底层号 9999，会被任何已打开的浮层压住
    if (!zOwned) {
      acquireOwnedZ();
      openedPopovers.add(ownLayerEntry);
      ownLayerEntry.open = true;
    }
    isMounted.value = true;
    await nextTick();
    update();
    if (!model.value) return;
    isShown.value = true;
    if (autoFocus) {
      await nextTick();
      const firstFocusable = panelRef.value?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      (firstFocusable || panelRef.value)?.focus();
    }
  }
});

/** 打开浮层：分配最高层级并派发 open；已打开时仅重新定位与置显 */
const open = async () => {
  if (disabled) return;
  if (model.value) {
    update();
    isShown.value = true;
    return;
  }
  // 释放上次可能未清理的层号（离场动画被打断时 afterLeave 不会触发），再分配新的最高层
  releaseOwnedZ();
  acquireOwnedZ();
  openedPopovers.add(ownLayerEntry);
  ownLayerEntry.open = true;
  isMounted.value = true;
  if (IS_DEV) console.debug(`[popover${instanceId}] OPEN`, { trigger, stack: callStack() });
  model.value = true;
  emit('open');
};

/**
 * 关闭浮层：复位钉住与右键虚拟锚点，并派发 close。
 *
 * `reason` 仅服务于 dev 日志：关闭入口散布在 8 处（hover 计时、外部点击、Esc、失焦、
 * 注册表滚动联动、toggle / pinToggle、消费方主动调用），「菜单自己关了」这类现象
 * 必须能一眼看出走的是哪条路径，否则只能靠猜测定位。
 */
const close = (reason = 'unmarked') => {
  if (!model.value && !isShown.value) return;
  if (IS_DEV) {
    console.debug(`[popover${instanceId}] CLOSE reason=${reason}`, {
      pinned: pinned.value,
      trigger,
      wasShown: isShown.value,
      stack: callStack(),
    });
  }
  leavePoint = null;
  // 关闭即进入「不自动重开」窗口，但 hover 自然移出（hover-timeout）除外：
  // 那种关闭发生在指针**已离开**触发器之后，此时放开抑制，用户移回来才能正常再次悬停打开
  // （收起再悬停是常规操作）；而菜单项选中、外部点击、Esc、失焦这类「明确操作」导致的关闭，
  // 指针往往还停在触发器上，必须抑制，否则刚关就又弹出来。
  if (reason !== 'hover-timeout') {
    // 没有可用指针坐标（触摸、程序化打开）时不抑制：那种场景不会有 mouseleave 来解除抑制，
    // 菜单会彻底卡在「悬停打不开」，比「刚关又弹出来」严重得多
    suppressHoverReopen = pointerTracked;
    suppressAnchor = pointerTracked ? { x: pointerX, y: pointerY } : null;
  }
  ownLayerEntry.open = false;
  isShown.value = false;
  closingInternally = true;
  model.value = false;
  void nextTick(() => {
    closingInternally = false;
  });
  pinned.value = false;
  contextMenuVirtualRef.value = null;
  emit('close');
};

/** 离场动画结束后的清理：卸载宿主节点并归还层级 */
const handleAfterLeave = () => {
  if (model.value || isShown.value) return;
  isMounted.value = false;
  openedPopovers.delete(ownLayerEntry);
  releaseOwnedZ();
};

const floatingZIndex = ref<number>(FLOATING_Z_BASE);
// 标记本实例当前是否在层级池中持有层号。
// 组件实例常驻不卸载，floatingZIndex 会残留上次分配的旧值；
// 若不做标记就无条件 release，会把池中他人占用的同号层误删。
let zOwned = false;

/** 从层级池获取新层号并登记到打开中浮层表（含后代层级预算约束） */
const acquireOwnedZ = () => {
  // 后代预算：面板内打开中的直接后代浮层（如 Selector 下拉）必须保持在本面板之上，
  // 置顶时层号不得超过其中最低者，否则父面板会反超并盖住子浮层
  let budget = Number.POSITIVE_INFINITY;
  if (panelRef.value) {
    for (const entry of openedPopovers) {
      if (entry === ownLayerEntry || !entry.el) continue;
      const trigger = globalFloatingReferenceMap.get(entry.el);
      if (trigger && panelRef.value.contains(trigger)) {
        budget = Math.min(budget, entry.z);
      }
    }
  }
  floatingZIndex.value = acquireFloatingZ(budget === Number.POSITIVE_INFINITY ? undefined : budget - 1);
  ownLayerEntry.z = floatingZIndex.value;
  zOwned = true;
  return floatingZIndex.value;
};

/** 归还本实例持有的层号（未持有时空操作） */
const releaseOwnedZ = () => {
  if (!zOwned) return;
  releaseFloatingZ(floatingZIndex.value);
  zOwned = false;
};

/** 切换开关状态 */
const toggle = () => {
  if (model.value) {
    close('trigger-toggle');
  } else {
    open();
  }
};

/**
 * 面板内容主动钉住：内容组件在发生明确交互（如展开折叠分组）后调用。
 * 仅在已打开时置钉住态——之后 hover 移出不再自动关闭，点击外部 / Escape 仍正常关闭。
 * 通过 provide 下发给面板内容，未注入的消费方（usePopoverPin 默认值）为空操作。
 */
const pin = () => {
  if (model.value) pinned.value = true;
};
provide(POPOVER_PIN_KEY, pin);

/**
 * hover 模式的「钉住」切换：打开并钉住（悬停关闭失效，仅点击外部关闭）；
 * 已钉住时再次点击则关闭。
 */
const pinned = ref(false);
/** 钉住切换的具体实现：已钉住并打开时关闭，否则钉住并打开 */
const pinToggle = () => {
  if (model.value && pinned.value) {
    close('pin-toggle');
  } else {
    pinned.value = true;
    open();
  }
};

/** click 触发：切换浮层开关 */
const handleTriggerClick = () => {
  if (trigger !== 'click' || disabled) return;
  toggle();
};

/** 右键触发：以鼠标坐标构造虚拟锚点后打开 */
const handleTriggerContextMenu = (e: MouseEvent) => {
  if (trigger !== 'contextmenu' || disabled) return;
  e.preventDefault();
  contextMenuVirtualRef.value = createVirtualElementRect(e.clientX, e.clientY);
  open();
};

/** focus 触发：聚焦时打开 */
const handleTriggerFocusIn = () => {
  if (trigger !== 'focus' || disabled) return;
  open();
};

// a11y：aria-expanded / aria-haspopup 由触发插槽内的真实交互元素承载（插槽已提供 isOpen），
// 包裹层 div 无角色时不允许挂载这两个属性（axe: aria-allowed-attr）
/** hover 触发：延时打开，并让已打开的浮层置顶 */
const handleTriggerMouseEnter = (e: MouseEvent) => {
  if (trigger !== 'hover' || disabled) return;
  leavePoint = null;
  if (releaseSuppressIfPointerMoved(e.clientX, e.clientY)) scheduleOpen(hoverOpenDelay);
  // 已打开的浮层（如被钉住的）在鼠标再次进入时置顶，保证「最近交互者在上」
  bringToFront();
};

/**
 * hover 触发：抑制窗口内指针在触发器上移动时补一次打开。
 *
 * 覆盖「关闭那一刻指针恰好停在触发器上、之后只在触发器内小幅移动」的场景 —— 那种情况
 * 不会再有 mouseenter，只有 mousemove 能证明用户真的动过鼠标。解除后抑制即关闭，
 * 后续 mousemove 直接早退，不会反复重置打开延时。
 */
const handleTriggerMouseMove = (e: MouseEvent) => {
  if (trigger !== 'hover' || disabled) return;
  if (!suppressHoverReopen) return;
  if (releaseSuppressIfPointerMoved(e.clientX, e.clientY)) scheduleOpen(hoverOpenDelay);
};

/** hover 触发：记下离开时的指针坐标并延时关闭（钉住时不关） */
const handleTriggerMouseLeave = (e: MouseEvent) => {
  // 指针真正离开触发器 → 解除「关闭后不重开」窗口（须早于下方 trigger/pinned 早退，
  // 否则钉住态下离开不会解除，菜单再也悬停不开）
  suppressHoverReopen = false;
  suppressAnchor = null;
  if (trigger !== 'hover' || pinned.value) return;
  leavePoint = { x: e.clientX, y: e.clientY };
  scheduleClose(hoverCloseDelay);
};

/** 鼠标移入面板：取消关闭计时、作废离开坐标并置顶 */
const handlePanelMouseEnter = () => {
  if (trigger !== 'hover') return;
  leavePoint = null;
  clearHoverTimer();
  // 从别的浮层移入本面板时置顶（「最近交互者在上」）
  bringToFront();
};

/** 已打开的浮层重新分配当前最高层级（bring-to-front）；未打开时为空操作 */
const bringToFront = () => {
  if (!model.value) return;
  releaseOwnedZ();
  acquireOwnedZ();
};

/** 鼠标移出面板：记下离开时的指针坐标并延时关闭（钉住时不关） */
const handlePanelMouseLeave = (e: MouseEvent) => {
  if (trigger !== 'hover' || pinned.value) return;
  leavePoint = { x: e.clientX, y: e.clientY };
  scheduleClose(hoverCloseDelay);
};

/**
 * hover 模式全局 hover 路由：鼠标落在任何「合法区域」（trigger / panel / 嵌套子浮层链，
 * 如面板内 Selector 的下拉菜单）内时取消关闭计时；落在区域外时确保计时存在。
 * 解决「鼠标从面板移入子浮层瞬间，父面板因 mouseleave 计时到期被关闭」的问题。
 */
useEventListener(
  window,
  'mouseover',
  (e: MouseEvent) => {
    if (trigger !== 'hover' || !model.value || pinned.value) return;
    if (isEventInside(e.target)) {
      leavePoint = null;
      clearHoverTimer();
    } else if (!hoverTimer) {
      leavePoint = { x: e.clientX, y: e.clientY };
      scheduleClose(hoverCloseDelay);
    }
  },
  true
);

/** 判断元素是否位于本浮层的嵌套子浮层链内（沿触发元素逐级上溯） */
const isChildFloatingLayer = (el: HTMLElement | null): boolean => {
  if (!el) return false;
  let targetFloating = el.closest<HTMLElement>('[data-floating-layer]');
  while (targetFloating && targetFloating !== floatingRef.value) {
    const childTrigger = globalFloatingReferenceMap.get(targetFloating);
    if (!childTrigger) return false;
    if (panelRef.value?.contains(childTrigger) || referenceRef.value?.contains(childTrigger)) {
      return true;
    }
    targetFloating = childTrigger.closest<HTMLElement>('[data-floating-layer]');
  }
  return false;
};

/** 判断事件目标是否在「合法区域」内：触发元素、面板（含 v-scrollbar 自绘轨道/拇指等
 *  挂在浮层宿主下的兄弟 overlay）或嵌套子浮层 */
const isEventInside = (target: EventTarget | null): boolean => {
  if (!(target instanceof Node)) return false;
  if (referenceRef.value?.contains(target)) return true;
  // v-scrollbar 的轨道/拇指是 panelRef 的兄弟节点（vScrollbar 挂到宿主父元素上），
  // 必须按浮层宿主整体判定，否则点击/悬停滚动条会被判为外部而关闭面板
  if (floatingRef.value?.contains(target)) return true;
  if (target instanceof HTMLElement && isChildFloatingLayer(target)) return true;
  return false;
};

// ─── 关键：用 pointerdown 做 outside，而不是 click ───
// 只有「按下点」在外部才关闭 → 内按下、外松开不会关
useEventListener(
  window,
  'pointerdown',
  (e: PointerEvent) => {
    if (!closeOnClickOutside || !model.value || !isShown.value) return;
    if (e.button === 2) return; // 右键留给 ContextMenu（不置 isPointerDown，避免污染拖拽守卫）
    isPointerDown.value = true;
    // contextTriggerEl 内的左键是否关闭由消费方声明：ContextMenu 触发区要点关（toggle），
    // 而 BaseInput 的 input 本身位于 contextTriggerEl 内且点击会立即重开面板，关闭再重开只会闪烁
    if (!closeOnContextTriggerClick && contextTriggerEl?.contains(e.target as Node)) return;
    if (isEventInside(e.target)) {
      // hover 模式：面板内点击不置钉住——移出面板仍按延时关闭；
      // 「始终钉住」仅由触发器点击（pinToggle）触发
      clearHoverTimer();
      return;
    }
    if (IS_DEV) {
      const t = e.target;
      console.debug(`[popover${instanceId}] 外部 pointerdown → 关闭`, {
        target: t instanceof HTMLElement ? `${t.tagName}.${String(t.className).slice(0, 60)}` : String(t),
      });
    }
    close('outside-pointerdown');
  },
  true
);

// 右键不参与 pointerdown 外点关闭（避免与触发新菜单的 contextmenu 事件竞争），
// 改由全局 contextmenu 捕获阶段负责：右键落在合法区域外时关闭本浮层。
// contextTriggerEl（虚拟锚点模式下承载右键的真实触发元素）仅对右键视为「内部」——
// 右键它应走复用换位重开而非关闭；左键它则仍由 pointerdown 路径正常关闭
useEventListener(
  window,
  'contextmenu',
  (e: MouseEvent) => {
    if (!closeOnClickOutside || !model.value || !isShown.value) return;
    if (isEventInside(e.target) || contextTriggerEl?.contains(e.target as Node)) return;
    if (IS_DEV) console.debug(`[popover${instanceId}] 外部 contextmenu → 关闭`);
    close('outside-contextmenu');
  },
  true
);

useEventListener(
  window,
  'pointerup',
  () => {
    isPointerDown.value = false;
  },
  true
);

useEventListener(
  window,
  'pointercancel',
  () => {
    isPointerDown.value = false;
  },
  true
);

/** 判断本浮层是否为当前所有打开中浮层里 z 最高的（即最上层），用于 Escape 仅关闭最上层而非全部 */
const isTopmostOpenPopover = (): boolean => {
  let topZ = -Infinity;
  for (const entry of openedPopovers) {
    if (entry.open) topZ = Math.max(topZ, entry.z);
  }
  return floatingZIndex.value >= topZ;
};

useEventListener(
  window,
  'keydown',
  (e: KeyboardEvent) => {
    if (!model.value || !closeOnEsc) return;
    if (e.key !== 'Escape') return;
    // 嵌套浮层下，仅最上层（z 最大）的实例响应 Escape，避免一次按键把所有浮层一次性全部关闭
    if (!isTopmostOpenPopover()) return;
    e.stopPropagation();
    close('esc');
  },
  { capture: true }
);

/** 面板内失焦：焦点移出合法区域时关闭（拖拽过程中忽略） */
const handleFocusOut = (e: FocusEvent) => {
  if (!closeOnFocusOut || !model.value) return;
  // 鼠标拖拽过程中的失焦不关（例如选项 focus 后拖到外面松开）
  if (isPointerDown.value) return;

  const nextFocused = e.relatedTarget as HTMLElement | null;

  // relatedTarget 为 null：焦点通常不是「被移走」，而是**原焦点元素被移除**——
  // 列表因排序变更重排、或面板内容重渲染时，浏览器把焦点丢回 body 并补发 focusout，
  // 而用户（和指针）什么都没做。此时直接关闭就是「菜单自己关了」。
  // 故延后一帧复核：焦点已回到合法区域内、或指针仍在合法区域内，都说明不是用户主动离开。
  if (!nextFocused) {
    requestAnimationFrame(() => {
      if (!model.value) return;
      const active = document.activeElement;
      if (active && active !== document.body && isEventInside(active)) return;
      if (isPointerInside()) return;
      close('panel-focusout-null');
    });
    return;
  }

  if (isEventInside(nextFocused)) return;
  if (IS_DEV) {
    console.debug(`[popover${instanceId}] 面板失焦 → 关闭`, {
      relatedTarget: `${nextFocused.tagName}.${String(nextFocused.className).slice(0, 60)}`,
    });
  }
  close('panel-focusout');
};

/** focus 触发模式下的触发元素失焦：焦点未移入合法区域则关闭 */
const handleTriggerFocusOut = (e: FocusEvent) => {
  if (!closeOnFocusOut || !model.value) return;
  if (isPointerDown.value) return;
  if (trigger !== 'focus') return;

  const nextFocused = e.relatedTarget as HTMLElement | null;
  if (nextFocused && isEventInside(nextFocused)) return;
  if (IS_DEV) {
    console.debug(`[popover${instanceId}] 触发器失焦 → 关闭`, {
      relatedTarget: nextFocused ? `${nextFocused.tagName}.${String(nextFocused.className).slice(0, 60)}` : null,
    });
  }
  close('trigger-focusout');
};

onBeforeUnmount(() => {
  clearHoverTimer();
  unregisterOpenPopover(close);
  openedPopovers.delete(ownLayerEntry);
  releaseOwnedZ();
});

defineExpose({ open, close, toggle, pinToggle, update });
</script>
