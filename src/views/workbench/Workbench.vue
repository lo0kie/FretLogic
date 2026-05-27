<template>
  <div class="flex-1 h-full flex items-center justify-center p-8 transition-all">
    <div
      id="fretBoard-capture-area"
      class="workbench-card w-[520px] rounded-xl flex flex-col justify-evenly items-center relative shrink-0"
      :style="{ height: 230 + [350, 440, 510][chordLabStore.fretCount - 3] + 'px' }"
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

const chordLabStore = useChordLabStore();
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

.workbench-card {
  .mixin-panel-base(); // 一键注入背景、边框、阴影、暗黑模式

  font-size: 16px !important;
  transition:
    height 0.4s @bezier-standard,
    background-color 0.3s,
    border-color 0.3s;
}
</style>
