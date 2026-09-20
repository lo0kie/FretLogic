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

/**
 * 圈选元素是否真实可聚焦：querySelectorAll 只能按选择器初筛，选出结果里仍混有
 * 「自身/祖先 display:none、visibility:hidden」与「inert 子树」内的元素——focus() 落空、
 * 焦点丢给 body，Tab 循环在边界处（first/last 恰是这类元素时）失效。逐层剔除。
 */
const isActuallyFocusable = (panel: HTMLElement, el: HTMLElement): boolean => {
  // inert 子树：浮层内嵌套的关闭中 Drawer / 让位 FloatingPanel 等场景
  if (el.closest('[inert]')) return false;
  let node: HTMLElement | null = el;
  while (node && node !== panel) {
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    node = node.parentElement;
  }
  return true;
};

/** Tab 焦点圈定：在浮层面板内首个/末个可聚焦元素间循环（面板无可聚焦元素时聚焦面板自身） */
export function useOverlayFocusTrap(panelRef: Ref<HTMLElement | null>): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || !panelRef.value) return;
    const panel = panelRef.value;
    // 中间元素的跳转由浏览器原生 Tab 顺序兜底（原生会自动跳过 hidden/inert），
    // 这里只需保证 first/last 边界元素真实可聚焦
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(el =>
      isActuallyFocusable(panel, el)
    );
    if (focusables.length === 0) {
      panel.focus();
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
