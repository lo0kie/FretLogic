<template>
  <div
    ref="scoreZoneRef"
    class="interactive-score-zone no-scrollbar"
    :style="{ '--score-font-scale': scoreEditor.fontScale }"
  >
    <EmptyState
      v-if="!scoreEditor.activeSong?.lyrics.trim()"
      :icon="FileText"
      description="请先在“编辑歌词”模式下输入文本内容"
      size="lg"
    />

    <div v-else class="lyrics-lines-container" :class="{ 'is-export-mode': isExporting }">
      <div v-show="isExporting && includeMetaBar" class="export-header-meta">
        <h1 class="export-song-title">{{ scoreEditor.activeSong?.title }}</h1>
        <div class="export-song-info">
          <span>{{ scoreEditor.activeSong.key }} 调</span>
          <span class="info-divider">|</span>
          <span>Capo: {{ scoreEditor.activeSong.capo }}</span>
        </div>
      </div>

      <div
        v-wave
        v-for="lineData in lyricsLinesWithEdges"
        :key="lineData.lineIdx"
        :data-line-idx="lineData.lineId"
        class="lyrics-line"
        :class="{
          'is-line-selected': !isExporting && selectedLineSet.has(lineData.lineIdx),
        }"
        @click="e => handleLineClick(e, lineData.lineIdx)"
      >
        <!-- 行号标记 -->
        <div class="line-index-badge" v-show="!isExporting">
          <span
            class="index-text-tag"
            :class="{ 'is-selected': !isExporting && selectedLineSet.has(lineData.lineIdx) }"
          >
            {{ formatLineIndex(lineData.lineIdx) }}
          </span>
        </div>

        <!-- 1. 行首插槽区域 -->
        <div class="edge-chords-group" @dragover.prevent="handleGlobalDragOver">
          <ChordSlotCell
            :is-exporting="isExporting"
            :scroll-root="scoreZoneRef"
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
            :is-exporting="isExporting"
            :scroll-root="scoreZoneRef"
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
          :is-exporting="isExporting"
          :scroll-root="scoreZoneRef"
          v-for="item in lineData.chars"
          :key="item.slotKey"
          variant="char"
          :slot-key="item.slotKey"
          :chord="getCharChord(item.slotKey)"
          :char="item.char"
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

        <!-- 3. 行尾插槽区域 -->
        <div class="edge-chords-group" @dragover.prevent="handleGlobalDragOver">
          <ChordSlotCell
            :is-exporting="isExporting"
            :scroll-root="scoreZoneRef"
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
            :is-exporting="isExporting"
            :scroll-root="scoreZoneRef"
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
  </div>
</template>

<script setup lang="ts">
import EmptyState from '@/components/EmptyState.vue';
import { useLyricsDragDrop } from '@/services/useLyricsDragDrop';
import { useLyricsLinesData } from '@/services/useLyricsLinesData';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Chord } from '@/types';
import { FileText } from '@lucide/vue';
import { useTemplateRef } from 'vue';
import ChordSlotCell from './ChordSlotCell.vue';

defineOptions({ name: 'ScoreInteractiveArea' });

const props = defineProps<{
  selectedLineSet: Set<number>;
  isExporting: boolean;
  includeMetaBar: boolean;
}>();

const emit = defineEmits<{
  (e: 'open-picker', slotKey: string | number): void;
  (e: 'line-click', lineIdx: number): void;
}>();

const scoreEditor = useScoreEditorStore();
const settingsStore = useSettingsStore();

const scoreZoneRef = useTemplateRef<HTMLElement>('scoreZoneRef');

const {
  dragOverSlotKey,
  handleGlobalDragOver,
  handleDragStart,
  handleDragOver,
  handleDragLeave,
  handleDragEnd,
  handleDrop,
} = useLyricsDragDrop();

const { lyricsLinesWithEdges, chordsLookupMap } = useLyricsLinesData();

const formatLineIndex = (index: number) => String(index + 1).padStart(2, '0');

const getCharChord = (slotKey: string): Chord | undefined => {
  const chordId = scoreEditor.activeSong?.chordMap[slotKey];
  return chordId ? chordsLookupMap.value.get(chordId) : undefined;
};

const handleLineClick = (ev: MouseEvent, lineIdx: number) => {
  if (props.isExporting) return;
  const target = ev.target as HTMLElement;

  if (target.closest('.chord-slot-cell')) {
    return;
  }

  emit('line-click', lineIdx);
};

defineExpose({ scoreZoneRef });
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
}

.lyrics-lines-container {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  max-width: 900px;
  margin: 0 auto;
  width: max-content;
  min-width: 100%;

  &.is-export-mode {
    :deep(.add-btn-slot) {
      display: none !important;
    }
  }
}

.export-header-meta {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-bottom: 1.2rem;
  margin-bottom: 0.8rem;
  width: 100%;
}

.export-song-title {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--text-title);
  margin: 0 0 0.4rem 0;
  letter-spacing: -0.02em;
}

.export-song-info {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-body);
}

.info-divider {
  color: var(--text-disabled);
  opacity: 0.5;
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
  transition:
    background-color @duration-fast ease,
    border-color @duration-fast ease;
  cursor: pointer;
  user-select: none;
  box-sizing: border-box;
  border: 1px solid transparent;

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
    border-color: color-mix(in srgb, var(--color-primary), transparent 70%);
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
