// src/router/scrollMemory.ts
import type { Router } from 'vue-router';

const scrollPositions = new Map<string, number>();

// 每个路由自己的滚动容器选择器，以后加新路由只需要在这里补一行
const SCROLL_CONTAINER_SELECTOR: Record<string, string> = {
  '/workbench': '.workbench-scroll-container',
  '/score': '.interactive-score-zone',
};

const restoreScroll = (path: string, selector: string, savedTop: number, retriesLeft = 5) => {
  const el = document.querySelector<HTMLElement>(selector);
  if (el) {
    el.scrollTop = savedTop;
    return;
  }
  // 首次访问某个路由时，组件对应的 chunk 可能还没加载完，DOM 还没出现，
  // 用有限次数的重试兜底，避免只靠一次 requestAnimationFrame 赌运气
  if (retriesLeft > 0) {
    requestAnimationFrame(() => restoreScroll(path, selector, savedTop, retriesLeft - 1));
  }
};

export const setupScrollMemory = (router: Router) => {
  router.beforeEach((_to, from) => {
    const selector = SCROLL_CONTAINER_SELECTOR[from.path];
    if (!selector) return;
    const el = document.querySelector<HTMLElement>(selector);
    if (el) scrollPositions.set(from.path, el.scrollTop);
  });

  router.afterEach(to => {
    const selector = SCROLL_CONTAINER_SELECTOR[to.path];
    if (!selector) return;
    const savedTop = scrollPositions.get(to.path);
    if (savedTop === undefined) return;

    requestAnimationFrame(() => restoreScroll(to.path, selector, savedTop));
  });
};
