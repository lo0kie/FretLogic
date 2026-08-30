<template>
  <div class="score-view-wrapper relative flex w-full h-full box-border overflow-hidden">
    <div
      class="score-main-content flex-1 h-full flex flex-col min-w-0 min-h-0 bg-bg-main box-border overflow-y-auto relative"
    >
      <Transition name="v-transition-fade" mode="out-in">
        <EmptyState
          v-if="!scoreEditor.activeSong"
          key="empty"
          :icon="Music"
          title="未选择乐谱"
          description="请在左侧侧边栏选择或新建一份乐谱"
          size="lg"
        />

        <ScoreLyricsEditor
          v-else-if="scoreEditor.activeTab === 'edit'"
          :key="`lyrics-editor-${scoreEditor.activeSong.id}`"
        />

        <ScoreInteractiveArea
          v-else
          :key="`interactive-area-${scoreEditor.activeSong.id}`"
          ref="interactiveAreaRef"
          :selected-line-set
          :export-page-line-set
          :include-meta-bar
          :is-exporting="isGenerating"
          @open-picker="openChordPicker"
          @line-click="handleLineClick"
        />
      </Transition>
    </div>

    <ScoreExportFloatingBar
      v-model:include-meta-bar="includeMetaBar"
      :visible="Boolean(scoreEditor.activeSong && scoreEditor.activeTab === 'interactive')"
      :is-all-selected
      :selected-count="selectedLineSet.size"
      :sorted-indices="sortedSelectedIndices"
      @remove-index="handleRemoveLineIndex"
      @toggle-select-all="handleToggleSelectAll"
      @open-export="previewVisible = true"
    />

    <ChordPickerModal v-model:visible="isPickerOpen" />

    <ScoreExportPreviewModal
      v-model:visible="previewVisible"
      v-model:mode="exportMode"
      v-model:current-page-index="currentPageIndex"
      v-model:quality="scoreEditor.exportQuality"
      :pages
      :progress
      :current-page
      :is-generating
      @copy-current-page="copyCurrentPage"
      @download-pdf="downloadPdf"
      @download-current-page="downloadCurrentPage"
      @commit-quality="applyQuality"
    />
  </div>
</template>

<script setup lang="ts">
import EmptyState from '@/components/base/EmptyState.vue';
import { useLineSelection } from '@/composables/score/useLineSelection';
import { useScoreExportPreview } from '@/composables/score/useScoreExportPreview';
import { useScoreLinesData } from '@/composables/score/useScoreLinesData';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import type { SlotKey } from '@/types';
import { Music } from '@lucide/vue';
import { useEventListener } from '@vueuse/core';
import { computed, onActivated, onBeforeUnmount, onDeactivated, ref, useTemplateRef, watch } from 'vue';
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
  applyQuality,
} = useScoreExportPreview(sortedSelectedIndices, exportHeaderMetaRef, exportPageLineSet, a4CaptureWrapperRef);

watch(previewVisible, open => {
  if (open) generatePreview();
  else clearPreview();
});
watch([exportMode, includeMetaBar], () => {
  if (previewVisible.value) generatePreview();
});

const openChordPicker = (slotKey: SlotKey) => {
  scoreEditor.selectedSlotKey = slotKey;
  isPickerOpen.value = true;
};

// KeepAlive 缓存页面：仅在本页激活时拦截 Ctrl+Z / Ctrl+Y，切走后移除监听
let stopUndoKeydown: (() => void) | null = null;
const handleUndoKeydown = (e: KeyboardEvent) => {
  if (!scoreEditor.activeSong) return;
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) scoreEditor.redo();
    else scoreEditor.undo();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    scoreEditor.redo();
  }
};
onActivated(() => {
  if (!stopUndoKeydown) {
    stopUndoKeydown = useEventListener(window, 'keydown', handleUndoKeydown);
  }
});
onDeactivated(() => {
  stopUndoKeydown?.();
  stopUndoKeydown = null;
});
onBeforeUnmount(() => {
  stopUndoKeydown?.();
  stopUndoKeydown = null;
});
</script>
