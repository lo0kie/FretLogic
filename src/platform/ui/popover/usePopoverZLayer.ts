import { ref, watch } from 'vue';

import { acquireFloatingZ, FLOATING_Z_BASE, releaseFloatingZ } from '@/platform/ui/popover/floatingZ';

import type { VirtualElement } from '@floating-ui/dom';
import type { Ref } from 'vue';

/**
 * 浮层全局状态：必须放在模块作用域（composable 每次实例化都会重新执行函数体），
 * 否则每个实例各自持有独立登记表，跨实例的引用映射与层级预算（父面板不反超子浮层）都会失效
 */

export interface PopoverLayerEntry {
  el: HTMLElement | null;
  z: number;
  /** 是否处于打开态：关场动画期间 model 已为 false 但宿主尚未卸载，需与「真正打开」区分以判定最上层 */
  open: boolean;
}

/** 打开中的浮层实例登记（供 bring-to-front 时计算后代层级预算，保证父面板不反超打开中的子浮层） */
export const openedPopovers = new Set<PopoverLayerEntry>();

/** 浮层宿主元素 → 其真实触发元素的引用映射（供子浮层链归属判定沿触发元素逐级上溯） */
export const globalFloatingReferenceMap = new WeakMap<HTMLElement, HTMLElement>();

interface UsePopoverZLayerOptions {
  /** 浮层宿主元素 */
  floatingEl: Ref<HTMLElement | null>;
  /** 定位锚点：真实触发元素或虚拟元素（虚拟元素不参与引用映射） */
  reference: Ref<HTMLElement | VirtualElement | null | undefined>;
  /** 浮层面板：后代层级预算据此判定「哪些已打开浮层是本浮层的直接后代」 */
  panelEl: Ref<HTMLElement | null>;
  /** 浮层是否处于打开态 */
  isOpen: () => boolean;
}

/**
 * 浮层层级所有权：从层级池获取/归还层号，并维护「打开中浮层登记表」与「锚点引用映射」。
 *
 * - 后代预算：面板内打开中的直接后代浮层（如 Selector 下拉）必须保持在本面板之上，
 *   置顶时层号不得超过其中最低者，否则父面板会反超并盖住子浮层；
 * - zOwned 标记：组件实例常驻不卸载，floatingZIndex 会残留上次分配的旧值；
 *   若不做标记就无条件 release，会把池中他人占用的同号层误删。
 */
export function usePopoverZLayer(options: UsePopoverZLayerOptions) {
  const { floatingEl, reference, panelEl, isOpen } = options;

  // 本实例在打开中浮层登记表里的条目（el 由下方 watch 填充）
  const ownLayerEntry: PopoverLayerEntry = { el: null, z: FLOATING_Z_BASE, open: false };
  const floatingZIndex = ref<number>(FLOATING_Z_BASE);
  let zOwned = false;

  watch(
    [floatingEl, reference],
    ([el, refEl]) => {
      ownLayerEntry.el = el ?? null;
      if (el && refEl instanceof HTMLElement) globalFloatingReferenceMap.set(el, refEl);
    },
    { immediate: true }
  );

  /** 从层级池获取新层号并登记到打开中浮层表（含后代层级预算约束） */
  const acquireOwnedZ = () => {
    let budget = Number.POSITIVE_INFINITY;
    if (panelEl.value) {
      for (const entry of openedPopovers) {
        if (entry === ownLayerEntry || !entry.el) continue;
        const trigger = globalFloatingReferenceMap.get(entry.el);
        if (trigger && panelEl.value.contains(trigger)) {
          budget = Math.min(budget, entry.z);
        }
      }
    }
    floatingZIndex.value = acquireFloatingZ(budget === Number.POSITIVE_INFINITY ? undefined : budget - 1);
    ownLayerEntry.z = floatingZIndex.value;
    // 取得层号即视为「真正打开」：登记到打开中浮层表并置打开态（Set.add 幂等，重复获取无副作用）
    openedPopovers.add(ownLayerEntry);
    ownLayerEntry.open = true;
    zOwned = true;
    return floatingZIndex.value;
  };

  /** 归还本实例持有的层号（未持有时空操作） */
  const releaseOwnedZ = () => {
    if (!zOwned) return;
    releaseFloatingZ(floatingZIndex.value);
    zOwned = false;
  };

  /** 已打开的浮层重新分配当前最高层级（bring-to-front）；未打开时为空操作 */
  const bringToFront = () => {
    if (!isOpen()) return;
    releaseOwnedZ();
    acquireOwnedZ();
  };

  /** 判断本浮层是否为当前所有打开中浮层里 z 最高的（即最上层），用于 Escape 仅关闭最上层而非全部 */
  const isTopmostOpenPopover = (): boolean => {
    let topZ = -Infinity;
    for (const entry of openedPopovers) {
      if (entry.open) topZ = Math.max(topZ, entry.z);
    }
    return floatingZIndex.value >= topZ;
  };

  /** 实例卸载清理：移出登记表并归还层号 */
  const dispose = () => {
    openedPopovers.delete(ownLayerEntry);
    releaseOwnedZ();
  };

  /** 本实例当前是否在层级池中持有层号（外部置 v-model=true 的打开路径需要判断是否需补分配） */
  const isZOwned = () => zOwned;

  return {
    ownLayerEntry,
    floatingZIndex,
    acquireOwnedZ,
    releaseOwnedZ,
    bringToFront,
    isTopmostOpenPopover,
    isZOwned,
    dispose,
  };
}
