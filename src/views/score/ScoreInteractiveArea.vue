<template>
  <div
    ref="scoreZoneRef"
    class="interactive-score-zone no-scrollbar"
    :style="{ '--score-font-scale': scoreEditor.fontScale }"
  >
    <div ref="a4CaptureWrapperRef" class="a4-capture-wrapper">
      <EmptyState
        v-if="!scoreEditor.activeSong?.lyrics.trim()"
        :icon="FileText"
        description="请先在“编辑歌词”模式下输入文本内容"
        size="lg"
      />

      <div v-else class="lyrics-lines-container" :class="{ 'is-export-mode': isExporting }" ref="lyricsRef">
        <div v-show="isExporting && includeMetaBar" class="export-header-meta" ref="exportHeaderMetaRef">
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
            'is-line-selected': isLineVisibleInExport(lineData.lineIdx),
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
              @click="emit('open-picker', item.slotKey)"
              @dragover="handleDragOver($event, item.slotKey)"
              @dragleave="handleDragLeave"
              @drop="handleDrop(item.slotKey)"
              @dragstart="handleDragStart($event, item.slotKey)"
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
            @click="emit('open-picker', item.slotKey)"
            @dragover="handleDragOver($event, item.slotKey)"
            @dragleave="handleDragLeave"
            @drop="handleDrop(item.slotKey)"
            @dragstart="handleDragStart($event, item.slotKey)"
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
              @click="emit('open-picker', item.slotKey)"
              @dragover="handleDragOver($event, item.slotKey)"
              @dragleave="handleDragLeave"
              @drop="handleDrop(item.slotKey)"
              @dragstart="handleDragStart($event, item.slotKey)"
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
  </div>
</template>

<script setup lang="ts">
import EmptyState from '@/components/EmptyState.vue';
import { A4_HEIGHT_PX, A4_MARGIN_PX, A4_WIDTH_PX } from '@/constants/print';
import { useLyricsDragDrop } from '@/services/useLyricsDragDrop';
import { useScoreLinesData } from '@/services/useScoreLinesData.ts';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useUiStore } from '@/stores/uiStore.ts';
import type { Chord } from '@/types';
import { FileText } from '@lucide/vue';
import { onActivated, onDeactivated, useTemplateRef } from 'vue';
import ChordSlotCell from './ChordSlotCell.vue';
defineOptions({ name: 'ScoreInteractiveArea' });

const props = defineProps<{
  selectedLineSet: Set<number>;
  exportPageLineSet?: Set<number>;
  isExporting: boolean;
  includeMetaBar: boolean;
}>();

const emit = defineEmits<{
  (e: 'open-picker', slotKey: string | number): void;
  (e: 'line-click', lineIdx: number): void;
}>();

const uiStore = useUiStore();
const scoreEditor = useScoreEditorStore();

const scoreZoneRef = useTemplateRef<HTMLElement>('scoreZoneRef');
const lyricsRef = useTemplateRef<HTMLElement>('lyricsRef');
const exportHeaderMetaRef = useTemplateRef<HTMLElement>('exportHeaderMetaRef');
const a4CaptureWrapperRef = useTemplateRef<HTMLElement>('a4CaptureWrapperRef');

const {
  dragOverSlotKey,
  handleGlobalDragOver,
  handleDragStart,
  handleDragOver,
  handleDragLeave,
  handleDragEnd,
  handleDrop,
} = useLyricsDragDrop();

const { lyricsLinesWithEdges, chordsLookupMap } = useScoreLinesData();
const formatLineIndex = (index: number) => String(index + 1).padStart(2, '0');

const isLineVisibleInExport = (lineIdx: number) => {
  // 当为导出/预览生成阶段时，如果在分页处理中有指定页面的 Set 则只显示对应页
  if (props.isExporting && props.exportPageLineSet && props.exportPageLineSet.size > 0) {
    return props.exportPageLineSet.has(lineIdx);
  }
  return props.selectedLineSet.has(lineIdx);
};

const getCharChord = (slotKey: string): Chord | undefined => {
  const chordId = scoreEditor.activeSong?.chordMap[slotKey];
  return chordId ? chordsLookupMap.value.get(chordId) : undefined;
};

const handleLineClick = (ev: MouseEvent, lineIdx: number) => {
  if (props.isExporting) return;
  const target = ev.target as HTMLElement;

  if (target.closest('.char-box')) {
    return;
  }

  emit('line-click', lineIdx);
};

onActivated(() => {
  uiStore.activeExportTarget = lyricsRef.value ?? null;
});

onDeactivated(() => {
  if (uiStore.activeExportTarget === lyricsRef.value) uiStore.activeExportTarget = null;
});

defineExpose({ scoreZoneRef, exportHeaderMetaRef, a4CaptureWrapperRef });
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
    min-width: 0 !important;
    width: max-content !important;

    :deep(.add-btn-slot) {
      display: none !important;
    }

    .lyrics-line {
      transition: none !important;

      .index-text-tag {
        transition: none !important;
      }

      &:not(.is-line-selected) {
        display: none !important;
      }

      &.is-line-selected {
        min-width: 0 !important;
        width: max-content !important;
        background-color: transparent !important;
        border-color: transparent !important;
      }
    }
  }
}

.export-header-meta {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding-bottom: 1.2rem;
  margin-bottom: 0.8rem;
  width: 100%;
}

.export-song-title {
  font-size: v-bind('`${1.5 * scoreEditor.fontScale}rem`');
  font-weight: 800;
  color: var(--text-title);
  margin: 0 0 0.4rem 0;
  letter-spacing: -0.02em;
}

.export-song-info {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: v-bind('`${0.75 * scoreEditor.fontScale}rem`');
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

.a4-capture-wrapper {
  display: contents;

  &.is-a4-capture-mode {
    display: flex;
    flex-direction: column;
    align-items: center;
    box-sizing: border-box;
    width: v-bind('A4_WIDTH_PX + "px"');
    height: v-bind('A4_HEIGHT_PX + "px"');
    padding: v-bind('A4_MARGIN_PX + "px"');
    overflow: hidden;

    // 🌟 A4 截图态下，让歌词容器撑满 wrapper 里除页眉外剩下的高度
    .lyrics-lines-container.is-export-mode {
      flex: 1 1 auto;
      min-height: 0; // flex 子项默认 min-height:auto 会撑不满父级，必须显式清零
      justify-content: space-between; // 🌟 有多余高度时，行与行之间平分掉，而不是全堆在最后一行下面
    }
  }
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
