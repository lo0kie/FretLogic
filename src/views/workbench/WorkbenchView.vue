<template>
  <div class="workbench-layout-wrapper">
    <!-- 指板与分析面板的容器 -->
    <div class="workbench-scroll-container">
      <div class="workbench-card-center-zone">
        <WorkbenchCard />
      </div>

      <!-- 面板仍在容器内，但通过 CSS 脱离文档流 -->
      <div class="analysis-panel-slot">
        <ChordAnalysisPanel />
      </div>
    </div>

    <!-- 底部吸附操作按钮栏 -->
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
  z-index: 1;
  overflow: hidden;
  box-sizing: border-box;
  pointer-events: none;
}

/* 🌟 核心：让指板独占居中流 */
.workbench-scroll-container {
  position: relative; /* 🌟 作为面板绝对定位的参照物 */
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center; /* 🌟 指板始终居中 */
  align-items: flex-start;
  padding: 3.5rem 2rem 6.15rem 2rem;
  box-sizing: border-box;
  overflow-y: auto;
  pointer-events: auto;
}

.workbench-card-center-zone {
  flex-shrink: 0;
  /* 指板自然居中，不受面板影响 */
}

/* 🌟 分析面板：绝对定位浮在右侧，不挤压指板 */
.analysis-panel-slot {
  position: absolute; /* 🌟 脱离文档流 */
  top: 3.5rem; /* 🌟 与容器的 padding-top 保持一致，确保顶部对齐 */
  right: 2rem;
  width: 13.8rem; /* 🌟 强制宽度 */
  min-width: 13.8rem; /* 🌟 防止被压缩 */
  pointer-events: auto;
  z-index: 10;

  /* 防止面板过高遮挡底部操作栏 */
  max-height: calc(100% - 3.5rem - 6.15rem);
  overflow-y: auto;
}

@media (max-width: 768px) {
  .workbench-layout-wrapper {
    pointer-events: auto;
  }

  .workbench-scroll-container {
    padding: 0.5rem 0.5rem 5.5rem 0.5rem;
    align-items: center;
  }

  /* 移动端：面板改为底部固定 */
  .analysis-panel-slot {
    position: fixed;
    top: auto;
    bottom: 5.5rem;
    right: 0.5rem;
    left: 0.5rem;
    width: auto;
    min-width: unset;
    max-height: 40vh;
  }
}
</style>
