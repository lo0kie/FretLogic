<template>
  <div class="flex-1 h-full flex items-center justify-center p-8 transition-all relative overflow-hidden">
    <div
      class="absolute inset-0 bg-gradient-to-b from-[var(--color-primary)]/5 to-transparent pointer-events-none transition-colors duration-500"
    ></div>

    <div
      id="fretBoard-capture-area"
      class="workbench-card rounded-xl w-[520px] flex flex-col items-center justify-evenly relative shrink-0"
      :style="{ height: dynamicHeight }"
    >
      <ChordInputHeader class="z-10 shrink-0" />

      <div class="relative w-full flex justify-center z-0 shrink-0">
        <FretBoardCanvas />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useChordLabStore } from '@/stores/chordLabStore';
import ChordInputHeader from '@/views/workbench/ChordInputHeader.vue';
import FretBoardCanvas from '@/views/workbench/FretBoardCanvas.vue';
import { computed } from 'vue';

const chordLabStore = useChordLabStore();

const dynamicHeight = computed(() => {
  // 🌟 物理硬计算：pt-14(70.8px) + gap-8(40.5px) + pb-10(50.6px) + ChordInputHeader(70.8px) ≈ 233px
  const baseVerticalSpace = 234;

  // 这与 FretBoardCanvas 里的 scaleMap 计算后留出的真实物理高度严格一一对应
  const scaledCanvasHeightMap: Record<number, number> = {
    3: 360,
    4: 420,
    5: 480,
  };

  const boardHeight = scaledCanvasHeightMap[chordLabStore.fretCount] || 460;
  return `${baseVerticalSpace + boardHeight}px`;
});
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

.workbench-card {
  .mixin-panel-base();
  box-shadow: @shadow-floating; /* 拉开 Z 轴层次 */

  transition:
    height @duration-slow @bezier-bounce,
    /* 🌟 高度伸缩加上 Q 弹果冻动画 */ background-color @duration-base,
    border-color @duration-base,
    box-shadow @duration-base;

  :global(.dark) & {
    box-shadow: @shadow-floating-dark;
  }

  /* 🌟 物理打磨：顶部边缘微弱高光 */
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.5), transparent);
    opacity: 0.3;
    border-top-left-radius: 28px;
    border-top-right-radius: 28px;
    pointer-events: none;
  }
}
</style>
