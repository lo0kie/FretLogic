<template>
  <div
    ref="containerRef"
    v-element-hover="onHoverChange"
    class="marquee-container"
    :style="{ '--scroll-dist': scrollDist }"
  >
    <span ref="contentRef" class="marquee-content" :class="{ 'is-scrolling': isScrolling }">
      <slot />
    </span>
  </div>
</template>

<script setup lang="ts">
import { vElementHover } from '@vueuse/components';
import { ref, useTemplateRef } from 'vue';

const containerRef = useTemplateRef<HTMLDivElement>('containerRef');
const contentRef = useTemplateRef<HTMLSpanElement>('contentRef');
const isScrolling = ref(false);
const scrollDist = ref('0px');

const onHoverChange = (hovered: boolean) => {
  if (hovered) {
    if (!containerRef.value || !contentRef.value) return;

    const clientWidth = containerRef.value.clientWidth;
    const scrollWidth = contentRef.value.scrollWidth;

    if (scrollWidth > clientWidth) {
      scrollDist.value = `${scrollWidth - clientWidth}px`;
      isScrolling.value = true;
    }
  } else {
    isScrolling.value = false;
    scrollDist.value = '0px';
  }
};
</script>

<style scoped lang="scss">
.marquee-container {
  height: 100%;
  width: 100%;
  min-width: 0;
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  display: flex;
  align-items: center;
  box-sizing: border-box;
}

.marquee-content {
  display: flex;
  align-items: center;
  height: 100%;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;

  :slotted(*) {
    display: inline-block;
    vertical-align: baseline;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: normal;
  }

  &.is-scrolling {
    width: auto;
    min-width: max-content;
    overflow: visible;
    animation: globalMarqueeAnimate 4s linear infinite alternate;
    animation-delay: 0.5s;
    will-change: transform;

    :slotted(*) {
      display: inline-block;
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
