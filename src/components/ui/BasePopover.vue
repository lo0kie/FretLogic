<template>
  <div v-if="$slots['trigger']" class="popover-wrapper relative inline-flex" :class="{ 'flex w-full': block }">
    <div
      ref="referenceRef"
      class="popover-trigger inline-flex"
      :class="{ 'flex flex-1 w-full': block }"
      @mouseenter="handleTriggerMouseEnter"
      @mouseleave="handleTriggerMouseLeave"
      @focusin="handleTriggerFocusIn"
      @focusout="handleTriggerFocusOut"
      @click="handleTriggerClick"
      @contextmenu="handleTriggerContextMenu"
    >
      <slot name="trigger" :is-open="model" :toggle :open :close :pin-toggle />
    </div>
  </div>

  <Teleport :to="teleportTo ?? 'body'" :disabled="disabledTeleport">
    <div
      v-if="isMounted"
      ref="floatingRef"
      data-floating-layer
      class="popover-floating-host pointer-events-auto"
      :style="[floatingStyles, { zIndex: floatingZIndex }]"
    >
      <Transition appear :name="transitionName" @after-leave="handleAfterLeave">
        <div
          v-if="isShown"
          ref="panelRef"
          role="dialog"
          :aria-modal="false"
          :aria-label
          class="popover-panel relative z-10 box-border outline-none bg-bg-elevated border border-glass-border rounded-md shadow-floating backdrop-blur-xl origin-top"
          :class="panelClass"
          :style="panelStyle"
          tabindex="-1"
          @mouseenter="handlePanelMouseEnter"
          @mouseleave="handlePanelMouseLeave"
          @focusout="handleFocusOut"
          @keydown="handlePanelKeydown"
        >
          <div v-if="showArrow" ref="arrowRef" class="popover-arrow pointer-events-none" :style="arrowStyle" />
          <slot :close />
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<script lang="ts">
const globalFloatingReferenceMap = new WeakMap<HTMLElement, HTMLElement>();

interface PopoverLayerEntry {
  el: HTMLElement | null;
  z: number;
}

/** 打开中的浮层实例登记（供 bring-to-front 时计算后代层级预算，保证父面板不反超打开中的子浮层） */
const openedPopovers = new Set<PopoverLayerEntry>();
</script>

<script setup lang="ts">
import { buildFloatingArrowStyle } from '@/utils/ui/floatingArrow';
import { acquireFloatingZ, FLOATING_Z_BASE, releaseFloatingZ } from '@/utils/ui/floatingZ';
import {
  autoUpdate,
  flip,
  arrow as floatingArrow,
  size as floatingSize,
  limitShift,
  offset,
  shift,
  useFloating,
  type Middleware,
  type Placement,
  type VirtualElement,
} from '@floating-ui/vue';
import { useEventListener } from '@vueuse/core';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  unref,
  useTemplateRef,
  watch,
  type CSSProperties,
  type MaybeRef,
} from 'vue';

const {
  trigger = 'click',
  hoverOpenDelay = 50,
  hoverCloseDelay = 150,
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
  autoFocus = false,
} = defineProps<{
  trigger?: 'click' | 'hover' | 'focus' | 'contextmenu';
  hoverOpenDelay?: number;
  hoverCloseDelay?: number;
  placement?: Placement;
  disabled?: boolean;
  offsetDistance?: number;
  closeOnClickOutside?: boolean;
  closeOnEsc?: boolean;
  closeOnFocusOut?: boolean;
  matchTriggerWidth?: boolean;
  matchTriggerWidthStrategy?: 'width' | 'minWidth';
  showArrow?: boolean;
  block?: boolean;
  teleportTo?: string | HTMLElement;
  disabledTeleport?: boolean;
  ariaLabel?: string;
  panelClass?: string | string[] | Record<string, boolean>;
  panelStyle?: CSSProperties;
  transitionName?: string;
  virtualRef?: MaybeRef<VirtualElement | null>;
  autoFocus?: boolean;
}>();

const emit = defineEmits<{
  (e: 'open'): void;
  (e: 'close'): void;
}>();

const model = defineModel<boolean>({ default: false });
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
const ownLayerEntry: PopoverLayerEntry = { el: null, z: FLOATING_Z_BASE };

const activeReference = computed(() => unref(virtualRef) || contextMenuVirtualRef.value || referenceRef.value);

const middlewareList = computed(() => {
  // showArrow 时箭头外露 ≈ size·√2/2 - 1（size=14 → ≈9px），浮层间距需大于外露量，否则箭头会戳到触发元素
  const effectiveOffset = showArrow ? Math.max(offsetDistance, 12) : offsetDistance;
  const m: Middleware[] = [
    offset(effectiveOffset),
    flip({
      fallbackPlacements: ['top', 'bottom-end', 'bottom-start', 'top-end', 'top-start', 'left', 'right'],
      padding: 8,
    }),
    shift({ padding: 12, limiter: limitShift() }),
  ];
  if (matchTriggerWidth) {
    m.push(
      floatingSize({
        apply({ rects, elements }) {
          if (matchTriggerWidthStrategy === 'minWidth') {
            Object.assign(elements.floating.style, {
              minWidth: `${rects.reference.width}px`,
            });
          } else {
            Object.assign(elements.floating.style, {
              width: `${rects.reference.width}px`,
            });
          }
        },
      })
    );
  }
  if (showArrow) {
    m.push(floatingArrow({ element: () => arrowRef.value, padding: 6 }));
  }
  return m;
});

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

const arrowStyle = computed<CSSProperties>(() => {
  if (!showArrow || !middlewareData.value.arrow) return {};
  const { x, y } = middlewareData.value.arrow;

  return buildFloatingArrowStyle({
    arrowX: x,
    arrowY: y,
    placement: currentPlacement.value || placement,
    background: 'var(--color-bg-elevated)',
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
  isMounted.value = true;
  model.value = true;
  emit('open');
};

/** 关闭浮层：复位钉住与右键虚拟锚点，并派发 close */
const close = () => {
  if (!model.value && !isShown.value) return;
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
  contextMenuVirtualRef.value = {
    getBoundingClientRect() {
      return {
        x: e.clientX,
        y: e.clientY,
        top: e.clientY,
        bottom: e.clientY,
        left: e.clientX,
        right: e.clientX,
        width: 0,
        height: 0,
      };
    },
  };
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
    isPointerDown.value = true;

    if (!closeOnClickOutside || !model.value || !isShown.value) return;
    if (e.button === 2) return; // 右键留给 ContextMenu
    if (isEventInside(e.target)) return;

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

useEventListener(
  window,
  'keydown',
  (e: KeyboardEvent) => {
    if (!model.value || !closeOnEsc) return;
    if (e.key !== 'Escape') return;
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
  if (nextFocused) {
    if (isEventInside(nextFocused)) return;
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
  openedPopovers.delete(ownLayerEntry);
  releaseOwnedZ();
});

defineExpose({ open, close, toggle, pinToggle, update });
</script>
