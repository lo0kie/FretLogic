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

    <WorkbenchFloatingBar />
  </div>
</template>

<script setup lang="ts">
import ChordAnalysisPanel from './ChordAnalysisPanel.vue';
import WorkbenchCard from './WorkbenchCard.vue';
import WorkbenchFloatingBar from './WorkbenchFloatingBar.vue';
</script>

<style scoped lang="scss">
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
  padding: $space-3xl $space-2xl $space-3xl $space-2xl;
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
  transition: width $bezier-bounce $duration-fast;
}

@media (max-width: 1400px) {
  .analysis-panel-slot {
    width: 18rem;
    min-width: 18rem;
  }
}

@media (max-width: 1300px) {
  .analysis-panel-slot {
    width: 17rem;
    min-width: 17rem;
  }
}

// 窗口放大到一定程度时，分析面板收窄，为中央指板让出空间
@media (max-width: 1150px) {
  .analysis-panel-slot {
    width: 12rem;
    min-width: 12rem;
  }
}
</style>
