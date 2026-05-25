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
.workbench-card {
  font-size: 16px !important;
  background-color: var(--bg-panel);
  border: 1px solid var(--control-border);
  border-radius: 12px;
  box-shadow: 0 20px 50px -12px rgba(0, 0, 0, 0.05);
  transition:
    height 0.4s cubic-bezier(0.4, 0, 0.2, 1),
    background-color 0.3s,
    border-color 0.3s;
}

.dark {
  .workbench-card {
    box-shadow: 0 30px 60px -15px rgba(0, 0, 0, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.14);
  }
}
</style>
