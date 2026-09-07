<template>
  <div v-if="$slots['trigger']" :class="{ 'flex w-full': block }" class="popover-wrapper relative inline-flex">
    <div
      :class="{ 'flex w-full flex-1': block }"
      @click="handleTriggerClick()"
      @contextmenu="handleTriggerContextMenu($event)"
      @focusin="handleTriggerFocusIn()"
      @focusout="handleTriggerFocusOut($event)"
      @mouseenter="handleTriggerMouseEnter()"
      @mouseleave="handleTriggerMouseLeave()"
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
      <Transition :name="transitionName" @after-leave="handleAfterLeave()" appear>
        <div
          v-if="isShown"
          :aria-label
          :aria-modal="false"
          :class="panelClass"
          :style="mergedPanelStyle"
          @focusout="handleFocusOut($event)"
          @keydown="handlePanelKeydown($event)"
          @mouseenter="handlePanelMouseEnter()"
          @mouseleave="handlePanelMouseLeave()"
          class="popover-panel relative z-panel box-border rounded-md border border-glass-border bg-surface-elevated shadow-floating backdrop-blur-xl outline-none"
          ref="panelRef"
          role="dialog"
          tabindex="-1"
        >
          <div v-if="showArrow" :style="arrowStyle" class="popover-arrow pointer-events-none" ref="arrowRef" />
          <slot :close />
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<script lang="ts">
// 双 script 块的 SFC 视为同一模块：import 必须整体置于第一个块顶部（import/first），
// 下方 <script setup> 直接复用这些绑定
import { computed, nextTick, onBeforeUnmount, ref, unref, useTemplateRef, watch } from 'vue';

import { autoUpdate, useFloating } from '@floating-ui/vue';
import { useEventListener } from '@vueuse/core';

import { buildFloatingArrowStyle } from '@/platform/ui/popover/floatingArrow';
import {
  buildFloatingMiddlewares,
  createVirtualElementRect,
  resolveArrowAwareOffset,
} from '@/platform/ui/popover/floatingCore';
import { acquireFloatingZ, FLOATING_Z_BASE, releaseFloatingZ } from '@/platform/ui/popover/floatingZ';
import { registerOpenPopover, unregisterOpenPopover } from '@/platform/ui/popover/popoverRegistry';
import { POPOVER_HOVER_CLOSE_DELAY_MS } from '@/platform/utils/constants';

import type { Placement, VirtualElement } from '@floating-ui/vue';
import type { CSSProperties, MaybeRef } from 'vue';

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
}>();

const emit = defineEmits<{
  (e: 'open'): void;
  (e: 'close'): void;
}>();

const referenceRef = useTemplateRef<HTMLElement>('referenceRef');
const floatingRef = useTemplateRef<HTMLElement>('floatingRef');
const panelRef = useTemplateRef<HTMLDivElement>('panelRef');
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

const {
  floatingStyles: computedFloatingStyles,
  middlewareData,
  placement: currentPlacement,
  update,
} = useFloating(activeReference, floatingRef, {
  strategy: 'fixed',
  placement: computed(() => placement),
  whileElementsMounted: autoUpdate,
  middleware: middlewareList,
});

const floatingStyles = computed<CSSProperties>(() => ({
  ...computedFloatingStyles.value,
}));

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

let hoverTimer: ReturnType<typeof setTimeout> | null = null;
/** 清除 hover 开/关延时计时器 */
const clearHoverTimer = () => {
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
};

watch(
  [floatingRef, activeReference],
  ([el, refEl]) => {
    ownLayerEntry.el = el ?? null;
    if (el && refEl instanceof HTMLElement) globalFloatingReferenceMap.set(el, refEl);
  },
  { immediate: true }
);

// 全局注册：打开中的浮层登记关闭函数，供容器滚动等场景联动关闭（close 幂等，嵌套重复关闭安全）
watch(model, val => {
  if (val) registerOpenPopover(close);
  else unregisterOpenPopover(close);
});

watch(model, async val => {
  if (!val) {
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
  model.value = true;
  emit('open');
};

/** 关闭浮层：复位钉住与右键虚拟锚点，并派发 close */
const close = () => {
  if (!model.value && !isShown.value) return;
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
    close();
  } else {
    open();
  }
};

/**
 * hover 模式的「钉住」切换：打开并钉住（悬停关闭失效，仅点击外部关闭）；
 * 已钉住时再次点击则关闭。
 */
const pinned = ref(false);
/** 钉住切换的具体实现：已钉住并打开时关闭，否则钉住并打开 */
const pinToggle = () => {
  if (model.value && pinned.value) {
    close();
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
const handleTriggerMouseEnter = () => {
  if (trigger !== 'hover' || disabled) return;
  clearHoverTimer();
  hoverTimer = setTimeout(() => {
    open();
  }, hoverOpenDelay);
  // 已打开的浮层（如被钉住的）在鼠标再次进入时置顶，保证「最近交互者在上」
  bringToFront();
};

/** hover 触发：延时关闭（钉住时不关） */
const handleTriggerMouseLeave = () => {
  if (trigger !== 'hover' || pinned.value) return;
  clearHoverTimer();
  hoverTimer = setTimeout(() => {
    close();
  }, hoverCloseDelay);
};

/** 鼠标移入面板：取消关闭计时并置顶 */
const handlePanelMouseEnter = () => {
  if (trigger !== 'hover') return;
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

/** 鼠标移出面板：延时关闭（钉住时不关） */
const handlePanelMouseLeave = () => {
  if (trigger !== 'hover' || pinned.value) return;
  clearHoverTimer();
  hoverTimer = setTimeout(() => {
    close();
  }, hoverCloseDelay);
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
      clearHoverTimer();
    } else if (!hoverTimer) {
      hoverTimer = setTimeout(() => {
        close();
      }, hoverCloseDelay);
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

/** 判断事件目标是否在「合法区域」内：触发元素、面板或嵌套子浮层 */
const isEventInside = (target: EventTarget | null): boolean => {
  if (!(target instanceof Node)) return false;
  if (referenceRef.value?.contains(target)) return true;
  if (panelRef.value?.contains(target)) return true;
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
      // hover 模式：在「面板内容」上按下一次即视为「钉住」，此后悬停离开不再关闭。
      // 仅限面板本身，排除触发按钮——按钮自带 pinToggle 逻辑，若在此一并置位会被它的再次切换关掉自己
      if (trigger === 'hover' && !pinned.value && panelRef.value?.contains(e.target as Node)) {
        pinned.value = true;
      }
      clearHoverTimer();
      return;
    }

    close();
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
    close();
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
    close();
  },
  { capture: true }
);

/** 面板内失焦：焦点移出合法区域时关闭（拖拽过程中忽略） */
const handleFocusOut = (e: FocusEvent) => {
  if (!closeOnFocusOut || !model.value) return;
  // 鼠标拖拽过程中的失焦不关（例如选项 focus 后拖到外面松开）
  if (isPointerDown.value) return;

  const nextFocused = e.relatedTarget as HTMLElement | null;
  // relatedTarget 为 null（焦点移出到浏览器地址栏 / iframe / 开发者工具等）时视为离开合法区域，
  // 保守关闭；拖拽过程中已由上方 isPointerDown 守卫拦截
  if (!nextFocused || !isEventInside(nextFocused)) {
    close();
  }
};

/** focus 触发模式下的触发元素失焦：焦点未移入合法区域则关闭 */
const handleTriggerFocusOut = (e: FocusEvent) => {
  if (!closeOnFocusOut || !model.value) return;
  if (isPointerDown.value) return;
  if (trigger !== 'focus') return;

  const nextFocused = e.relatedTarget as HTMLElement | null;
  if (nextFocused && isEventInside(nextFocused)) return;
  close();
};

/** 面板内 Esc 关闭（兜底路径，正常由全局捕获监听先行处理） */
const handlePanelKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && closeOnEsc) {
    e.preventDefault();
    e.stopPropagation();
    close();
  }
};

onBeforeUnmount(() => {
  clearHoverTimer();
  unregisterOpenPopover(close);
  openedPopovers.delete(ownLayerEntry);
  releaseOwnedZ();
});

defineExpose({ open, close, toggle, pinToggle, update });
</script>
