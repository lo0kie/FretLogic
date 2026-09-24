/**
 * 模态浮层（Modal / Drawer）共享的开关生命周期：
 * 打开 → 收拢动作 + body 滚动锁 + 从浮层池取号 + 挂全局 Esc + 入阻断栈 + 焦点移入面板；
 * 关闭 → 解绑 Esc + 出栈 + 复位滚动锁 + 焦点归还触发器；离场动画结束 → 释放层号；
 * 卸载 → 全量兜底清理（含焦点归还）。
 * BaseModal 与 BaseDrawer 此前各自维护一份逐字重复的实现，本 composable 为唯一来源。
 *
 * 焦点管理为何属于这里：遮罩、滚动锁、inert 都只处理「鼠标与视觉」，焦点是独立的第三条通道，
 * 而且正是键盘/读屏用户唯一的通道——此前三条通道里唯一没被这条生命周期覆盖的就是它。
 */
import { nextTick, onScopeDispose, watch } from 'vue';

import { useEventListener } from '@vueuse/core';

import { useFloatingZ } from '@/platform/ui/popover/floatingZ';

import { isClient, registerOverlay, unregisterOverlay } from './overlayStack';

import type { Ref } from 'vue';

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
  const { z: overlayZ, acquire, release: releaseZ } = useFloatingZ();

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

  watch(
    opts.visible,
    isOpen => {
      if (!isOpen) {
        clearListeners();
        if (opts.overlayRef.value) unregisterOverlay(opts.overlayRef.value);

        // 仅参与滚动锁的浮层（遮罩模式）在关闭时释放本实例持有的锁；计数归零才真正解锁 body
        if (holdsBodyLock) {
          unlockBodyScroll();
          holdsBodyLock = false;
        }
        // 归还时机取「关闭瞬间」而非离场动画结束：面板随后即被移除，届时焦点会被浏览器丢给 body，
        // 读屏用户就「掉」在了页面开头。
        restoreFocus();
      } else {
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
          // 必须复查开关：这一 tick 之内浮层可能已经关掉（程序化 setVisible(true) 后同拍置 false、
          // 或打开即被上层撤销）。关闭分支跑的时候元素尚未登记，它的 unregister 是空转，
          // 于是这一行会把一个「已经关掉的浮层」永久留在栈里 —— 栈非空 ⇒ 除它以外整页 inert，
          // 而它自己又是隐藏的，表现就是「全页点不动、Esc 也不管用」。
          if (!opts.visible.value) return;
          if (opts.overlayRef.value) registerOverlay(opts.overlayRef.value);

          // 焦点同样要等这一 tick：关闭即销毁 / v-if 的面板此刻才挂上，早于此调用拿不到元素
          focusPanel();
        });
      }
    },
    { immediate: true }
  );

  /** 离场动画结束（Transition @after-leave）时调用：释放层号供后续浮层复用 */
  const handleAfterLeave = () => {
    releaseZ();
    opts.onAfterLeave?.();
  };

  // 卸载兜底：浮层在离场动画完成前被卸载（如父组件销毁）时 after-leave 不会触发
  onScopeDispose(() => {
    clearListeners();
    releaseZ();
    if (opts.overlayRef.value) unregisterOverlay(opts.overlayRef.value);

    // 打开状态被卸载时释放本实例持有的锁（计数归零才真正解锁 body）
    if (holdsBodyLock) {
      unlockBodyScroll();
      holdsBodyLock = false;
    }
    // 组件在打开状态被卸载（父级销毁）时也归还焦点，否则键盘用户同样会「掉」在页面里
    restoreFocus();
  });

  return { overlayZ, releaseZ, handleAfterLeave };
}
