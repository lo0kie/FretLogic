// 统一的模态阻断层栈：Modal 与 Drawer 共享同一登记集合与 inert 同步逻辑。
// 之前两者各自维护独立栈，跨类型层叠时（例如在 Drawer 之上再开 Modal）会互相覆盖 inert
// 状态——Modal 关闭后把仍被 Drawer 挡住的 body 子元素误判为可交互，导致 Drawer 被永久 inert 挡住。
// 统一登记后，无论 Modal/Drawer 如何层叠，只允许「栈顶」一层可交互，关闭任意层都会正确回退到下一层。
const activeOverlays = new Set<HTMLElement>();

export const isClient = typeof document !== 'undefined';

/** 依据栈顶同步 body 直接子元素的 inert 属性：仅栈顶阻断层可交互，其余阻断与后方内容全部 inert。
 *  豁免 [data-overlay-exempt] 标记的元素（如全局通知浮层）：它们 z-index 高于模态遮罩且必须保持可交互，
 *  否则被 inert 后点击会穿透到遮罩上，反而误触「点遮罩关闭」。 */
const updateOverlayInertState = () => {
  if (!isClient) return;
  const currentTopOverlay = Array.from(activeOverlays).pop();

  document.body.childNodes.forEach(node => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.hasAttribute('data-overlay-exempt')) {
      el.removeAttribute('inert');
    } else if (currentTopOverlay && el === currentTopOverlay) {
      el.removeAttribute('inert');
    } else if (activeOverlays.size > 0) {
      el.setAttribute('inert', '');
    } else {
      el.removeAttribute('inert');
    }
  });
};

/** 登记为激活阻断层（入栈并同步 inert） */
export const registerOverlay = (el: HTMLElement) => {
  activeOverlays.add(el);
  updateOverlayInertState();
};

/** 移出激活阻断层（出栈并同步 inert） */
export const unregisterOverlay = (el: HTMLElement) => {
  activeOverlays.delete(el);
  updateOverlayInertState();
};

/** 当前登记的阻断层数量，用于滚动锁是否应保持开启 */
export const hasActiveOverlays = (): number => activeOverlays.size;

/**
 * 判断某元素是否为栈顶阻断层。
 * 刚打开还未完成 nextTick 入栈（DOM 已挂载但尚未登记）时视为栈顶。
 */
export const isTopOverlay = (el: HTMLElement | null): boolean => {
  if (!el) return false;
  if (!activeOverlays.has(el)) return true;
  return Array.from(activeOverlays).pop() === el;
};
