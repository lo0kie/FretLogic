/**
 * 模态浮层（Modal / Drawer）共享的开关生命周期：
 * 打开 → 收拢动作 + body 滚动锁 + 从浮层池取号 + 挂全局 Esc + 入阻断栈；
 * 关闭 → 解绑 Esc + 出栈 + 复位滚动锁；离场动画结束 → 释放层号；卸载 → 全量兜底清理。
 * BaseModal 与 BaseDrawer 此前各自维护一份逐字重复的实现，本 composable 为唯一来源。
 */
import { nextTick, onScopeDispose, ref, watch } from 'vue';

import { useEventListener, useScrollLock } from '@vueuse/core';

import { useFloatingZ } from '@/platform/ui/popover/floatingZ';

import { hasActiveOverlays, isClient, registerOverlay, unregisterOverlay } from './overlayStack';

import type { Ref } from 'vue';

export interface OverlayLifecycleOptions {
  /** 浮层开关（v-model:visible） */
  visible: Ref<boolean>;
  /** 浮层根容器元素（阻断栈以该元素判栈顶） */
  overlayRef: Ref<HTMLElement | null>;
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
  const isBodyLocked = isClient ? useScrollLock(document.body) : ref(false);

  // ---------- 动态层号：打开即取号，离场动画结束才释放（保证退场期间仍压住下层浮层） ----------
  const { z: overlayZ, acquire, release: releaseZ } = useFloatingZ();

  // ---------- 全局键盘监听 ----------
  let stopKeydownListener: (() => void) | null = null;
  const clearListeners = () => {
    stopKeydownListener?.();
    stopKeydownListener = null;
  };

  watch(
    opts.visible,
    isOpen => {
      if (!isOpen) {
        clearListeners();
        if (opts.overlayRef.value) {
          unregisterOverlay(opts.overlayRef.value);
        }
        // 仅参与滚动锁的浮层（遮罩模式）复位锁：栈内还有其它阻断层时保持锁定
        isBodyLocked.value = opts.locksBody() && hasActiveOverlays() > 0;
      } else {
        opts.onOpen?.();
        isBodyLocked.value = opts.locksBody();
        // 层号在打开瞬间即刻分配（早于内容渲染）：保证与并发打开的浮层时序严格一致
        acquire();
        stopKeydownListener = useEventListener(window, 'keydown', opts.onEscape);
        // 待 DOM 挂载后加入激活栈：nextTick 保证入栈顺序与 watch 触发顺序严格一致
        void nextTick(() => {
          if (opts.overlayRef.value) {
            registerOverlay(opts.overlayRef.value);
          }
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
    if (opts.overlayRef.value) {
      unregisterOverlay(opts.overlayRef.value);
    }
    isBodyLocked.value = opts.locksBody() && hasActiveOverlays() > 0;
  });

  return { overlayZ, releaseZ, handleAfterLeave };
}
