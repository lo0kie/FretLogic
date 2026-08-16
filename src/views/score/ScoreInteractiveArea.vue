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

        <div v-for="lineData in lyricsLinesWithEdges" :key="lineData.lineId" class="line-row">
          <GlobalContextMenu
            :items="getLineMenuItems(lineData)"
            :disabled="isExporting || isDragging || !isGlobalEditable"
            #="{ isOpen }"
          >
            <div
              v-wave
              :data-line-idx="lineData.lineId"
              v-memo="[
                lineData.lineId,
                lineData.chars.length,
                lineData.startChords.length,
                lineData.endChords.length,
                isLineVisibleInExport(lineData.lineIdx),
                selectedLineSet.has(lineData.lineIdx),
                dragOverSlotKey,
                draggingSlotKey,
                isExporting,
                scoreEditor.fontScale,
                scoreEditor.fretboardScale,
              ]"
              class="lyrics-line"
              :class="{
                'is-line-selected': isLineVisibleInExport(lineData.lineIdx),
                'is-context-open': isOpen,
              }"
              @click="e => handleLineClick(e, lineData.lineIdx)"
            >
              <div class="line-index-badge" v-show="!isExporting">
                <span
                  class="index-text-tag"
                  :class="{ 'is-selected': !isExporting && selectedLineSet.has(lineData.lineIdx) }"
                >
                  {{ formatLineIndex(lineData.lineIdx) }}
                </span>
              </div>
              <div class="edge-chords-group">
                <ChordSlotCell
                  :is-exporting
                  :scroll-root="scoreZoneRef"
                  variant="add"
                  :slot-key="lineData.nextStartKey"
                  add-placeholder-title="点击添加行首和弦"
                  :is-drop-target="dragOverSlotKey === lineData.nextStartKey"
                  :is-dragging-source="draggingSlotKey === lineData.nextStartKey"
                  @click="emit('open-picker', lineData.nextStartKey)"
                  @pointerdown="handlePointerDown"
                  @remove="slotKey => scoreEditor.removeSlotChord(slotKey)"
                />
                <ChordSlotCell
                  :is-exporting
                  :scroll-root="scoreZoneRef"
                  v-for="item in lineData.startChords"
                  :key="item.slotKey"
                  variant="edge"
                  :slot-key="item.slotKey"
                  :chord="item.chord"
                  :is-drop-target="dragOverSlotKey === item.slotKey"
                  :is-dragging-source="draggingSlotKey === item.slotKey"
                  @click="emit('open-picker', item.slotKey)"
                  @pointerdown="handlePointerDown"
                  @remove="slotKey => scoreEditor.removeSlotChord(slotKey)"
                />
              </div>
              <ChordSlotCell
                :is-exporting
                :scroll-root="scoreZoneRef"
                v-for="item in lineData.chars"
                :key="item.slotKey"
                variant="char"
                :slot-key="item.slotKey"
                :chord="getCharChord(item.slotKey)"
                :char="item.char"
                :is-drop-target="dragOverSlotKey === item.slotKey"
                :is-dragging-source="draggingSlotKey === item.slotKey"
                @click="emit('open-picker', item.slotKey)"
                @pointerdown="handlePointerDown"
                @remove="slotKey => scoreEditor.removeSlotChord(slotKey)"
              />
              <div class="edge-chords-group">
                <ChordSlotCell
                  :is-exporting
                  :scroll-root="scoreZoneRef"
                  v-for="item in lineData.endChords"
                  :key="item.slotKey"
                  variant="edge"
                  :slot-key="item.slotKey"
                  :chord="item.chord"
                  :is-drop-target="dragOverSlotKey === item.slotKey"
                  :is-dragging-source="draggingSlotKey === item.slotKey"
                  @click="emit('open-picker', item.slotKey)"
                  @pointerdown="handlePointerDown"
                  @remove="slotKey => scoreEditor.removeSlotChord(slotKey)"
                />
                <ChordSlotCell
                  :is-exporting
                  :scroll-root="scoreZoneRef"
                  variant="add"
                  :slot-key="lineData.nextEndKey"
                  add-placeholder-title="点击添加行尾和弦"
                  :is-drop-target="dragOverSlotKey === lineData.nextEndKey"
                  :is-dragging-source="draggingSlotKey === lineData.nextEndKey"
                  @click="emit('open-picker', lineData.nextEndKey)"
                  @pointerdown="handlePointerDown"
                  @remove="slotKey => scoreEditor.removeSlotChord(slotKey)"
                />
              </div>
            </div>
          </GlobalContextMenu>

          <div class="line-row-gutter" aria-hidden="true"></div>
        </div>
      </div>
    </div>
    <Teleport to="body">
      <div
        v-if="isDragging"
        class="drag-ghost-floating"
        :style="{
          transform: `translate3d(${ghostPos.x}px, ${ghostPos.y}px, 0)`,
        }"
      >
        <div class="drag-ghost-card">
          <span class="ghost-chord-name">{{ ghostChordName }}</span>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import EmptyState from '@/components/EmptyState.vue';
import GlobalContextMenu, { type ContextMenuItem } from '@/components/GlobalContextMenu.vue';
import { A4_HEIGHT_PX, A4_MARGIN_PX, A4_WIDTH_PX } from '@/constants/print';
import { stopAutoScroll, useAutoScroll } from '@/services/useAutoScroll.ts';
import { useLyricsDragDrop } from '@/services/useLyricsDragDrop';
import { useScoreLinesData } from '@/services/useScoreLinesData.ts';
import { isGlobalEditable } from '@/stores/globalState.ts';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useUiStore } from '@/stores/uiStore.ts';
import type { Chord } from '@/types';
import type { LineData } from '@/utils/scoreLines.ts';
import { Eraser, FileText, Trash2 } from '@lucide/vue';
import { computed, onDeactivated, useTemplateRef, watch } from 'vue';
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

const { isDragging, draggingSlotKey, dragOverSlotKey, ghostChordName, ghostPos, handlePointerDown } =
  useLyricsDragDrop(scoreZoneRef);
const { lyricsLinesWithEdges, chordsLookupMap } = useScoreLinesData();

useAutoScroll(scoreZoneRef);

const formatLineIndex = (index: number) => String(index + 1).padStart(2, '0');

const isLineVisibleInExport = (lineIdx: number) => {
  if (props.isExporting && props.exportPageLineSet && props.exportPageLineSet.size > 0) {
    return props.exportPageLineSet.has(lineIdx);
  }
  return props.selectedLineSet.has(lineIdx);
};

const slotChordMap = computed(() => {
  const map = new Map<string | number, Chord>();
  const chordMap = scoreEditor.activeSong?.chordMap;
  if (!chordMap) return map;
  for (const [slotKey, chordId] of Object.entries(chordMap)) {
    const chord = chordsLookupMap.value.get(chordId);
    if (chord) map.set(slotKey, chord);
  }
  return map;
});

const getCharChord = (slotKey: string | number) => slotChordMap.value.get(slotKey);

const handleLineClick = (ev: MouseEvent, lineIdx: number) => {
  if (props.isExporting) return;
  const target = ev.target as HTMLElement;
  if (isGlobalEditable.value && target.closest('.char-box')) {
    return;
  }
  emit('line-click', lineIdx);
};

const clearLineChords = (lineData: LineData) => {
  scoreEditor.clearLineChords(lineData.lineId);
  uiStore.toast.success(`已清除第 ${lineData.lineIdx + 1} 行的和弦`, {
    actionText: '撤销',
    duration: 4000,
    onAction: () => {
      scoreEditor.undo();
      uiStore.toast.success('已恢复数据');
    },
  });
};

const deleteLine = (lineData: LineData) => {
  if (!scoreEditor.activeSong) return;
  const lines = scoreEditor.activeSong.lyrics.split('\n');
  if (lineData.lineIdx < 0 || lineData.lineIdx >= lines.length) return;
  lines.splice(lineData.lineIdx, 1);
  scoreEditor.updateLyrics(lines.join('\n'));
  uiStore.toast.info(`已删除第 ${lineData.lineIdx + 1} 行`, {
    actionText: '撤销',
    duration: 4000,
    onAction: () => {
      scoreEditor.undo();
      uiStore.toast.success('已恢复数据');
    },
  });
};

const getLineMenuItems = (lineData: LineData): ContextMenuItem[] => [
  {
    label: '清除和弦',
    icon: Eraser,
    action: () => clearLineChords(lineData),
  },
  {
    label: '删除此行',
    icon: Trash2,
    danger: true,
    action: () => deleteLine(lineData),
  },
];

watch(
  lyricsRef,
  el => {
    if (el) {
      uiStore.activeExportTarget = el;
    }
  },
  { immediate: true }
);

watch([() => props.isExporting, () => props.selectedLineSet.size], ([exporting, selectedCount]) => {
  if (exporting || selectedCount > 0) {
    stopAutoScroll();
  }
});

onDeactivated(() => {
  if (uiStore.activeExportTarget === lyricsRef.value) {
    uiStore.activeExportTarget = null;
  }
});

defineExpose({ scoreZoneRef, exportHeaderMetaRef, a4CaptureWrapperRef });
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.interactive-score-zone {
  flex: 1;
  padding: 1.2rem 0 6rem 2rem;
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

    :deep(.add-btn-slot),
    .line-row-gutter {
      display: none !important;
    }

    .line-row:has(.lyrics-line:not(.is-line-selected)) {
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
  font-size: calc(1.5rem * var(--score-font-scale, 1));
  font-weight: 800;
  color: var(--text-title);
  margin: 0 0 0.4rem 0;
  letter-spacing: -0.02em;
}

.export-song-info {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: calc(0.75rem * var(--score-font-scale, 1));
  font-weight: 600;
  color: var(--text-body);
}

.info-divider {
  color: var(--text-disabled);
  opacity: 0.5;
}

.line-row {
  display: flex;
  align-items: stretch;
  width: max-content;
  min-width: 100%;
}

.line-row-gutter {
  flex-shrink: 0;
  width: 2rem;
}

.lyrics-line {
  position: relative;
  display: flex;
  flex-wrap: nowrap;
  gap: 0;
  align-items: stretch;
  width: max-content;
  min-width: 0;
  flex: 1 1 auto;
  padding: 0.2rem 0.4rem;
  border-radius: @radius-md;
  transition:
    background-color @duration-fast ease,
    border-color @duration-fast ease,
    box-shadow @duration-fast ease;
  cursor: pointer;
  user-select: none;
  box-sizing: border-box;
  border: 1px solid transparent;

  &:hover,
  &:focus-within,
  &.is-context-open {
    background-color: var(--bg-panel-hover);
    border-color: var(--border-base);

    .index-text-tag:not(.is-selected) {
      color: var(--color-primary);
      background-color: color-mix(in srgb, var(--color-primary), transparent 90%);
    }

    :deep(.add-btn-slot .add-edge-placeholder),
    :deep(.remove-chord-btn) {
      opacity: 1;
      pointer-events: auto;
    }
  }

  &.is-line-selected {
    background-color: color-mix(in srgb, var(--color-primary), transparent 92%);
    border-color: color-mix(in srgb, var(--color-primary), transparent 60%);

    &:hover,
    &:focus-within,
    &.is-context-open {
      background-color: color-mix(in srgb, var(--color-primary), transparent 80%);
      border-color: var(--color-primary);
      box-shadow: 0 0 0 1px var(--color-primary);
    }
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

    .lyrics-lines-container.is-export-mode {
      flex: 1 1 auto;
      min-height: 0;
    }
  }
}

.drag-ghost-floating {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 10000;
  pointer-events: none;
  transform: translate3d(-9999px, -9999px, 0);
  will-change: transform;
}

.drag-ghost-card {
  transform: translate(-50%, -50%) scale(1.08);
  padding: 0.35rem 0.65rem;
  background-color: var(--bg-panel);
  border: 1.5px solid var(--color-primary);
  border-radius: @radius-md;
  box-shadow: @shadow-floating;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.ghost-chord-name {
  font-size: 0.85rem;
  font-weight: 800;
  color: var(--color-primary);
  line-height: 1;
}

@media (max-width: 768px) {
  .interactive-score-zone {
    padding: 0.8rem 0 calc(6.5rem + env(safe-area-inset-bottom, 0px)) 0.5rem;
    -webkit-overflow-scrolling: touch;
  }

  .lyrics-lines-container {
    width: max-content;
    min-width: 100%;
  }

  .lyrics-line {
    padding: 0.15rem 0.25rem;
  }

  .line-index-badge {
    margin-right: 0.3rem;
  }

  .index-text-tag {
    font-size: 0.58rem;
    padding: 0.05rem 0.25rem;
  }

  .line-row-gutter {
    width: 0.5rem;
  }
}
</style>

<style lang="less">
body.is-global-dragging {
  &,
  & * {
    cursor: grabbing !important;
    user-select: none !important;
    -webkit-user-select: none !important;
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
