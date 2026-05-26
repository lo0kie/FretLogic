<template>
  <div id="fretBoard-capture-area" class="flex-1 h-full flex items-center justify-center p-8 transition-all">
    <div
      class="workbench-card w-[520px] flex flex-col justify-evenly items-center relative shrink-0"
      :style="{ height: 230 + [350, 440, 510][chordLabStore.fretCount - 3] + 'px' }"
    >
      <ChordInputHeader />

      <FretBoardCanvas />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useChordLabStore } from '@/stores/chordLabStore';
import ChordInputHeader from './ChordInputHeader.vue';
import FretBoardCanvas from './FretBoardCanvas.vue';

const chordLabStore = useChordLabStore();
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

.workbench-card {
  font-size: 16px !important;
  .mixin-panel-base(); // 一键注入背景、边框、阴影、暗黑模式
  border-radius: 12px; // 覆盖默认的 16px 为 12px
  transition:
    height 0.4s @bezier-standard,
    background-color 0.3s,
    border-color 0.3s;
}
</style>
