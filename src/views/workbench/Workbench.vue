<template>
  <div class="flex-1 h-full flex items-center justify-center p-8 transition-all relative overflow-hidden">
    <div
      class="absolute inset-0 bg-gradient-to-b from-[var(--color-primary)]/5 to-transparent pointer-events-none transition-colors duration-500"
    ></div>

    <div
      id="fretBoard-capture-area"
      class="workbench-card rounded-xl flex flex-col items-center justify-evenly relative shrink-0"
      :style="{ height: dynamicHeight, width: `${CANVAS_CONFIG.BOARD_WIDTH + 60}px` }"
    >
      <ChordInputHeader class="z-10 shrink-0" />

      <div class="relative w-full flex justify-center z-0 shrink-0">
        <FretBoardCanvas />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CANVAS_CONFIG, FRETBOARD_SCALE_MAP, WORKBENCH_LAYOUT } from '@/constants';
import { useChordLabStore } from '@/stores/chordLabStore';
import ChordInputHeader from '@/views/workbench/ChordInputHeader.vue';
import FretBoardCanvas from '@/views/workbench/FretBoardCanvas.vue';
import { computed } from 'vue';

const chordLabStore = useChordLabStore();

const dynamicHeight = computed(() => {
  // 1. 卡片内除画布外的纯几何宏观垂直高依赖
  const baseVerticalSpace = WORKBENCH_LAYOUT.BASE_VERTICAL_PADDING;

  // 2. 指板原始物理高度
  const rawCanvasHeight =
    CANVAS_CONFIG.OFFSET_Y_TOP + chordLabStore.fretCount * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.OFFSET_Y_BOTTOM;

  // 3. 乘以全量统一的物理微调缩放系数
  const currentScale = FRETBOARD_SCALE_MAP[chordLabStore.fretCount] || 1.0;
  const realBoardHeight = rawCanvasHeight * currentScale;

  return `${baseVerticalSpace + realBoardHeight}px`;
});
</script>

<style scoped lang="less">
@import '@/assets/tokens.less';

.workbench-card {
  .mixin-panel-base();
  box-shadow: @shadow-floating;
  transition:
    height @duration-slow @bezier-bounce,
    background-color @duration-base,
    border-color @duration-base,
    box-shadow @duration-base;

  :global(.dark) & {
    box-shadow: @shadow-floating-dark;
  }

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
