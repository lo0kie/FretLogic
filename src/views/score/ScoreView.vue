<template>
  <div class="score-view-wrapper">
    <div class="score-main-content">
      <template v-if="scoreEditor.activeSong">
        <ScoreLyricsEditor v-show="scoreEditor.activeTab === 'edit'" />

        <ScoreInteractiveArea
          v-show="scoreEditor.activeTab !== 'edit'"
          ref="interactiveAreaRef"
          :selected-line-set="selectedLineSet"
          :is-exporting="isExporting"
          @open-picker="openChordPicker"
          @line-click="handleLineClick"
          :include-meta-bar="includeMetaBar"
        />
      </template>

      <EmptyState v-else :icon="Music" title="未选择乐谱" description="请在左侧侧边栏选择或新建一份乐谱" size="lg" />
    </div>

    <ScoreExportFloatingBar
      v-if="scoreEditor.activeSong && scoreEditor.activeTab === 'interactive'"
      :selected-count="selectedLineSet.size"
      :sorted-indices="sortedSelectedIndices"
      :is-all-selected="isAllSelected"
      :is-exporting="isExporting"
      @remove-index="handleRemoveLineIndex"
      @toggle-select-all="handleToggleSelectAll"
      @copy-image="handleCopySelectedImage"
      v-model:include-meta-bar="includeMetaBar"
    />

    <ChordPickerModal v-model:visible="isPickerOpen" />
  </div>
</template>

<script setup lang="ts">
import EmptyState from '@/components/EmptyState.vue';
import { useLineSelection } from '@/services/useLineSelection';
import { useScoreImageExport } from '@/services/useScoreExport.ts';
import { useScoreLinesData } from '@/services/useScoreLinesData.ts';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { Music } from '@lucide/vue';
import { useEventListener } from '@vueuse/core';
import { computed, ref } from 'vue';
import ChordPickerModal from './ChordPickerModal.vue';
import ScoreExportFloatingBar from './ScoreExportFloatingBar.vue';
import ScoreInteractiveArea from './ScoreInteractiveArea.vue';
import ScoreLyricsEditor from './ScoreLyricsEditor.vue';

const scoreEditor = useScoreEditorStore();
const isPickerOpen = ref(false);

const { lyricsLinesWithEdges } = useScoreLinesData();
const totalLines = computed(() => lyricsLinesWithEdges.value.length);
const activeSongId = computed(() => scoreEditor.activeSongId);

const {
  selectedLineSet,
  isAllSelected,
  sortedSelectedIndices,
  handleRemoveLineIndex,
  handleToggleSelectAll,
  handleLineClick,
} = useLineSelection(totalLines, activeSongId);

const { isExporting, handleCopySelectedImage, includeMetaBar } = useScoreImageExport(selectedLineSet);

const openChordPicker = (slotKey: string | number) => {
  scoreEditor.selectedSlotKey = slotKey;
  isPickerOpen.value = true;
};

// 🌟 注册全局快捷键：撤销 (Ctrl+Z) 与 重做 (Ctrl+Y 或 Ctrl+Shift+Z)
useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (!scoreEditor.activeSong) return;

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) {
      scoreEditor.redo();
    } else {
      scoreEditor.undo();
    }
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
