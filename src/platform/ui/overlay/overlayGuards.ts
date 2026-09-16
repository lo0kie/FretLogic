/**
 * 模态浮层（Modal / Drawer）共享的交互守卫：
 * 统一关闭入口（beforeClose 拦截 + 防重入）、Esc 栈顶判定、遮罩点击关闭、Tab 焦点圈定。
 * BaseModal 与 BaseDrawer 此前各自维护逐字重复的实现，本模块为唯一来源。
 */
import type { ModalCloseReason } from '@/platform/ui/modal/modalCloseReason';
import type { Ref } from 'vue';

/**
 * 统一关闭入口：closeLocked 锁定与 beforeClose 拦截生效，拦截执行期间防重入
 * （遮罩 / X / Esc 并发触发时只放行一次请求，避免异步拦截被重复拉起）。
 * 返回的 close 供 X / 取消 / 遮罩 / Esc 各关闭路径共用；程序化置 visible=false 不经此路径。
 */
export function useOverlayCloseGuard(opts: {
  visible: Ref<boolean>;
  isLocked: () => boolean;
  getBeforeClose: () => (() => boolean | Promise<boolean>) | undefined;
  onCancel: (reason: ModalCloseReason) => void;
}): (reason?: ModalCloseReason) => Promise<void> {
  let closePending = false;
  return async (reason: ModalCloseReason = 'cancel') => {
    if (closePending || opts.isLocked()) return;
    const beforeClose = opts.getBeforeClose();
    if (beforeClose) {
      closePending = true;
      try {
        const ok = await beforeClose();
        if (ok === false) return; // 拦截：放弃本次关闭，closePending 由 finally 复位
      } finally {
        closePending = false;
      }
    }
    opts.onCancel(reason);
    opts.visible.value = false;
  };
}

/**
 * Esc 关闭处理器：仅在浮层启用键盘关闭、未被锁死且自身位于阻断栈顶时生效，
 * 避免一次按键同时关闭所有层叠浮层。
 */
export function useOverlayEscape(opts: {
  enabled: () => boolean;
  isTop: () => boolean;
  close: (reason: ModalCloseReason) => void;
}): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (!opts.enabled() || !opts.isTop()) return;
    opts.close('esc');
  };
}

/**
 * 遮罩点击关闭：校验「按下与松开都在遮罩上」才判定为点击遮罩，避免从浮层内拖拽出来误关。
 * canClose 由调用方给出门禁（遮罩开启 + 未锁死等差异化条件）。
 */
export function useOverlayMaskClose(opts: { canClose: () => boolean; close: (reason: ModalCloseReason) => void }): {
  handleMaskMousedown: (e: MouseEvent) => void;
  handleMaskClick: (e: MouseEvent) => void;
} {
  let mousedownTarget: EventTarget | null = null;
  const handleMaskMousedown = (e: MouseEvent) => {
    mousedownTarget = e.target;
  };
  const handleMaskClick = (e: MouseEvent) => {
    if (opts.canClose() && e.target === e.currentTarget && mousedownTarget === e.currentTarget) {
      opts.close('mask');
    }
    mousedownTarget = null;
  };
  return { handleMaskMousedown, handleMaskClick };
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Tab 焦点圈定：在浮层面板内首个/末个可聚焦元素间循环（面板无可聚焦元素时聚焦面板自身） */
export function useOverlayFocusTrap(panelRef: Ref<HTMLElement | null>): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || !panelRef.value) return;
    const focusables = Array.from(panelRef.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusables.length === 0) {
      panelRef.value.focus();
      return;
    }
    const firstEl = focusables[0]!;
    const lastEl = focusables[focusables.length - 1]!;
    if (e.shiftKey) {
      if (document.activeElement === firstEl || document.activeElement === panelRef.value) {
        e.preventDefault();
        lastEl.focus();
      }
    } else {
      if (document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
  };
}
