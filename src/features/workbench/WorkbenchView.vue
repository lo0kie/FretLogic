<template>
  <div class="z-content pointer-events-auto absolute inset-0 box-border overflow-hidden">
    <div
      class="no-scrollbar pt-2xl pb-3xl px-2xl relative box-border flex h-full w-full items-start justify-center overflow-y-auto"
    >
      <!-- 交互指板卡片：点击/编辑即写和弦草稿，含横按标记与和弦名直改 -->
      <div
        class="bg-bg-panel/90 border-glass-border shadow-panel py-xl px-2xl duration-slow ease-sidebar hover:border-border-base pointer-events-auto relative flex shrink-0 flex-col items-center justify-evenly rounded-md border backdrop-blur-lg transition-all hover:shadow-lg"
      >
        <div class="z-base relative flex w-full shrink-0 justify-center">
          <Fretboard
            :chord="editorStore.draftChord"
            @update:barres="handleBarresChange"
            @update:chord-name="handleChordNameChange"
            @update:fret-offset="handleFretOffsetUpdate"
            @update:name-segments="handleNameSegmentsChange"
            @update:root-string-index="handleRootStringChange"
            @update:strings="handleStringsChange"
          />
        </div>
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

import Fretboard from '@/components/fretboard/Fretboard.vue';
import { nameToSegments } from '@/services/music/theory';
import { useScrollEdgeFades } from '@/shared/composables/useScrollEdgeFades';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import type { BarreEntity, ChordNameSegments, GuitarStringsModel, StringIndex } from '@/types';
import { toFretOffset, toStringIndex } from '@/utils/music/chord-fretboard';

import ChordAnalysisPanel from './ChordAnalysisPanel.vue';
import { useWorkbenchPanelsOrder, type WorkbenchPanelId } from './composables/useWorkbenchPanelsOrder';
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

// ==================== 指板交互草稿编辑 ====================

/** 和弦草稿编辑：Fretboard 读写 draftChord，任一编辑操作把草稿标记为「创建中」 */
const editorStore = useChordEditorStore();

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
