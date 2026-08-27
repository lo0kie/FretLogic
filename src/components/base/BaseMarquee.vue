<template>
  <div
    ref="containerRef"
    v-element-hover="onHoverChange"
    class="h-full w-full min-w-0 flex-1 overflow-hidden whitespace-nowrap flex items-center box-border"
    :style="{ '--scroll-dist': scrollDist }"
  >
    <span
      ref="contentRef"
      class="flex items-center h-full w-full min-w-0 box-border [&>*]:inline-block [&>*]:align-baseline [&>*]:max-w-full [&>*]:truncate [&>*]:leading-normal"
      :class="{
        '!w-auto !min-w-max !overflow-visible animate-[marquee-slide_4s_linear_infinite_alternate_0.5s] will-change-transform [&>*]:!overflow-visible [&>*]:!text-clip':
          isScrolling,
      }"
    >
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
