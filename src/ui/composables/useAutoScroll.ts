import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useEventListener } from '@vueuse/core';
import { onBeforeUnmount, onDeactivated, ref, shallowRef, watch, type Ref } from 'vue';

const isAutoScrolling = ref(false);
const globalScrollContainer = shallowRef<HTMLElement | null>(null);

let scoreEditorInstance: ReturnType<typeof useScoreEditorStore> | null = null;
const getScoreEditor = () => {
  if (!scoreEditorInstance) {
    scoreEditorInstance = useScoreEditorStore();
  }
  return scoreEditorInstance;
};

let rafId: number | null = null;
let lastTimestamp = 0;
let currentScrollPos = 0;

const step = (timestamp: number) => {
  if (!isAutoScrolling.value || !globalScrollContainer.value) return;

  const container = globalScrollContainer.value;

  if (container.scrollHeight <= container.clientHeight) {
    stopAutoScroll();
    return;
  }

  if (!lastTimestamp) lastTimestamp = timestamp;
  const elapsed = Math.min(timestamp - lastTimestamp, 100);
  lastTimestamp = timestamp;

  const scoreEditor = getScoreEditor();
  const speed = Number(scoreEditor.scrollSpeed || 80);
  const pxPerSecond = (speed / 60) * 45;
  const delta = (pxPerSecond * elapsed) / 1000;

  currentScrollPos += delta;
  container.scrollTop = currentScrollPos;

  if (container.scrollTop + container.clientHeight >= container.scrollHeight - 4) {
    stopAutoScroll();
    return;
  }

  rafId = requestAnimationFrame(step);
};

export const startAutoScroll = () => {
  if (!globalScrollContainer.value) {
    globalScrollContainer.value = document.querySelector('.interactive-score-zone');
  }
  const container = globalScrollContainer.value;
  if (!container) return;

  currentScrollPos = container.scrollTop;
  isAutoScrolling.value = true;
  lastTimestamp = 0;
  rafId = requestAnimationFrame(step);
};

export const stopAutoScroll = () => {
  isAutoScrolling.value = false;
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  lastTimestamp = 0;
};

export const toggleAutoScroll = () => {
  const container = globalScrollContainer.value;
  if (!container) return;

  if (isAutoScrolling.value) {
    stopAutoScroll();
    return;
  }

  // 判定是否接近触底
  const isAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 10;

  if (isAtBottom) {
    // 平滑滚动回顶部
    container.scrollTo({ top: 0, behavior: 'smooth' });

    // 监听滚动完成（防抖检测）
    let scrollEndTimer: ReturnType<typeof setTimeout> | null = null;
    const onScrollEnd = () => {
      if (scrollEndTimer) clearTimeout(scrollEndTimer);
      scrollEndTimer = setTimeout(() => {
        container.removeEventListener('scroll', onScrollEnd);
        currentScrollPos = 0;
        startAutoScroll();
      }, 100);
    };

    container.addEventListener('scroll', onScrollEnd, { passive: true });
    return;
  }

  startAutoScroll();
};

export function useAutoScroll(containerRef?: Ref<HTMLElement | null>) {
  const scoreEditor = getScoreEditor();

  // 切换当前激活乐谱时自动停止滚动
  watch(
    () => scoreEditor.activeSongId,
    () => {
      stopAutoScroll();
    }
  );

  if (containerRef) {
    watch(
      containerRef,
      el => {
        if (el) {
          globalScrollContainer.value = el;
        }
      },
      { immediate: true }
    );

    useEventListener(containerRef, 'wheel', stopAutoScroll, { passive: true });
    useEventListener(containerRef, 'touchstart', stopAutoScroll, {
      passive: true,
    });
  }

  // KeepAlive 缓存页面切走（deactivated）时停止 rAF 循环，避免后台每帧写隐藏容器的 scrollTop
  onDeactivated(() => {
    stopAutoScroll();
  });

  onBeforeUnmount(() => {
    stopAutoScroll();
  });

  return {
    isAutoScrolling,
    startAutoScroll,
    stopAutoScroll,
    toggleAutoScroll,
  };
}
