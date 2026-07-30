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
@import '@/assets/tokens.module';

.marquee-container {
  height: 100%;
  width: 100%;
  min-width: 0; /* 🌟 关键：防止 Flex 子项被长文本无限撑开 */
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  display: flex;
  align-items: center;
  box-sizing: border-box;
}

.marquee-content {
  display: flex; /* 🌟 恢复 Flex 布局，实现完美的垂直居中 */
  align-items: center; /* 🌟 垂直居中 */
  height: 100%;
  width: 100%;
  min-width: 0; /* 🌟 允许 Flex 子项尺寸收缩，防止被文本撑开 */
  box-sizing: border-box;

  /* 内部的 span 处理文本截断与超长省略 */
  :deep(span) {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.2; /* 防止字体行高导致偏离中心 */
  }

  &.is-scrolling {
    width: auto;
    min-width: max-content;
    overflow: visible;
    animation: globalMarqueeAnimate 4s linear infinite alternate;
    animation-delay: 0.5s;
    will-change: transform;

    :deep(span) {
      overflow: visible;
      text-overflow: clip;
    }
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
