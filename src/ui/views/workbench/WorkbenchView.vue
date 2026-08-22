<template>
  <div class="workbench-layout-wrapper">
    <div class="workbench-scroll-container no-scrollbar">
      <div class="workbench-card-center-zone">
        <WorkbenchCard />
      </div>

      <div class="analysis-panel-slot no-scrollbar">
        <ChordAnalysisPanel />
      </div>
    </div>

    <FloatingActionBar />
  </div>
</template>

<script setup lang="ts">
import ChordAnalysisPanel from './ChordAnalysisPanel.vue';
import FloatingActionBar from './FloatingActionBar.vue';
import WorkbenchCard from './WorkbenchCard.vue';
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.workbench-layout-wrapper {
  position: absolute;
  inset: 0;
  z-index: var(--z-content);
  overflow: hidden;
  box-sizing: border-box;
  pointer-events: auto;
}

.workbench-scroll-container {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: @space-3xl @space-2xl @space-3xl @space-2xl;
  box-sizing: border-box;
  overflow-y: auto;
}

.workbench-card-center-zone {
  flex-shrink: 0;
}

.analysis-panel-slot {
  position: absolute;
  top: 3.5rem;
  right: 2rem;
  width: 20rem;
  min-width: 20rem;
  pointer-events: auto;
  z-index: var(--z-panel);
  overflow-y: auto;
}
</style>
