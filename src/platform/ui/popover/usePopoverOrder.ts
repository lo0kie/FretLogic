import { watch } from 'vue';

import type { VirtualElement } from '@floating-ui/dom';
import type { Ref } from 'vue';

/**
 * 浮层全局状态：必须放在模块作用域（composable 每次实例化都会重新执行函数体），
 * 否则每个实例各自持有独立登记表，跨实例的引用映射与「谁在最上层」判定都会失效
 */

export interface PopoverLayerEntry {
  el: HTMLElement | null;
  /** 是否处于打开态：关场动画期间 model 已为 false 但宿主尚未卸载，需与「真正打开」区分以判定最上层 */
  open: boolean;
}

/**
 * 打开中的浮层实例登记。**插入顺序即进入 top-layer 的先后**（后 show 者在上），
 * 这是本模块唯一的状态来源 —— 层号池已随 2026-09-29 的 top-layer 迁移删除。
 */
export const openedPopovers = new Set<PopoverLayerEntry>();

/** 浮层宿主元素 → 其真实触发元素的引用映射（供子浮层链归属判定沿触发元素逐级上溯） */
export const globalFloatingReferenceMap = new WeakMap<HTMLElement, HTMLElement>();

interface UsePopoverOrderOptions {
  /** 浮层宿主元素 */
  floatingEl: Ref<HTMLElement | null>;
  /** 定位锚点：真实触发元素或虚拟元素（虚拟元素不参与引用映射） */
  reference: Ref<HTMLElement | VirtualElement | null | undefined>;
}

/**
 * 浮层的**层叠顺序所有权**：维护「打开中浮层登记表」与「锚点引用映射」，并据此回答
 * 「本浮层是不是当前最上层」。
 *
 * 与迁移前（层号池 `floatingZ`）的差别只有一处，但它是整件事的前提：**层号不再由我们分配**。
 * 浏览器不暴露「读取 top-layer 顺序」的 API，而 top-layer 的排列规则恰好就是「进入的先后」
 * —— 于是「顺序」必须自记：登记表的插入序即 show 序，`isTopmostOpenLayer` 取表中最后一个
 * open 条目比对即可。原先那套「同号并列时按登记序取首个」的兜底逻辑随层号一并消失（同号在
 * 新机制下不存在）。
 *
 * 原先的后代预算（父面板置顶时不得反超面板内打开中的子浮层）同样不再需要：父面板不重新 show
 * 就不会改变自己在 top-layer 里的位置，子浮层后 show 天然在它之上。
 */
export function usePopoverOrder(options: UsePopoverOrderOptions) {
  const { floatingEl, reference } = options;

  // 本实例在打开中浮层登记表里的条目（el 由下方 watch 填充）
  const ownLayerEntry: PopoverLayerEntry = { el: null, open: false };

  watch(
    [floatingEl, reference],
    ([el, refEl]) => {
      ownLayerEntry.el = el ?? null;
      if (el && refEl instanceof HTMLElement) globalFloatingReferenceMap.set(el, refEl);
    },
    { immediate: true }
  );

  /**
   * 登记为打开中（幂等）。重复 open（如 v-show 退场被打断、@after-leave 不触发）时先摘登记再入表：
   * `Set.add` 对已在表中的对象不会改变插入位置，不先摘就永远停在旧的次序上，
   * 「后开者在上」随之失效。
   */
  const acquireOrder = () => {
    if (ownLayerEntry.open) releaseOrder();
    openedPopovers.add(ownLayerEntry);
    ownLayerEntry.open = true;
  };

  /**
   * 摘除打开态登记（幂等）。必须同时出表：只把 open 置 false 的话，幽灵条目仍留在表中，
   * 后续 `isTopmostOpenLayer` 会把已关闭的层当成最上层，Esc 逐个失效（U10 修复只做一半的残尾）。
   */
  const releaseOrder = () => {
    if (!ownLayerEntry.open) return;
    ownLayerEntry.open = false;
    openedPopovers.delete(ownLayerEntry);
  };

  /**
   * 本浮层是否为当前所有打开中浮层里的最上层（用于 Escape 仅关闭最上层而非全部）。
   *
   * 判据是「登记表最后一个 open 条目 === 自己」：`Set` 的遍历顺序即插入顺序，也就是进入
   * top-layer 的先后，最后一个 open 者即视觉上的最上层。
   */
  const isTopmostOpenLayer = (): boolean => {
    let topmost: PopoverLayerEntry | null = null;
    for (const entry of openedPopovers) if (entry.open) topmost = entry;
    return topmost === ownLayerEntry;
  };

  /** 实例卸载清理：移出登记表 */
  const dispose = () => {
    openedPopovers.delete(ownLayerEntry);
    releaseOrder();
  };

  /** 本实例当前是否已登记为打开中（外部置 v-model=true 的打开路径需要判断是否需补登记） */
  const isOrderOwned = () => ownLayerEntry.open;

  return {
    ownLayerEntry,
    acquireOrder,
    releaseOrder,
    isTopmostOpenLayer,
    isOrderOwned,
    dispose,
  };
}
