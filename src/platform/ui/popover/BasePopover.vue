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
        <!-- 面板**不得**带 z-index：面板一旦成为层叠上下文，内部的吸附头（z-sticky）就被封在里面，
             永远压不过兄弟节点 scrollbar-layer（z-panel）→ 滚动条会横穿吸附中的分组标题。
             去掉 z-index 后面板仍在流内、位于 layer 之下（layer 有 z-index 且 DOM 更靠后），
             滚动条照旧盖在面板底色与内容之上，而吸附头能逃出面板、压在滚动条之上 -->
        <div
          v-if="isShown"
          v-scrollbar="panelScrollbarBinding"
          :aria-label
          :aria-modal="false"
          :class="[panelClass, panelRadius === 'xl' ? 'rounded-xl' : 'rounded-md']"
          :style="mergedPanelStyle"
          @focusout="handleFocusOut($event)"
          @mouseenter="handlePanelMouseEnter()"
          @mouseleave="handlePanelMouseLeave($event)"
          class="popover-panel relative border border-glass-border bg-surface-elevated shadow-floating outline-none"
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

import { buildFloatingArrowStyle } from '@/platform/ui/popover/floatingArrow';
import {
  buildFloatingMiddlewares,
  computePanelTransformOrigin,
  createVirtualElementRect,
  resolveArrowAwareOffset,
} from '@/platform/ui/popover/floatingCore';
import { POPOVER_PIN_KEY } from '@/platform/ui/popover/popoverPin';
import { ensurePointerTracking, getPointerState } from '@/platform/ui/popover/popoverPointerTracking';
import { registerOpenPopover, unregisterOpenPopover } from '@/platform/ui/popover/popoverRegistry';
import { useFloatingPosition } from '@/platform/ui/popover/useFloatingPosition';
import { usePopoverHover } from '@/platform/ui/popover/usePopoverHover';
import { globalFloatingReferenceMap, usePopoverZLayer } from '@/platform/ui/popover/usePopoverZLayer';
import { POPOVER_HOVER_CLOSE_DELAY_MS } from '@/platform/utils/constants';
import { FOCUSABLE_SELECTOR } from '@/platform/utils/dom';

import type { ScrollbarOptions } from '@/platform/directives/vScrollbar';
import type { Placement, VirtualElement } from '@floating-ui/dom';
import type { CSSProperties, MaybeRef } from 'vue';

// 浮层间共享状态已抽离：
// - 指针位置跟踪 → popoverPointerTracking.ts（几何复核用）
// - 打开中浮层登记表 / 锚点引用映射 / 层级所有权 → usePopoverZLayer.ts
// - hover 开关时序（计时槽 / 防重开抑制 / 离开走廊 / 全局路由）→ usePopoverHover.ts
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
  panelRadius = 'md',
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
  /** 面板圆角档位：默认 `md`；搜索面板等需要更大圆角时传 `xl`
   *  （此前消费方只能拿 `rounded-xl!` 硬压组件默认值 —— 那是「组件缺变体」的症状） */
  panelRadius?: 'md' | 'xl';
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

const activeReference = computed(() => unref(virtualRef) || contextMenuVirtualRef.value || referenceRef.value);

// 层级所有权：层号池获取/归还、打开中登记表条目、锚点引用映射同步（详见 usePopoverZLayer）
const {
  ownLayerEntry,
  floatingZIndex,
  acquireOwnedZ,
  releaseOwnedZ,
  bringToFront,
  isTopmostOpenPopover,
  isZOwned,
  dispose,
} = usePopoverZLayer({
  floatingEl: floatingRef,
  reference: activeReference,
  panelEl: panelRef,
  isOpen: () => model.value,
});

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
 * 浮层入场缩放的原点：跟随实际(flip 后)placement，让面板从「贴着触发点的那一侧」长出。
 * 纯几何映射在 floatingCore.computePanelTransformOrigin（与 vTooltip 等消费方同源）。
 */
const panelTransformOrigin = computed<string>(() => computePanelTransformOrigin(currentPlacement.value || placement));

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
    borderWidth: 1, // 直接告诉构建函数：父容器有 1px 边框，帮我修掉偏差
  });
});

// hover 开/关时序（计时槽 / 防重开抑制 / 离开坐标走廊 / 全局 hover 路由）抽离至 usePopoverHover；
// 定位几何（isPointerInRect / isPointerInside / isPointerInCorridor / isChildFloatingLayer）留在本组件
const {
  clearHoverTimer,
  onCloseStart,
  getLeavePoint,
  handleTriggerMouseEnter,
  handleTriggerMouseMove,
  handleTriggerMouseLeave,
  handlePanelMouseEnter,
  handlePanelMouseLeave,
} = usePopoverHover({
  isHoverMode: () => trigger === 'hover',
  isEnabled: () => !disabled,
  isOpen: () => model.value,
  isPinned: () => pinned.value,
  isPointerInside: () => isPointerInside(),
  isEventInside: target => isEventInside(target),
  open: () => open(),
  close: reason => close(reason),
  bringToFront: () => bringToFront(),
  hoverOpenDelay,
  hoverCloseDelay,
});

ensurePointerTracking();

/** 指针给定坐标是否落在「合法区域任一矩形外扩 offsetDistance」内（几何判定，与层级无关）。
 *  触发器 / contextTriggerEl / 浮层宿主**各自**外扩后逐一判定：取并集会把面板两侧、
 *  触发器左右的大片空白也算成合法区域，菜单会黏住不走。 */
const isPointerInRect = (point: { x: number; y: number }): boolean => {
  const pad = Math.max(offsetDistance, 4);
  for (const el of [referenceRef.value, contextTriggerEl, floatingRef.value]) {
    const r = el?.getBoundingClientRect();
    if (!r) continue;
    if (point.x >= r.left - pad && point.x <= r.right + pad && point.y >= r.top - pad && point.y <= r.bottom + pad)
      return true;
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
 *    合法矩形内，正好补上这个盲点。坐标取「最近一次 pointermove」（见 popoverPointerTracking）。
 */
const isPointerInside = (): boolean => {
  if (referenceRef.value?.matches(':hover')) return true;
  for (const layer of document.querySelectorAll<HTMLElement>('[data-floating-layer]:hover'))
    if (layer === floatingRef.value || isChildFloatingLayer(layer)) return true;

  // 几何复核：`:hover` 只认最顶层元素，别的浮层压在指针下时会假性失效
  // （见 popoverPointerTracking 注释）。有实时坐标就用实时坐标；只有在从未收到过 pointermove
  // 的场景（触摸、程序化打开）才退回「离开时坐标」的走廊判定。
  const pointer = getPointerState();
  return pointer.tracked ? isPointerInRect({ x: pointer.x, y: pointer.y }) : isPointerInCorridor();
};

/**
 * 指针是否仍落在合法区域（几何判定）——**兜底路径**，仅在还没有任何 pointermove 坐标时生效
 * （触摸设备、或浮层在指针从未移动过的情况下被程序打开）。
 *
 * 正常鼠标操作下计时到期前用的是「最近一次 pointermove 的实时坐标」：指针停下后不会再派发
 * 事件，leavePoint 会永远停在离开那一刻的位置，据此判定就会一直沿用过期坐标。
 */
const isPointerInCorridor = (): boolean => {
  const leave = getLeavePoint();
  // 显式判空而非 !!leave / Boolean(leave)：Boolean() 不是类型守卫，TS 不会据此收窄
  //（no-implicit-coercion 的 --fix 会把 !!leave 改写成 Boolean(leave)，收窄随之丢失）
  return leave !== null && isPointerInRect(leave);
};

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
    clearHoverTimer();
    isShown.value = false;
  } else {
    // v-model 外部置 true 的打开路径不经过 open()，必须在这里补层级分配，
    // 否则浮层停留在兜底层号 9999，会被任何已打开的浮层压住
    if (!isZOwned()) acquireOwnedZ();
    await nextTick();
    // 打开期间若被外部置 false（快速开关）：视为打开被打断，归还层号并保持未挂载状态，
    // 否则 isMounted 永久 true（Teleport 宿主残留 body）、层级泄漏，压低后续浮层预算（U10）
    if (!model.value) {
      releaseOwnedZ();
      return;
    }
    isMounted.value = true;
    update();
    isShown.value = true;
    if (autoFocus) {
      await nextTick();
      const firstFocusable = panelRef.value?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
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
  isMounted.value = true;
  model.value = true;
  emit('open');
};

/**
 * 关闭浮层：复位钉住与右键虚拟锚点，并派发 close。
 *
 * `reason` 标记关闭入口（hover 计时、外部点击、Esc、失焦、注册表滚动联动、toggle / pinToggle、
 * 消费方主动调用），随 onCloseStart 下发，供抑制逻辑按原因区分。
 */
const close = (reason = 'unmarked') => {
  if (!model.value && !isShown.value) return;
  // 关闭即进入「不自动重开」窗口（作废离开坐标 + 按原因装抑制，hover 自然移出除外），详见 onCloseStart
  onCloseStart(reason);
  ownLayerEntry.open = false;
  isShown.value = false;
  model.value = false;
  pinned.value = false;
  contextMenuVirtualRef.value = null;
  emit('close');
};

/** 离场动画结束后的清理：卸载宿主节点并归还层级 */
const handleAfterLeave = () => {
  if (model.value || isShown.value) return;
  isMounted.value = false;
  dispose();
};

/** 切换开关状态 */
const toggle = () => {
  if (model.value) close('trigger-toggle');
  else open();
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
  if (model.value && pinned.value) close('pin-toggle');
  else {
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
// hover 触发事件（mouseenter/mousemove/mouseleave、面板移入移出、全局 hover 路由）
// 的处理函数已抽离至 usePopoverHover，见上方解构的同名绑定。
// 已打开浮层的置顶（bring-to-front）与最上层判定已抽离至 usePopoverZLayer。

/** 判断元素是否位于本浮层的嵌套子浮层链内（沿触发元素逐级上溯） */
const isChildFloatingLayer = (el: HTMLElement | null): boolean => {
  if (!el) return false;
  let targetFloating = el.closest<HTMLElement>('[data-floating-layer]');
  while (targetFloating && targetFloating !== floatingRef.value) {
    const childTrigger = globalFloatingReferenceMap.get(targetFloating);
    if (!childTrigger) return false;
    if (panelRef.value?.contains(childTrigger) || referenceRef.value?.contains(childTrigger)) return true;

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

// ─── 全局监听随浮层开合挂/摘 ───
// 下面五条都是 window 捕获监听，每实例各一份（实例数与 BaseMenu / BaseSelector / 输入框搜索面板
// 一一对应，几十个）。原先是 setup 期无条件注册、只靠回调里那句「没打开就早退」兜住 —— 关着的浮层
// 白挂五条全局监听没有任何作用。这里改为按开合挂/摘，且**每条挂上去的时机都取自它回调里已有的那句
// 判据**，于是「关着收不到事件」与「收到了也被早退」完全等价，行为不变。
//
// 为什么不用 useEventListener：它的响应式目标做的是「换目标时摘旧挂新」，而这里需要的是「判据为假时
// 干脆不挂」；且 window 只命中「target: Window」那条重载（该重载的目标是常量），改传 getter 会落到
// 通用目标重载上、与 PointerEvent 这类具名监听器签名对不上。故用一个语义相同（挂/摘 + 卸载清理）的
// 本地小助手。
const bindGlobalListener = <E extends keyof WindowEventMap>(
  isOn: () => boolean,
  event: E,
  listener: (e: WindowEventMap[E]) => void
) => {
  const attach = () => window.addEventListener(event, listener, true);
  const detach = () => window.removeEventListener(event, listener, true);
  // immediate 同步一次初始态（多半是「关着」→ 不挂）；翻转发生在交互回调里，pre flush 保证在下一帧
  // 渲染前就挂好，同一次交互后续派发的事件不会漏。watch 随组件作用域自动停止，摘除另走卸载钩子。
  watch(isOn, on => (on ? attach() : detach()), { immediate: true });
  onBeforeUnmount(detach);
};

/** 外点关闭类监听（左键按下 / 右键）的开启判据：与两条回调里的早退条件逐字对应 */
const globalDismissActive = computed(() => closeOnClickOutside && model.value && isShown.value);
/** Esc 关闭：不吃 closeOnClickOutside，单独一档（同样与回调判据逐字对应） */
const globalEscActive = computed(() => closeOnEsc && model.value);
/**
 * 按下守卫（pointerup / pointercancel）：它的职责只是把 isPointerDown 归零，故只在按住期间挂 ——
 * 挂载区间与标记为真的区间严格重合，不会出现「摘掉监听时标记还留在 true」的 stale 状态
 * （那会让之后所有 focusout 都不再关闭面板，且没有任何报错，属静默失效）。
 */
const globalPressActive = computed(() => isPointerDown.value);

// ─── 关键：用 pointerdown 做 outside，而不是 click ───
// 只有「按下点」在外部才关闭 → 内按下、外松开不会关
bindGlobalListener(
  () => globalDismissActive.value,
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
    close('outside-pointerdown');
  }
);

// 右键不参与 pointerdown 外点关闭（避免与触发新菜单的 contextmenu 事件竞争），
// 改由全局 contextmenu 捕获阶段负责：右键落在合法区域外时关闭本浮层。
// contextTriggerEl（虚拟锚点模式下承载右键的真实触发元素）仅对右键视为「内部」——
// 右键它应走复用换位重开而非关闭；左键它则仍由 pointerdown 路径正常关闭
bindGlobalListener(
  () => globalDismissActive.value,
  'contextmenu',
  (e: MouseEvent) => {
    if (!closeOnClickOutside || !model.value || !isShown.value) return;
    if (isEventInside(e.target) || contextTriggerEl?.contains(e.target as Node)) return;
    close('outside-contextmenu');
  }
);

// pointerup / pointercancel 只为归零按下守卫（见 globalPressActive 的说明）
bindGlobalListener(
  () => globalPressActive.value,
  'pointerup',
  () => {
    isPointerDown.value = false;
  }
);

bindGlobalListener(
  () => globalPressActive.value,
  'pointercancel',
  () => {
    isPointerDown.value = false;
  }
);

bindGlobalListener(
  () => globalEscActive.value,
  'keydown',
  (e: KeyboardEvent) => {
    if (!model.value || !closeOnEsc) return;
    if (e.key !== 'Escape') return;
    // 嵌套浮层下，仅最上层（z 最大）的实例响应 Escape，避免一次按键把所有浮层一次性全部关闭
    if (!isTopmostOpenPopover()) return;
    e.stopPropagation();
    close('esc');
  }
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
  close('panel-focusout');
};

/** focus 触发模式下的触发元素失焦：焦点未移入合法区域则关闭 */
const handleTriggerFocusOut = (e: FocusEvent) => {
  if (!closeOnFocusOut || !model.value) return;
  if (isPointerDown.value) return;
  if (trigger !== 'focus') return;

  const nextFocused = e.relatedTarget as HTMLElement | null;
  if (nextFocused && isEventInside(nextFocused)) return;
  close('trigger-focusout');
};

onBeforeUnmount(() => {
  clearHoverTimer();
  unregisterOpenPopover(close);
  dispose();
});

defineExpose({ open, close, toggle, pinToggle, update });
</script>
