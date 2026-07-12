<template>
  <div ref="containerRef" class="marquee-container" @mouseenter="handleMouseEnter" @mouseleave="handleMouseLeave">
    <span ref="contentRef" class="marquee-content" :class="{ 'is-scrolling': isScrolling }">
      <slot></slot>
    </span>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const containerRef = ref<HTMLDivElement | null>(null);
const contentRef = ref<HTMLSpanElement | null>(null);
const isScrolling = ref(false);

const handleMouseEnter = () => {
  if (!containerRef.value || !contentRef.value) return;

  const clientWidth = containerRef.value.clientWidth;
  const scrollWidth = contentRef.value.scrollWidth;

  if (scrollWidth > clientWidth) {
    containerRef.value.style.setProperty('--scroll-dist', `${scrollWidth - clientWidth}px`);
    isScrolling.value = true;
  }
};

const handleMouseLeave = () => {
  isScrolling.value = false;
  containerRef.value?.style.removeProperty('--scroll-dist');
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.less';

.marquee-container {
  height: 100%;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  display: flex;
  align-items: center;
  box-sizing: border-box;
}

.marquee-content {
  display: inline-flex;
  align-items: center;
  height: 100%;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  box-sizing: border-box;

  &.is-scrolling {
    width: auto;
    min-width: max-content;
    overflow: visible;
    text-overflow: clip;
    animation: globalMarqueeAnimate 4s linear infinite alternate;
    animation-delay: 0.5s;
    will-change: transform;
  }
}

@keyframes globalMarqueeAnimate {
  0%,
  12% {
    transform: translateX(0);
  }
  88%,
  100% {
    transform: translateX(calc(-1 * var(--scroll-dist, 0px)));
  }
}
</style>
