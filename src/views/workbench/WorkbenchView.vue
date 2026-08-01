<template>
  <div class="workbench-layout-wrapper">
    <!-- 1. 指板与分析面板的整体居中容器 -->
    <div class="workbench-scroll-container">
      <div class="workbench-card-center-zone">
        <WorkbenchCard ref="workbenchCardRef" />
      </div>

      <div class="analysis-panel-slot">
        <ChordAnalysisPanel />
      </div>
    </div>

    <!-- 2. 底部吸附操作按钮栏 -->
    <FloatingActionBar />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import ChordAnalysisPanel from './ChordAnalysisPanel.vue';
import FloatingActionBar from './FloatingActionBar.vue';
import WorkbenchCard from './WorkbenchCard.vue';

const workbenchCardRef = ref<InstanceType<typeof WorkbenchCard>>();
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.workbench-layout-wrapper {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 2rem;
  padding-top: 3.5rem;
  padding-bottom: 6.15rem;
  overflow: hidden;
  box-sizing: border-box;
  pointer-events: none;
}

/* 🌟 核心：以视口宽度满屏居中，不参与左侧栏的 Flex 挤压流 */
.workbench-scroll-container {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  width: 100%;
  height: 100%;
  max-width: 1000px; /* 限制整体最大宽度，保证右侧面板不会飞出屏幕外 */
  margin: 0 auto;
  gap: 2rem;
}

.workbench-card-center-zone {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  flex: 1;
  pointer-events: auto;
}

.analysis-panel-slot {
  width: 13.8rem;
  flex-shrink: 0;
  pointer-events: auto;
  position: relative;
}

@media (max-width: 1100px) {
  /* 屏幕较小时自动隐藏右侧分析面板槽位，或者让其浮动，避免挤压指板 */
  .analysis-panel-slot {
    position: absolute;
    right: 1.5rem;
    top: 0;
  }
}

@media (max-width: 768px) {
  .workbench-layout-wrapper {
    padding: 0.5rem;
    padding-bottom: 5.5rem;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    pointer-events: auto;
  }

  .workbench-scroll-container {
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    height: auto;
    max-width: 100%;
  }

  .workbench-card-center-zone {
    width: 100%;
  }

  .analysis-panel-slot {
    position: relative;
    right: auto;
    width: 100%;
  }
}
</style>
