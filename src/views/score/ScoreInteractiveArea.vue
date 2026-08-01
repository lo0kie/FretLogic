<template>
  <div class="interactive-score-zone no-scrollbar" ref="scoreZoneRef" :class="{ 'is-exporting': isExporting }">
    <div v-if="!scoreEditor.activeSong?.lyrics.trim()" class="empty-lyrics-tip">请先在“编辑歌词”模式下输入文本内容</div>

    <div v-else class="lyrics-lines-container">
      <div
        v-for="lineData in lyricsLinesWithEdges"
        :key="lineData.lineIdx"
        :data-line-idx="lineData.lineIdx"
        class="lyrics-line"
        :class="{ 'is-line-selected': !isExporting && selectedLineSet.has(lineData.lineIdx) }"
      >
        <div class="line-index-badge">
          <span
            class="index-text-tag"
            :class="{ 'is-selected': !isExporting && selectedLineSet.has(lineData.lineIdx) }"
            @pointerdown="e => handlePointerDown(e, lineData.lineIdx)"
          >
            {{ formatLineIndex(lineData.lineIdx) }}
          </span>
        </div>

        <!-- 1. 行首插槽区域 -->
        <div class="edge-chords-group" @dragover.prevent="handleGlobalDragOver">
          <ChordSlotCell
            variant="add"
            :slot-key="lineData.nextStartKey"
            add-placeholder-title="点击添加行首和弦"
            :is-drop-target="dragOverSlotKey === lineData.nextStartKey"
            :is-dark-mode="settingsStore.isDarkMode"
            @click="emit('open-picker', lineData.nextStartKey)"
            @dragover="handleDragOver($event, lineData.nextStartKey)"
            @dragleave="handleDragLeave"
            @drop="handleDrop(lineData.nextStartKey)"
            @remove="slotKey => scoreEditor.removeSlotChord(slotKey)"
          />

          <ChordSlotCell
            v-for="item in lineData.startChords"
            :key="item.slotKey"
            variant="edge"
            :slot-key="item.slotKey"
            :chord="item.chord"
            :is-drop-target="dragOverSlotKey === item.slotKey"
            :is-dark-mode="settingsStore.isDarkMode"
            @click="emit('open-picker', item.slotKey)"
            @dragover="handleDragOver($event, item.slotKey)"
            @dragleave="handleDragLeave"
            @drop="handleDrop(item.slotKey)"
            @dragstart="handleDragStart(item.slotKey)"
            @dragend="handleDragEnd"
            @remove="slotKey => scoreEditor.removeSlotChord(slotKey)"
          />
        </div>

        <!-- 2. 中间字符和弦区 -->
        <ChordSlotCell
          v-for="item in lineData.chars"
          :key="item.globalIndex"
          variant="char"
          :slot-key="item.globalIndex"
          :chord="scoreEditor.activeSong?.chordMap[item.globalIndex]"
          :char="item.char"
          :is-drop-target="dragOverSlotKey === item.globalIndex"
          :is-dark-mode="settingsStore.isDarkMode"
          @click="emit('open-picker', item.globalIndex)"
          @dragover="handleDragOver($event, item.globalIndex)"
          @dragleave="handleDragLeave"
          @drop="handleDrop(item.globalIndex)"
          @dragstart="handleDragStart(item.globalIndex)"
          @dragend="handleDragEnd"
          @remove="slotKey => scoreEditor.removeSlotChord(slotKey)"
        />

        <!-- 3. 行尾插槽区域 -->
        <div class="edge-chords-group" @dragover.prevent="handleGlobalDragOver">
          <ChordSlotCell
            v-for="item in lineData.endChords"
            :key="item.slotKey"
            variant="edge"
            :slot-key="item.slotKey"
            :chord="item.chord"
            :is-drop-target="dragOverSlotKey === item.slotKey"
            :is-dark-mode="settingsStore.isDarkMode"
            @click="emit('open-picker', item.slotKey)"
            @dragover="handleDragOver($event, item.slotKey)"
            @dragleave="handleDragLeave"
            @drop="handleDrop(item.slotKey)"
            @dragstart="handleDragStart(item.slotKey)"
            @dragend="handleDragEnd"
            @remove="slotKey => scoreEditor.removeSlotChord(slotKey)"
          />

          <ChordSlotCell
            variant="add"
            :slot-key="lineData.nextEndKey"
            add-placeholder-title="点击添加行尾和弦"
            :is-drop-target="dragOverSlotKey === lineData.nextEndKey"
            :is-dark-mode="settingsStore.isDarkMode"
            @click="emit('open-picker', lineData.nextEndKey)"
            @dragover="handleDragOver($event, lineData.nextEndKey)"
            @dragleave="handleDragLeave"
            @drop="handleDrop(lineData.nextEndKey)"
            @remove="slotKey => scoreEditor.removeSlotChord(slotKey)"
          />
        </div>
      </div>
    </div>

    <!-- 底部多选导出浮动控制工具栏 -->
    <ScoreExportFloatingBar
      :selected-count="selectedLineSet.size"
      :sorted-indices="sortedSelectedIndices"
      :is-all-selected="isAllSelected"
      :is-exporting="isExporting"
      @remove-index="handleRemoveLineIndex"
      @toggle-select-all="handleToggleSelectAll"
      @copy-image="handleCopySelectedImage"
    />
  </div>
</template>

<script setup lang="ts">
import { useLineSelection } from '@/services/useLineSelection';
import { useLyricsDragDrop } from '@/services/useLyricsDragDrop';
import { useLyricsLinesData } from '@/services/useLyricsLinesData';
import { useScoreImageExport } from '@/services/useScoreImageExport';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { computed, ref } from 'vue';
import ChordSlotCell from './ChordSlotCell.vue';
import ScoreExportFloatingBar from './ScoreExportFloatingBar.vue';

const emit = defineEmits<{
  (e: 'open-picker', slotKey: string | number): void;
}>();

const scoreEditor = useScoreEditorStore();
const settingsStore = useSettingsStore();

const scoreZoneRef = ref<HTMLElement | null>(null);

const {
  dragOverSlotKey,
  handleGlobalDragOver,
  handleDragStart,
  handleDragOver,
  handleDragLeave,
  handleDragEnd,
  handleDrop,
} = useLyricsDragDrop();

const { lyricsLinesWithEdges } = useLyricsLinesData();
const totalLines = computed(() => lyricsLinesWithEdges.value.length);
const activeSongId = computed(() => scoreEditor.activeSongId);

const {
  selectedLineSet,
  isAllSelected,
  sortedSelectedIndices,
  handleRemoveLineIndex,
  handlePointerDown,
  handleToggleSelectAll,
} = useLineSelection(scoreZoneRef, totalLines, activeSongId);

const { isExporting, handleCopySelectedImage } = useScoreImageExport(scoreZoneRef, selectedLineSet);

const formatLineIndex = (index: number) => String(index + 1).padStart(2, '0');
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.interactive-score-zone {
  flex: 1;
  padding: 1.2rem 2rem 5rem 2rem;
  overflow-y: auto;
  overflow-x: auto;
  box-sizing: border-box;
  position: relative;

  // 🌟 导出截图期间：!important 强制压过 .index-text-tag.is-selected 的 !important 高亮样式，
  // 保证无论响应式更新时序如何，截图里都不会残留选中态视觉
  &.is-exporting {
    .lyrics-line {
      background-color: transparent !important;
    }

    .index-text-tag {
      color: var(--text-disabled) !important;
      background-color: transparent !important;
    }
  }
}

.empty-lyrics-tip {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  color: var(--text-disabled);
  font-size: 0.85rem;
}

.lyrics-lines-container {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  max-width: 900px;
  margin: 0 auto;
  width: max-content;
  min-width: 100%;
}

.lyrics-line {
  display: flex;
  flex-wrap: nowrap;
  gap: 0;
  align-items: stretch;
  width: max-content;
  min-width: 100%;
  padding: 0.2rem 0.4rem;
  border-radius: @radius-md;
  transition: background-color @duration-fast ease;

  &:hover {
    background-color: var(--bg-panel-hover);

    .index-text-tag:not(.is-selected) {
      color: var(--color-primary);
      background-color: color-mix(in srgb, var(--color-primary), transparent 90%);
    }

    :deep(.add-btn-slot .add-edge-placeholder) {
      opacity: 1;
      pointer-events: auto;
    }
  }

  &.is-line-selected {
    background-color: color-mix(in srgb, var(--color-primary), transparent 92%);
  }
}

.line-index-badge {
  display: flex;
  align-items: flex-end;
  padding-bottom: 0.1rem;
  margin-right: 0.5rem;
  user-select: none;
  flex-shrink: 0;
}

.index-text-tag {
  font-size: 0.65rem;
  font-weight: 700;
  font-family: monospace;
  color: var(--text-disabled);
  padding: 0.08rem 0.35rem;
  border-radius: @radius-sm;
  cursor: pointer !important;
  transition:
    color @duration-fast ease,
    background-color @duration-fast ease;

  &.is-selected {
    color: #ffffff !important;
    background-color: var(--color-primary) !important;
  }
}

.edge-chords-group {
  display: flex;
  align-items: stretch;
  gap: 0;
}
</style>

<style lang="less">
body.is-global-dragging {
  &,
  & * {
    cursor: grabbing;
  }

  .interactive-score-zone {
    .char-text,
    .inline-chord-name,
    .fretboard-layout-scaler,
    .line-index-badge,
    svg {
      pointer-events: none;
    }

    .char-box {
      pointer-events: auto;
    }
  }
}
</style>
