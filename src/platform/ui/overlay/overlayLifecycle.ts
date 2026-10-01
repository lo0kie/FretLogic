/**
 * 模态浮层（Modal / Drawer）共享的开关生命周期：
 * 打开 → 收拢动作 + body 滚动锁 + 分配模态层号 + 挂全局 Esc + 入阻断栈 + 焦点移入面板；
 * 关闭 → 解绑 Esc + 出栈 + 复位滚动锁 + 焦点归还触发器；离场动画结束 → 释放层号；
 * 卸载 → 全量兜底清理（含焦点归还）。
 * BaseModal 与 BaseDrawer 此前各自维护一份逐字重复的实现，本 composable 为唯一来源。
 *
 * 焦点管理为何属于这里：遮罩、滚动锁、inert 都只处理「鼠标与视觉」，焦点是独立的第三条通道，
 * 而且正是键盘/读屏用户唯一的通道——此前三条通道里唯一没被这条生命周期覆盖的就是它。
 */
import { nextTick, onActivated, onDeactivated, onScopeDispose, ref, watch } from 'vue';

import { useEventListener } from '@vueuse/core';

import { isClient } from '@/platform/utils/common';
import { createHook } from '@/platform/utils/hook';

import { registerOverlay, unregisterOverlay } from './overlayStack';

import type { Ref } from 'vue';

/**
 * 模态浮层（Modal / Drawer）的层号分配。
 *
 * 为什么这里还留着一段层号逻辑：非模态浮层（菜单 / 下拉 / 提示 / 贴边面板）已改由浏览器 top-layer
 * 承担层叠来源，它们原先共用的层号池（原 `platform/ui/popover/floatingZ.ts`）随之删除。模态系走的是
 * 另一条路径（改 `<dialog showModal()` 那一步尚未落地），仍是 z-index，故这里保留**只服务模态**的
 * 最小实现 —— 没有第二个调用方，不必也不该再做成通用池。
 *
 * 语义与迁移前的池完全一致，只有范围收窄：
 * - 「当前最高占用 + 1」：保证后开的模态压住先开的；
 * - 上限 11000：静态高层（`--z-top` 12000 / `--z-toast` 13000）必须恒在模态之上，故层号不得越过它。
 *   正常并发远达不到该数量，clamp 只是防御性兜底。
 */
const OVERLAY_Z_BASE = 2000; // 对应 tokens.scss 的 --z-overlay（模态遮罩）
const OVERLAY_Z_CEILING = 11000;
const activeOverlayZ = new Set<number>();

/** 分配一个模态层号（当前最高占用 + 1，上限见 OVERLAY_Z_CEILING），并登记为占用中 */
const acquireOverlayZ = (): number => {
  let max = OVERLAY_Z_BASE;
  for (const z of activeOverlayZ) if (z > max) max = z;

  // 上限表达的是**上界**，完全可能正好等于另一个模态已占用的号。直接取 min 会让两个模态并列：
  // z-index 由 DOM 顺序裁决（后开者在上静默失效），且任一先释放就把这个共享号从集合里摘掉。
  // 故向下让到最近的空闲位；极端情况下方全满则退回 max + 1 —— 宁可反超，也不并列。
  let next = Math.min(max + 1, OVERLAY_Z_CEILING);
  while (next > OVERLAY_Z_BASE && activeOverlayZ.has(next)) next -= 1;
  if (activeOverlayZ.has(next)) next = Math.min(max + 1, OVERLAY_Z_CEILING);
  activeOverlayZ.add(next);
  return next;
};

/** 释放模态层号，供后续模态复用 */
const releaseOverlayZ = (z: number): void => void activeOverlayZ.delete(z);

/**
 * 模块级 body 滚动锁引用计数。
 * 原先每个浮层实例各自建一个 vueuse useScrollLock：其 isLocked 无跨实例协调，多浮层叠加时会出现三类问题——
 * ① 后开的浮层误以为自己已锁（A 持锁期间 B 创建，immediate watch 读到 body 已是 hidden，直接把自己的
 *   isLocked 置 true）；② 先关的浮层把后开的活锁摘掉（B 卸载时 vueuse 的 cleanup 早于本模块 onScopeDispose，
 *   先把 body 还原，本模块重算 isBodyLocked 置 false）；③ A 关后 B 单独开着时背景仍可滚。
 * 改为全局计数：每打开一个 locksBody 的浮层 +1、关闭/卸载 -1，仅当计数归零才真正还原 body 的 overflow。
 * 与 vueuse 同款：只动 document.body.style.overflow，无滚动条宽度补偿等隐藏成本，替掉它没有额外负担。
 */
let bodyLockCount = 0;
let bodyOriginalOverflow = '';

const lockBodyScroll = () => {
  if (!isClient) return;
  bodyLockCount += 1;
  if (bodyLockCount === 1) {
    bodyOriginalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
};

const unlockBodyScroll = () => {
  if (!isClient) return;
  if (bodyLockCount === 0) return;
  bodyLockCount -= 1;
  if (bodyLockCount === 0) {
    document.body.style.overflow = bodyOriginalOverflow;
    bodyOriginalOverflow = '';
  }
};

/**
 * 「模态在屏」登记：从**打开瞬间**（engage，早于首帧）到**离场动画结束**（after-leave；停用 / 卸载兜底）。
 *
 * 为什么另起一份、不复用 `overlayStack` 的激活栈：那一份的进出时机是给 inert 用的（入栈在 nextTick、
 * 出栈在关闭瞬间），与这里要问的「屏上还有没有模态」两个时机都对不上 —— 照它让位，会在抽屉还在滑出
 * 时就把下层面板放回顶层。
 *
 * 唯一消费方是非模态浮层（`BaseFloatingPanel`）：它们走浏览器 top-layer，而 top-layer 恒在一切
 * z-index 之上，模态一起就得先出层让位，否则面板会盖住模态（见该组件的「模态让位」一节）。
 */
const presenceHook = createHook<[present: boolean]>();
let presentModalCount = 0;

/** 订阅「模态在屏」变化，返回退订函数；仅在计数**跨过 0** 时通知 */
export const onModalLayerPresenceChange = (listener: (present: boolean) => void): (() => void) =>
  presenceHook.on(listener);

/** 增减在屏模态计数，跨过 0 时通知（广播取快照：监听方可能在回调里退订自己） */
const changeModalPresence = (delta: 1 | -1): void => {
  const wasPresent = presentModalCount > 0;
  presentModalCount = Math.max(0, presentModalCount + delta);
  const isPresent = presentModalCount > 0;
  if (wasPresent === isPresent) return;
  presenceHook.emit(isPresent);
};

export interface OverlayLifecycleOptions {
  /** 浮层开关（v-model:visible） */
  visible: Ref<boolean>;
  /** 浮层根容器元素（阻断栈以该元素判栈顶） */
  overlayRef: Ref<HTMLElement | null>;
  /**
   * 打开后接收初始焦点的面板元素（Modal 传带 tabindex="-1" 的对话框卡片）。
   * 缺省回落到 overlayRef——但外层容器通常不可聚焦，focus() 会静默无效，故实际调用方都应显式传。
   */
  panelRef?: Ref<HTMLElement | null>;
  /** Esc 处理器：打开期间挂到 window keydown，关闭/卸载时解绑 */
  onEscape: (e: KeyboardEvent) => void;
  /** 该浮层是否参与 body 滚动锁（Modal 恒 true；Drawer 仅遮罩模式） */
  locksBody: () => boolean;
  /** 打开瞬间的附加动作（如 Drawer 收拢全局存量 Popover） */
  onOpen?: () => void;
  /** 离场动画结束的附加动作（如派发 closed 事件），在层号释放之后调用 */
  onAfterLeave?: () => void;
}

export function useOverlayLifecycle(opts: OverlayLifecycleOptions) {
  /** 本实例是否持有 body 滚动锁：仅 locksBody() 为 true 的浮层在打开时 +1 计数、关闭/卸载时 -1（全局计数见上方） */
  let holdsBodyLock = false;

  // ---------- 动态层号：打开即取号，离场动画结束才释放（保证退场期间仍压住下层浮层） ----------
  /** 本实例当前占用的层号；0 表示未占用（消费侧据此决定要不要写 z-index，见 BaseModal / BaseDrawer） */
  const overlayZ = ref(0);
  const acquire = () => {
    overlayZ.value = acquireOverlayZ();
  };
  /** 幂等：after-leave 与卸载兜底可能各调一次，未占用时直接返回 */
  const releaseZ = () => {
    if (overlayZ.value === 0) return;
    releaseOverlayZ(overlayZ.value);
    overlayZ.value = 0;
  };

  // ---------- 全局键盘监听 ----------
  let stopKeydownListener: (() => void) | null = null;
  const clearListeners = () => {
    stopKeydownListener?.();
    stopKeydownListener = null;
  };

  // ---------- 焦点管理 ----------
  /** 打开前的焦点位置（触发器）：关闭时归还，键盘用户才能「从哪来回哪去」 */
  let previouslyFocused: HTMLElement | null = null;

  /**
   * 把焦点移入浮层面板。
   *
   * 为什么必须有：body 滚动锁 + 后台 inert 都不管焦点——打开后焦点仍停在触发器上，读屏软件不会
   * 播报这个对话框，键盘用户要按一次 Tab 才「碰巧」进到内容里；而 Esc 关闭与 Tab 圈定的语义都
   * 建立在「焦点已在浮层内」这个前提上（useOverlayFocusTrap 对 activeElement === 面板 的处理
   * 就是为此写的，只是从未有人在打开时把焦点送进去）。
   *
   * 落点取**面板自身**而非第一个可聚焦元素：面板带 tabindex="-1"，聚焦它会让读屏播报对话框的
   * role 与名称，且不会把焦点意外落在「删除」这类恰好排在最前的按钮上；随后按 Tab 自然进入首个
   * 控件。面板不可聚焦时 focus() 是空操作，不会报错。
   */
  const focusPanel = () => {
    if (!isClient) return;
    // preventScroll 必需：抽屉面板在 focus 落地时仍处于 translateX(100%) 的离屏 enter 相位，
    // 默认 focus() 会触发 scroll-into-view，把 overflow-hidden 的遮罩容器滚出一段 scrollLeft，
    // 与随后的 transform 过渡叠加表现为「整个抽屉冲过头再弹回」；Modal 卡片同理（缩放相位）
    (opts.panelRef ?? opts.overlayRef).value?.focus({ preventScroll: true });
  };

  /** 关闭时把焦点归还给打开前的元素（见下方两处调用的时机说明） */
  const restoreFocus = () => {
    if (!isClient) return;
    const target = previouslyFocused;
    previouslyFocused = null;
    if (!target?.isConnected) return;

    // 只在「焦点仍留在浮层里」或「已丢给 body」时归还：若关闭期间用户已经把焦点移到别处
    // （紧接着点了另一个按钮），抢回来是打断操作而不是帮忙。点遮罩关闭时 activeElement 就是
    // body（div 不可聚焦），故这一条同时覆盖了鼠标关闭路径。
    const active = document.activeElement;
    const overlay = opts.overlayRef.value;
    const stillInsideOverlay = active instanceof HTMLElement && overlay !== null && overlay.contains(active);
    const focusLost = active === null || active === document.body;
    if (!stillInsideOverlay && !focusLost) return;

    // preventScroll 与 focusPanel 同因（见上）：归还焦点是「把焦点还给谁」，不是「把谁带进视野」。
    // 触发器常在可滚动容器里，裸 focus() 会替用户把该容器滚回触发器处，撤销他关闭浮层后那段滚动。
    target.focus({ preventScroll: true });
  };

  /**
   * 本实例当前是否持有打开态资源（滚动锁 / Esc 监听 / 阻断栈登记）。
   *
   * 有它才有幂等：登记与释放由三条路径共用 —— v-model 开关、组件卸载、**KeepAlive 的激活与停用**
   * （见下方 onActivated / onDeactivated），任一路径重复调用都不会重复加锁、重复入栈。
   */
  let engaged = false;

  /**
   * 本实例是否已计入「模态在屏」。
   *
   * 起点与 engaged 同源（打开瞬间，早于首帧 —— 晚一帧就会闪出「面板先盖住抽屉、再让位」），
   * 终点却更晚：要等**离场动画结束**。关闭瞬间就减计数的话，抽屉还在往右滑、面板已经回到顶层
   * 把它盖住，观感是「抽屉凭空消失」。
   */
  let holdsPresence = false;
  const holdPresence = () => {
    if (holdsPresence) return;
    holdsPresence = true;
    changeModalPresence(1);
  };
  const dropPresence = () => {
    if (!holdsPresence) return;
    holdsPresence = false;
    changeModalPresence(-1);
  };

  /** 登记打开态资源（幂等） */
  const engage = () => {
    if (engaged) return;
    engaged = true;
    // 模态在屏计数与打开同步（不等到 nextTick 入栈）：下层的非模态浮层要在此刻就让位
    holdPresence();

    // 必须在焦点被移入浮层**之前**记录来路：否则重复打开时记到的是浮层内部元素
    const active = isClient ? document.activeElement : null;
    previouslyFocused = active instanceof HTMLElement ? active : null;
    opts.onOpen?.();
    // 打开即持锁：计数 +1（仅 locksBody 的浮层参与，非遮罩 Drawer 不动 body）
    if (opts.locksBody()) {
      lockBodyScroll();
      holdsBodyLock = true;
    }
    // 层号在打开瞬间即刻分配（早于内容渲染）：保证与并发打开的浮层时序严格一致
    acquire();
    stopKeydownListener = useEventListener(window, 'keydown', opts.onEscape);
    // 待 DOM 挂载后加入激活栈：nextTick 保证入栈顺序与 watch 触发顺序严格一致
    void nextTick(() => {
      // 必须复查：这一 tick 之内浮层可能已经关掉（程序化 setVisible(true) 后同拍置 false、
      // 或打开即被上层撤销），也可能整页被 KeepAlive 停用。关闭 / 停用分支跑的时候元素尚未登记，
      // 它的 unregister 是空转，于是这一行会把一个「已经关掉的浮层」永久留在栈里 ——
      // 栈非空 ⇒ 除它以外整页 inert，而它自己又是隐藏的，表现就是「全页点不动、Esc 也不管用」。
      if (!engaged) return;
      if (opts.overlayRef.value) registerOverlay(opts.overlayRef.value);

      // 焦点同样要等这一 tick：关闭即销毁 / v-if 的面板此刻才挂上，早于此调用拿不到元素
      focusPanel();
    });
  };

  /**
   * 释放打开态资源（幂等）。**不含层号与焦点**，两者各有自己的时机：
   * 层号要留到离场动画结束（见 handleAfterLeave），焦点要留到关闭分支 / 卸载分支显式归还。
   */
  const releaseOpenResources = () => {
    if (!engaged) return;
    engaged = false;
    clearListeners();
    if (opts.overlayRef.value) unregisterOverlay(opts.overlayRef.value);
    // 仅参与滚动锁的浮层（遮罩模式）在释放时归还本实例持有的锁；计数归零才真正解锁 body
    if (holdsBodyLock) {
      unlockBodyScroll();
      holdsBodyLock = false;
    }
  };

  watch(
    opts.visible,
    isOpen => {
      if (!isOpen) {
        releaseOpenResources();
        // 归还时机取「关闭瞬间」而非离场动画结束：面板随后即被移除，届时焦点会被浏览器丢给 body，
        // 读屏用户就「掉」在了页面开头。
        restoreFocus();
      } else engage();
    },
    { immediate: true }
  );

  /** 离场动画结束（Transition @after-leave）时调用：释放层号供后续浮层复用 */
  const handleAfterLeave = () => {
    releaseZ();
    // 「模态在屏」到这里才算结束：此刻面板已彻底离开视野，下层的非模态浮层可以回层
    dropPresence();
    opts.onAfterLeave?.();
  };

  /**
   * KeepAlive 停用：宿主页面被缓存切走时释放打开态资源。
   *
   * 少了这一对钩子，切走页面既不触发 visible 变化、也不触发卸载 —— 滚动锁不还、阻断栈不出、
   * window 上的 Esc 监听不解，表现是「切过去的新页面整页点不动、背景也滚不动」，
   * 而消费侧（如 ChordPickerPanel）此前只能在切页处各自打补丁。
   *
   * 刻意**不**归还焦点：页面已经切走，把焦点按回已被缓存的触发器只会落到不可见元素上。
   * 重新激活时若 v-model 仍为真（缓存期间没被关掉）则原样重新登记。
   */
  onDeactivated(() => {
    releaseOpenResources();
    // 「模态在屏」一并结束：被缓存的那一页已不在屏上，留着计数会让下层面板永久停在让位态
    // （它自己也随页面被缓存，回层是空操作，重新激活时由 engage 重新计数）
    dropPresence();
  });
  onActivated(() => {
    if (opts.visible.value) engage();
  });

  // 卸载兜底：浮层在离场动画完成前被卸载（如父组件销毁）时 after-leave 不会触发
  onScopeDispose(() => {
    releaseOpenResources();
    releaseZ();
    dropPresence();
    // 组件在打开状态被卸载（父级销毁）时也归还焦点，否则键盘用户同样会「掉」在页面里
    restoreFocus();
  });

  return { overlayZ, releaseZ, handleAfterLeave };
}
