<template>
  <div class="z-content pointer-events-auto absolute inset-0 box-border overflow-hidden">
    <div
      class="no-scrollbar pt-2xl pb-3xl px-2xl relative box-border flex h-full w-full items-start justify-center overflow-y-auto"
    >
      <div class="shrink-0">
        <WorkbenchCard />
      </div>

      <!-- 右侧卡片列：外层定位且不滚动，内层承载滚动。
           顶部/底部渐隐层常驻在边缘，但用滚动状态控制显隐：
           · 未滚动（scrollTop===0）时顶部 fade 隐藏 → 首卡完整可见、与指板顶对齐
           · 上滚后顶部 fade 显示，柔化滚出内容的切口
           · 底部 fade 仅未滚到底时显示，滚到底自动隐藏 → 末卡不被遮挡
           列顶 top-8（32px）与指板同高，滚动时卡片最多上移到 32px，不会比指板更高 -->
      <div class="z-panel pointer-events-auto absolute top-8 right-8 bottom-8">
        <div
          @scroll="syncEdgeFades"
          class="no-scrollbar gap-lg flex h-full w-full flex-col items-end overflow-y-auto *:shrink-0"
          ref="scrollRef"
        >
          <component v-for="panelId in panels" :is="PANEL_COMPONENT_MAP[panelId]" :key="panelId" />
        </div>

        <!-- 顶部滚动渐隐：仅可上滚时显示，避免未滚动时遮挡首卡 -->
        <div
          v-show="!atTop"
          aria-hidden="true"
          class="z-panel pointer-events-none absolute inset-x-0 top-0 h-[20px] [background:linear-gradient(to_bottom,var(--bg-main),transparent)]"
        />
        <!-- 底部滚动渐隐：仅未滚到底时显示，滚到底时隐藏避免遮挡末卡 -->
        <div
          v-show="!atBottom"
          aria-hidden="true"
          class="z-panel pointer-events-none absolute inset-x-0 bottom-0 h-[20px] [background:linear-gradient(to_top,var(--bg-main),transparent)]"
        />
      </div>
    </div>

    <WorkbenchFloatingBar />
  </div>
</template>

<script lang="ts" setup>
import { ref, type Component } from 'vue';

import { useScrollEdgeFades } from '@/shared/composables/useScrollEdgeFades';

import ChordAnalysisPanel from './ChordAnalysisPanel.vue';
import { useWorkbenchPanelsOrder, type WorkbenchPanelId } from './composables/useWorkbenchPanelsOrder';
import WorkbenchCard from './WorkbenchCard.vue';
import WorkbenchExportPanel from './WorkbenchExportPanel.vue';
import WorkbenchFloatingBar from './WorkbenchFloatingBar.vue';
import WorkbenchSettingsPanel from './WorkbenchSettingsPanel.vue';

// 滚动边缘渐隐：未滚动时顶部 fade 隐藏（首卡完整可见），上滚后显示柔化切口；
// 底部 fade 仅未滚到底时显示，滚到底隐藏（末卡不被遮挡）
const scrollRef = ref<HTMLElement | null>(null);
const { atTop, atBottom, syncEdgeFades } = useScrollEdgeFades(scrollRef);

const PANEL_COMPONENT_MAP: Record<WorkbenchPanelId, Component> = {
  analysis: ChordAnalysisPanel,
  export: WorkbenchExportPanel,
  settings: WorkbenchSettingsPanel,
};

const { panels } = useWorkbenchPanelsOrder();
</script>
