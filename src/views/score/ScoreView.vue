<template>
  <div class="score-view-wrapper">
    <div class="score-main-content">
      <template v-if="scoreEditor.activeSong">
        <ScoreLyricsEditor v-show="scoreEditor.activeTab === 'edit'" />

        <ScoreInteractiveArea
          v-show="scoreEditor.activeTab !== 'edit'"
          ref="interactiveAreaRef"
          :selected-line-set
          :export-page-line-set
          :include-meta-bar
          :is-exporting="isGenerating"
          @open-picker="openChordPicker"
          @line-click="handleLineClick"
        />
      </template>

      <EmptyState v-else :icon="Music" title="未选择乐谱" description="请在左侧侧边栏选择或新建一份乐谱" size="lg" />
    </div>

    <ScoreExportFloatingBar
      v-if="scoreEditor.activeSong && scoreEditor.activeTab === 'interactive'"
      :is-all-selected
      :selected-count="selectedLineSet.size"
      :sorted-indices="sortedSelectedIndices"
      @remove-index="handleRemoveLineIndex"
      @toggle-select-all="handleToggleSelectAll"
      @open-export="previewVisible = true"
      v-model:include-meta-bar="includeMetaBar"
    />

    <ChordPickerModal v-model:visible="isPickerOpen" />

    <ScoreExportPreviewModal
      v-model:visible="previewVisible"
      v-model:mode="exportMode"
      v-model:current-page-index="currentPageIndex"
      :pages
      :progress
      :current-page
      :is-generating
      @copy-current-page="copyCurrentPage"
      @download-pdf="downloadPdf"
      @download-current-page="downloadCurrentPage"
    />
  </div>
</template>

<script setup lang="ts">
import EmptyState from '@/components/EmptyState.vue';
import { useLineSelection } from '@/services/useLineSelection';
import { useScoreExportPreview } from '@/services/useScoreExportPreview.ts';
import { useScoreLinesData } from '@/services/useScoreLinesData.ts';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { Music } from '@lucide/vue';
import { useEventListener } from '@vueuse/core';
import { computed, ref, useTemplateRef, watch } from 'vue';
import ChordPickerModal from './ChordPickerModal.vue';
import ScoreExportFloatingBar from './ScoreExportFloatingBar.vue';
import ScoreExportPreviewModal from './ScoreExportPreviewModal.vue';
import ScoreInteractiveArea from './ScoreInteractiveArea.vue';
import ScoreLyricsEditor from './ScoreLyricsEditor.vue';

const exportPageLineSet = ref<Set<number>>(new Set());
const scoreEditor = useScoreEditorStore();
const isPickerOpen = ref(false);
const previewVisible = ref(false);
const interactiveAreaRef = useTemplateRef<InstanceType<typeof ScoreInteractiveArea>>('interactiveAreaRef');
const exportHeaderMetaRef = computed(() => interactiveAreaRef.value?.exportHeaderMetaRef ?? null);
const a4CaptureWrapperRef = computed(() => interactiveAreaRef.value?.a4CaptureWrapperRef ?? null);

const { lyricsLinesWithEdges } = useScoreLinesData();
const totalLines = computed(() => lyricsLinesWithEdges.value.length);

const {
  selectedLineSet,
  isAllSelected,
  sortedSelectedIndices,
  handleRemoveLineIndex,
  handleToggleSelectAll,
  handleLineClick,
} = useLineSelection(
  totalLines,
  computed(() => scoreEditor.activeSong)
);

const {
  mode: exportMode,
  pages,
  currentPage,
  currentPageIndex,
  isGenerating,
  includeMetaBar,
  progress,
  generatePreview,
  copyCurrentPage,
  downloadPdf,
  clearPreview,
  downloadCurrentPage,
} = useScoreExportPreview(sortedSelectedIndices, exportHeaderMetaRef, exportPageLineSet, a4CaptureWrapperRef);

watch(previewVisible, open => {
  if (open) generatePreview();
  else clearPreview();
});
watch([exportMode, includeMetaBar], () => {
  if (previewVisible.value) generatePreview();
});

const openChordPicker = (slotKey: string | number) => {
  scoreEditor.selectedSlotKey = slotKey;
  isPickerOpen.value = true;
};

useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (!scoreEditor.activeSong) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    e.shiftKey ? scoreEditor.redo() : scoreEditor.undo();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    scoreEditor.redo();
  }
});
</script>
<style scoped lang="less">
@import '@/assets/tokens.module';

.score-view-wrapper {
  display: flex;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
}

.score-main-content {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background-color: var(--bg-main);
  box-sizing: border-box;
  overflow-y: auto;
}
</style>
