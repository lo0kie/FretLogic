<template>
  <div class="score-view-wrapper relative box-border flex h-full w-full overflow-hidden">
    <div
      class="score-main-content bg-bg-main relative box-border flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    >
      <Transition mode="out-in" name="v-transition-fade">
        <EmptyState
          v-if="!scoreEditor.activeSong"
          description="请在左侧侧边栏选择或新建一份乐谱"
          icon="music"
          key="empty"
          size="lg"
          title="未选择乐谱"
        />

        <ScoreLyricsEditor
          v-else-if="scoreEditor.activeTab === 'edit'"
          :key="`lyrics-editor-${scoreEditor.activeSong.id}`"
        />

        <ScoreInteractiveArea
          v-else
          :export-page-line-set
          :include-meta-bar
          :is-exporting="isGenerating"
          :key="`interactive-area-${scoreEditor.activeSong.id}`"
          :selected-line-set
          @line-click="handleLineClick"
          @open-picker="openChordPicker"
          ref="interactiveAreaRef"
        />
      </Transition>
    </div>

    <ScoreExportFloatingBar
      v-model:include-meta-bar="includeMetaBar"
      :is-all-selected
      :selected-count="selectedLineSet.size"
      :sorted-indices="sortedSelectedIndices"
      :visible="Boolean(scoreEditor.activeSong && scoreEditor.activeTab === 'interactive')"
      @open-export="previewVisible = true"
      @remove-index="handleRemoveLineIndex"
      @toggle-select-all="handleToggleSelectAll"
    />

    <ChordPickerModal v-model:visible="isPickerOpen" />

    <ScoreExportPreviewModal
      v-model:current-page-index="currentPageIndex"
      v-model:mode="exportMode"
      v-model:quality="scoreEditor.exportQuality"
      v-model:visible="previewVisible"
      :current-page
      :is-generating
      :pages
      :progress
      @commit-quality="applyQuality"
      @copy-current-page="copyCurrentPage"
      @download-current-page="downloadCurrentPage"
      @download-pdf="downloadPdf"
    />
  </div>
</template>

<script lang="ts" setup>
import { computed, onActivated, onBeforeUnmount, onDeactivated, ref, useTemplateRef, watch } from 'vue';

import { useEventListener } from '@vueuse/core';

import EmptyState from '@/components/ui/EmptyState.vue';
import { useLineSelection } from '@/features/score-editor/composables/useLineSelection';
import { useScoreExportPreview } from '@/features/score-editor/composables/useScoreExportPreview';
import { useScoreLinesData } from '@/features/score-editor/composables/useScoreLinesData';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import type { SlotKey } from '@/types';

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

/** 用户点击歌词槽位：记录选中槽位并打开和弦选择弹窗 */
const openChordPicker = (slotKey: SlotKey) => {
  scoreEditor.selectedSlotKey = slotKey;
  isPickerOpen.value = true;
};

// KeepAlive 缓存页面：仅在本页激活时拦截 Ctrl+Z / Ctrl+Y，切走后移除监听
let stopUndoKeydown: (() => void) | null = null;
/** 拦截 Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y 触发乐谱撤销重做（焦点在输入类元素内时不拦截） */
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
