/**
 * 内容高度自适应过渡：测量内容真实高度写入外层 height（px），配合 transition-[height] 使用。
 *
 * 为什么不用纯 CSS 的 grid-template-rows 0fr↔1fr：该技巧只能处理「显示/隐藏」，
 * 外层行高恒为 1fr，内容本身尺寸变化（音符增减、候选徽标换行、文案变化）时值不变，
 * 不会触发过渡——CSS 也无法对 auto→auto 的高度变化做过渡。
 * 这里用 ResizeObserver 持续同步实测高度，让高度变化统一走 height 过渡。
 *
 * 初始值为 'auto'：首帧不做动画（auto→px 不可插值），避免页面加载时面板自己展开一次。
 */
import { getCurrentInstance, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';

export interface AutoHeightOptions {
  /** 是否在展开时初始值为 auto 避免首帧跳变，默认 true */
  initialAuto?: boolean;
}

export const useAutoHeight = (
  contentRef: Ref<HTMLElement | null>,
  expanded: Ref<boolean> = ref(true),
  options?: AutoHeightOptions
) => {
  const height = ref(options?.initialAuto !== false ? 'auto' : '0px');
  let observer: ResizeObserver | null = null;
  let lastMeasuredPx = 0;

  /** 实测内容高度写入 height（px）；变化小于 2px 时忽略以避免抖动 */
  const sync = (force = false) => {
    const el = contentRef.value;
    if (!el || !expanded.value) {
      height.value = expanded.value ? 'auto' : '0px';
      lastMeasuredPx = 0;
      return;
    }
    const measured = Math.ceil(Math.max(el.offsetHeight, el.scrollHeight));
    if (
      measured > 0 &&
      (force || height.value === 'auto' || height.value === '0px' || Math.abs(measured - lastMeasuredPx) >= 2)
    ) {
      lastMeasuredPx = measured;
      height.value = `${measured}px`;
    }
  };

  /** 把 ResizeObserver 重新绑定到新元素（旧观察自动断开） */
  const observe = (el: HTMLElement | null) => {
    observer?.disconnect();
    if (!el || typeof ResizeObserver === 'undefined') return;
    observer = new ResizeObserver(() => sync());
    observer.observe(el);
    sync(true);
  };

  if (getCurrentInstance()) {
    onMounted(() => {
      observe(contentRef.value);
    });
    onBeforeUnmount(() => observer?.disconnect());
  } else {
    observe(contentRef.value);
  }

  // 监听 contentRef 变化（支持 v-if 动态挂载/卸载）
  watch(
    contentRef,
    newEl => {
      observe(newEl);
    },
    { flush: 'post' }
  );

  // 折叠/展开切换
  watch(
    expanded,
    isExp => {
      if (!isExp) {
        height.value = '0px';
        lastMeasuredPx = 0;
      } else {
        sync(true);
      }
    },
    { flush: 'post' }
  );

  return { height, sync };
};
