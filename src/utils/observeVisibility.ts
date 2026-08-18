/**
 * 共享 IntersectionObserver：同一 root 下的大量元素（谱面字符槽、选择器卡片等）
 * 复用同一个 observer 实例，避免每个元素各建一个 observer 的开销。
 * 按 root 元素维度复用；root 传 null 表示使用视口。
 */
type VisibilityCallback = (visible: boolean) => void;

const observersByRoot = new Map<Element | null, IntersectionObserver>();
const elementCallbacks = new WeakMap<Element, VisibilityCallback>();

const getObserverForRoot = (root: Element | null): IntersectionObserver => {
  let observer = observersByRoot.get(root);
  if (!observer) {
    observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          elementCallbacks.get(entry.target)?.(entry.isIntersecting);
        }
      },
      { root }
    );
    observersByRoot.set(root, observer);
  }
  return observer;
};

/**
 * 观察元素可见性，返回停止观察的清理函数。
 * 回调可能被多次调用（滚动进出视口），调用方自行决定何时 stop。
 */
export function observeVisibility(el: Element, cb: VisibilityCallback, root?: Element | null): () => void {
  const observer = getObserverForRoot(root ?? null);
  elementCallbacks.set(el, cb);
  observer.observe(el);
  return () => {
    elementCallbacks.delete(el);
    observer.unobserve(el);
  };
}
