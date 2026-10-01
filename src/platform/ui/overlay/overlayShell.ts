/**
 * 模态浮层（Modal / Drawer）共享的「壳层」接线：
 * 把 overlayGuards / overlayLifecycle 的五个原语（统一关闭入口、Esc 栈顶判定、
 * 开关生命周期、Tab 焦点圈定、遮罩点击关闭）按固定次序组装为一次接线，并回传
 * 模板所需的全部处理器。BaseModal 与 BaseDrawer 此前各自维护这段逐字同构的
 * 接线，本模块为唯一来源；两壳的差异（Esc 门禁 / body 滚动锁 / 遮罩门禁 /
 * 打开瞬间动作）全部经 options 注入，composable 内不含任何组件私有逻辑。
 */
import { useOverlayCloseGuard, useOverlayEscape, useOverlayFocusTrap, useOverlayMaskClose } from './overlayGuards';
import { useOverlayLifecycle } from './overlayLifecycle';
import { isTopOverlay } from './overlayStack';

import type { ModalCloseReason } from '@/platform/ui/modal/modalCloseReason';
import type { Ref } from 'vue';

/** 模态浮层共享的对外事件：cancel/closed 由本模块接线，open/opened/close 由模板的 Transition 直发 */
export interface OverlayShellEmits {
  /** 关闭时携带来源（X / 蒙层 / ESC），程序化置 visible=false 不触发 */
  (e: 'cancel', reason: ModalCloseReason): void;
  (e: 'open'): void;
  (e: 'opened'): void;
  (e: 'close'): void;
  (e: 'closed'): void;
}

export interface OverlayShellOptions {
  /** 浮层开关（v-model:visible） */
  visible: Ref<boolean>;
  /** 浮层根容器（遮罩层）：Esc 栈顶判定与阻断栈登记都以它为准 */
  overlayRef: Ref<HTMLElement | null>;
  /** 打开后接收初始焦点与 Tab 圈定的面板元素（对话框卡片 / 抽屉面板，带 tabindex="-1"） */
  panelRef: Ref<HTMLElement | null>;
  /** defineEmits 返回的 emit（需含 OverlayShellEmits 的全部事件签名） */
  emit: OverlayShellEmits;
  /** 关闭锁门禁（closeLocked） */
  isLocked: () => boolean;
  /** beforeClose 拦截器读取门禁 */
  getBeforeClose: () => (() => boolean | Promise<boolean>) | undefined;
  /** Esc 关闭门禁（noKeyboard / closeLocked 及组件私有屏蔽条件） */
  escapeEnabled: () => boolean;
  /** 是否参与 body 滚动锁（Modal 恒 true；Drawer 仅遮罩模式） */
  locksBody: () => boolean;
  /** 遮罩点击关闭门禁（keepOnMask / noMask 及组件私有屏蔽条件） */
  canCloseMask: () => boolean;
  /** 打开瞬间的附加动作（如收拢全局存量 Popover） */
  onOpen?: () => void;
}

/**
 * 组装浮层壳层：返回值直接解构给模板与脚本使用。
 * 注意须在 setup 内同步调用——内部的 useOverlayLifecycle 要注册
 * onActivated / onDeactivated / onScopeDispose 钩子。
 */
export function useOverlayShell(opts: OverlayShellOptions) {
  const close = useOverlayCloseGuard({
    visible: opts.visible,
    isLocked: opts.isLocked,
    getBeforeClose: opts.getBeforeClose,
    onCancel: reason => opts.emit('cancel', reason),
  });

  const handleEscape = useOverlayEscape({
    enabled: opts.escapeEnabled,
    isTop: () => isTopOverlay(opts.overlayRef.value),
    close,
  });

  const { overlayZ, handleAfterLeave } = useOverlayLifecycle({
    visible: opts.visible,
    overlayRef: opts.overlayRef,
    panelRef: opts.panelRef,
    onEscape: handleEscape,
    locksBody: opts.locksBody,
    onOpen: opts.onOpen,
    onAfterLeave: () => opts.emit('closed'),
  });

  const handleKeydownTrap = useOverlayFocusTrap(opts.panelRef);

  const { handleMaskMousedown, handleMaskMouseup, handleMaskClick } = useOverlayMaskClose({
    canClose: opts.canCloseMask,
    close,
  });

  return {
    close,
    overlayZ,
    handleAfterLeave,
    handleKeydownTrap,
    handleMaskMousedown,
    handleMaskMouseup,
    handleMaskClick,
  };
}
