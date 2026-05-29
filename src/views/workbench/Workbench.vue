<template>
  <div class="flex-1 h-full flex items-center justify-center p-8 transition-all">
    <div
      id="fretBoard-capture-area"
      class="workbench-card rounded-xl w-[520px] flex flex-col justify-evenly items-center relative shrink-0"
      :style="{ height: dynamicHeight }"
    >
      <ChordInputHeader />
      <FretBoardCanvas />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useChordLabStore } from '@/stores/chordLabStore';
import ChordInputHeader from '@/views/workbench/ChordInputHeader.vue';
import FretBoardCanvas from '@/views/workbench/FretBoardCanvas.vue';
import { computed } from 'vue';

const chordLabStore = useChordLabStore();

// 🌟 优化：消除魔法数组，提供安全的映射与回退机制
const dynamicHeight = computed(() => {
  const baseHeight = 230;
  const heightMap: Record<number, number> = { 3: 350, 4: 440, 5: 510 };
  // 默认回退到 3 品的高度，防止越界报错
  const extraHeight = heightMap[chordLabStore.fretCount] || 350;
  return `${baseHeight + extraHeight}px`;
});
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

.workbench-card {
  .mixin-panel-base();
  font-size: 16px !important;
  transition:
    height @duration-slow @bezier-standard,
    background-color @duration-base,
    border-color @duration-base;
}
</style>
