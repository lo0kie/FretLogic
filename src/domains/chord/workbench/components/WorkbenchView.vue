<template>
  <div class="pointer-events-auto absolute inset-0 z-content box-border overflow-hidden">
    <div class="relative box-border flex size-full items-start overflow-auto px-2xl pt-2xl pb-3xl">
      <!-- 交互指板卡片：点击/编辑即写和弦草稿，含横按标记与和弦名直改 -->
      <div
        class="pointer-events-auto relative mx-auto flex shrink-0 flex-col items-center justify-evenly rounded-md border border-glass-border bg-surface-panel/90 px-2xl py-xl shadow-panel backdrop-blur-lg transition-[border-color,box-shadow] duration-slow ease-sidebar hover:border-border-base hover:shadow-lg"
      >
        <div class="relative z-base flex w-full shrink-0 justify-center">
          <Fretboard
            :chord="editorStore.draftChord"
            @update:barres="handleBarresChange($event)"
            @update:chord-name="handleChordNameChange($event)"
            @update:fret-offset="handleFretOffsetUpdate($event)"
            @update:name-segments="handleNameSegmentsChange($event)"
            @update:root-string-index="handleRootStringChange($event)"
            @update:strings="handleStringsChange($event)"
          />
        </div>
      </div>

      <!-- 右侧卡片列：外层定位且不滚动，内层承载滚动。
           内容边缘用 mask-image 透明渐变柔化（不依赖背景色的 overlay 渐隐，任何背景/玻璃态下无色带）：
           · 未滚动（scrollTop===0）时顶部不遮罩 → 首卡完整可见、与指板顶对齐
           · 上滚后顶部渐隐显示，柔化滚出内容的切口
           · 底部仅未滚到底时渐隐，滚到底自动取消 → 末卡不被遮挡
           列顶 top-8（32px）与指板同高，滚动时卡片最多上移到 32px，不会比指板更高 -->
      <div class="pointer-events-auto absolute inset-y-2xl right-8 z-panel">
        <div
          v-scrollbar="{ onScroll: closeAllPopovers, endInset: 12 }"
          :style="maskStyle"
          @scroll="syncEdgeFades()"
          class="flex size-full flex-col items-end gap-lg *:shrink-0"
          ref="scrollRef"
        >
          <component v-for="panelId in panels" :is="PANEL_COMPONENT_MAP[panelId]" :key="panelId" />
        </div>
      </div>
    </div>

    <WorkbenchFloatingBar />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

import Fretboard from '@/domains/fretboard/components/Fretboard.vue';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { nameToSegments } from '@/domains/chord/theory/theory';
import { useWorkbenchPanelsOrder } from '@/domains/chord/workbench/composables/useWorkbenchPanelsOrder.ts';
import { toFretOffset, toStringIndex } from '@/domains/fretboard/model/coordinates';
import { useScrollEdgeFades } from '@/platform/composables/useScrollEdgeFades';
import { closeAllPopovers } from '@/platform/ui/popover/popoverRegistry.ts';

import ChordAnalysisPanel from './analysis/ChordAnalysisPanel.vue';
import WorkbenchExportPanel from './WorkbenchExportPanel.vue';
import WorkbenchFloatingBar from './WorkbenchFloatingBar.vue';
import WorkbenchSettingsPanel from './WorkbenchSettingsPanel.vue';
import WorkbenchVariantsPanel from './WorkbenchVariantsPanel.vue';
import { useWorkbenchRouteSync } from '../composables/useWorkbenchRouteSync';

import type { ChordNameSegments } from '@/domains/chord/types';
import type { WorkbenchPanelId } from '@/domains/chord/workbench/composables/useWorkbenchPanelsOrder.ts';
import type { BarreEntity, GuitarStringsModel, StringIndex } from '@/domains/fretboard/types';
import type { Component } from 'vue';

// 滚动边缘渐隐（mask 方案）：未滚动时顶部不遮罩（首卡完整可见），上滚后顶部渐隐柔化切口；
// 底部仅未滚到底时渐隐，滚到底隐藏（末卡不被遮挡）。渐变直接作用于内容透明度，不依赖背景色
const scrollRef = ref<HTMLElement | null>(null);
const { maskStyle, syncEdgeFades } = useScrollEdgeFades(scrollRef);

const PANEL_COMPONENT_MAP: Record<WorkbenchPanelId, Component> = {
  analysis: ChordAnalysisPanel,
  variants: WorkbenchVariantsPanel,
  export: WorkbenchExportPanel,
  settings: WorkbenchSettingsPanel,
};

const { panels } = useWorkbenchPanelsOrder();

// ==================== 指板交互草稿编辑 ====================

/** 和弦草稿编辑：Fretboard 读写 draftChord，任一编辑操作把草稿标记为「创建中」 */
const editorStore = useChordEditorStore();

// URL ↔ Store 状态同构（#/workbench?group=&chord=&v=）：本组件注册双向 watcher 与 KeepAlive 重激活回放
useWorkbenchRouteSync();

const markCreating = () => {
  if (!editorStore.isEditing) editorStore.isCreating = true;
};

/** 用户在指板上调整品位偏移后写入草稿 */
const handleFretOffsetUpdate = (offset: number) => {
  editorStore.draftChord.fretOffset = toFretOffset(offset);
  markCreating();
};

/** 用户按弦变化后同步整份按弦模型到草稿 */
const handleStringsChange = (strings: GuitarStringsModel) => {
  strings.forEach((str, i) => {
    editorStore.draftChord.strings[i] = [str[0], str[1]];
  });
  markCreating();
};

/** 用户切换根音弦后写入草稿（目标弦无按音时视为取消根音） */
const handleRootStringChange = (index: number | null) => {
  const validIndex: StringIndex | null =
    index !== null && (editorStore.draftChord.strings[index]?.[0] ?? -1) >= 0 ? toStringIndex(index) : null;
  editorStore.draftChord.rootStringIndex = validIndex;
  markCreating();
};

/** 用户输入和弦名后解析为音名段写入草稿（清空名则置空） */
const handleChordNameChange = (name: string) => {
  const segs = name ? nameToSegments(name) : null;
  editorStore.draftChord.nameSegments = segs;
  markCreating();
};

/** 用户编辑音名段后写入草稿 */
const handleNameSegmentsChange = (segments: ChordNameSegments | null) => {
  editorStore.draftChord.nameSegments = segments;
  markCreating();
};

/** 用户在指板上点击横按切换标记后同步到草稿 */
const handleBarresChange = (barres: BarreEntity[] | undefined) => {
  editorStore.setBarres(barres);
  markCreating();
};
</script>
