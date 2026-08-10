<template>
  <div class="workbench-layout-wrapper">
    <div class="workbench-scroll-container no-scrollbar">
      <div class="workbench-card-center-zone">
        <WorkbenchCard />
      </div>

      <!-- 🌟 移动端多指法分页器 -->
      <div v-if="uiStore.isMobile && editorStore.isMultiFingering" class="mobile-variants-pagination">
        <BasePagination
          :model-value="editorStore.currentMultiFingeringIndex"
          :total="editorStore.currentMultiFingeringChords.length"
          @update:model-value="editorStore.setMultiFingeringIndex"
          :formatter="(current, total) => `${current} / ${total}`"
        />
      </div>

      <div class="analysis-panel-slot">
        <ChordAnalysisPanel />
      </div>
    </div>

    <FloatingActionBar />
  </div>
</template>

<script setup lang="ts">
import BasePagination from '@/components/BasePagination.vue';
import { useEditorStore } from '@/stores/chordEditorStore';
import { useUiStore } from '@/stores/uiStore';
import ChordAnalysisPanel from './ChordAnalysisPanel.vue';
import FloatingActionBar from './FloatingActionBar.vue';
import WorkbenchCard from './WorkbenchCard.vue';

const editorStore = useEditorStore();
const uiStore = useUiStore();
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.workbench-layout-wrapper {
  position: absolute;
  inset: 0;
  z-index: 1;
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
  padding: 3.5rem 2rem 6.15rem 2rem;
  box-sizing: border-box;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.workbench-card-center-zone {
  flex-shrink: 0;
}

.mobile-variants-pagination {
  display: none;
}

.analysis-panel-slot {
  position: absolute;
  top: 3.5rem;
  right: 2rem;
  width: 13.8rem;
  min-width: 13.8rem;
  pointer-events: auto;
  z-index: 10;
  max-height: calc(100% - 3.5rem - 6.15rem);
  overflow-y: auto;
}

@media (max-width: 768px) {
  .workbench-scroll-container {
    flex-direction: column;
    justify-content: flex-start;
    align-items: center;
    gap: 1rem;
    padding: 0.8rem 0.8rem calc(6rem + env(safe-area-inset-bottom, 0px)) 0.8rem;
  }

  .workbench-card-center-zone {
    width: 100%;
    display: flex;
    justify-content: center;
  }

  .mobile-variants-pagination {
    display: flex;
    justify-content: center;
    width: 100%;
    flex-shrink: 0;
  }

  .analysis-panel-slot {
    position: static;
    top: auto;
    right: auto;
    bottom: auto;
    left: auto;
    width: 100%;
    min-width: unset;
    max-height: none;
    overflow: visible;
  }
}
</style>
