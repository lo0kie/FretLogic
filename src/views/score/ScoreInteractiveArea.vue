<template>
  <div
    ref="scoreZoneRef"
    v-scroll-cache="'score-interactive-scroll'"
    class="interactive-score-zone flex-1 relative box-border overflow-x-auto overflow-y-auto min-w-0 pt-xl pb-[8rem] pl-2xl pr-0 max-md:pl-sm max-md:pt-sm max-md:pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))]"
    :style="{ '--score-font-scale': scoreEditor.effectiveFontScale }"
  >
    <div
      ref="a4CaptureWrapperRef"
      class="contents [&.is-a4-capture-mode]:flex [&.is-a4-capture-mode]:flex-col [&.is-a4-capture-mode]:items-center [&.is-a4-capture-mode]:box-border [&.is-a4-capture-mode]:overflow-hidden"
    >
      <EmptyState
        v-if="!scoreEditor.activeSong?.lyrics.trim()"
        :icon="FileText"
        description="请先在“编辑歌词”模式下输入文本内容"
        size="lg"
      />
      <div
        v-else
        ref="lyricsRef"
        class="flex flex-col gap-xs max-w-[900px] mx-auto w-max min-w-full"
        :class="{
          '!min-w-0 !w-max !gap-0 [&_.line-row]:[content-visibility:visible] [&_.line-row-gutter]:!hidden [&_.line-row:has(.lyrics-line:not(.is-line-selected))]:!hidden [&_.lyrics-line]:!transition-none [&_.lyrics-line]:!p-0 [&_.lyrics-line_.index-text-tag]:!transition-none [&_.lyrics-line:not(.is-line-selected)]:!hidden [&_.lyrics-line.is-line-selected]:!min-w-0 [&_.lyrics-line.is-line-selected]:!w-max [&_.lyrics-line.is-line-selected]:!bg-transparent [&_.lyrics-line.is-line-selected]:!border-transparent':
            isExporting,
        }"
      >
        <div
          v-show="isExporting && includeMetaBar"
          ref="exportHeaderMetaRef"
          class="flex flex-col items-center justify-center gap-sm pb-5 w-full"
        >
          <h1
            class="text-[calc(1.5rem*var(--score-font-scale,1))] text-text-title tracking-tight m-0 mb-2 font-extrabold"
          >
            {{ scoreEditor.activeSong?.title }}
          </h1>
          <div
            class="text-[calc(0.75rem*var(--score-font-scale,1))] flex items-center justify-center w-full font-semibold text-text-body"
          >
            <span class="flex-1 min-w-0 text-right">
              {{ computeSongKey(scoreEditor.activeSong.playKey, scoreEditor.activeSong.capo) }} 调
            </span>
            <span class="text-text-disabled opacity-50 px-md shrink-0">|</span>
            <span class="flex-1 min-w-0 text-left"> Capo: {{ scoreEditor.activeSong.capo }} </span>
          </div>
        </div>

        <div
          v-for="lineData in lyricsLinesWithEdges"
          :key="lineData.lineId"
          class="line-row flex items-stretch w-max min-w-full"
        >
          <ContextMenu
            :items="getLineMenuItems(lineData)"
            :disabled="isExporting || isDragging || !isGlobalEditable"
            #="{ isOpen }"
          >
            <div
              v-wave
              :data-line-idx="lineData.lineId"
              class="lyrics-line relative flex flex-nowrap gap-0 items-stretch w-max min-w-0 flex-[1_1_auto] py-xs px-sm rounded-md box-border cursor-pointer select-none border border-transparent transition-all duration-base hover:bg-bg-panel-hover hover:border-border-base focus-within:bg-bg-panel-hover focus-within:border-border-base"
              :class="{
                'is-line-selected': isExporting
                  ? isLineVisibleInExport(lineData.lineIdx)
                  : selectedLineSet.has(lineData.lineIdx),
                '!bg-tint-primary-92 !border-tint-primary-60 hover:!bg-tint-primary-80 hover:!border-primary':
                  !isExporting && selectedLineSet.has(lineData.lineIdx),
                'bg-bg-panel-hover border-border-base': isOpen,
              }"
              @click="e => handleLineClick(e, lineData.lineIdx)"
              @mouseenter="hoveredLineKey = lineData.lineId"
              @mouseleave="hoveredLineKey = null"
            >
              <div v-show="!isExporting" class="flex items-end pb-0.5 mr-2 select-none shrink-0">
                <span
                  class="text-2xs font-bold font-mono text-text-disabled py-2xs px-xs rounded-lg transition-colors duration-fast"
                  :class="{
                    '!text-text-on-accent !bg-primary': !isExporting && selectedLineSet.has(lineData.lineIdx),
                  }"
                >
                  {{ formatLineIndex(lineData.lineIdx) }}
                </span>
              </div>
              <div class="flex items-stretch gap-0 shrink-0">
                <ChordSlotCell
                  :is-exporting
                  :line-hovered="hoveredLineKey === lineData.lineId"
                  :scroll-root="scoreZoneRef"
                  variant="add"
                  :slot-key="lineData.nextStartKey"
                  add-placeholder-title="点击添加行首和弦"
                  @click="handleOpenPicker(lineData.nextStartKey)"
                  @pointerdown="handlePointerDown"
                  @remove="slotKey => scoreEditor.removeSlotChord(slotKey)"
                />
                <ChordSlotCell
                  v-for="item in lineData.startChords"
                  :key="item.slotKey"
                  :is-exporting
                  :line-hovered="hoveredLineKey === lineData.lineId"
                  :scroll-root="scoreZoneRef"
                  variant="edge"
                  :slot-key="item.slotKey"
                  :chord="item.chord"
                  @click="handleOpenPicker(item.slotKey)"
                  @pointerdown="handlePointerDown"
                  @remove="slotKey => scoreEditor.removeSlotChord(slotKey)"
                />
              </div>

              <ChordSlotCell
                v-for="(item, index) in lineData.chars"
                :key="item.slotKey"
                :is-exporting
                :line-hovered="hoveredLineKey === lineData.lineId"
                :scroll-root="scoreZoneRef"
                variant="char"
                :slot-key="item.slotKey"
                :char="item.char"
                :chord="getCharChord(item.slotKey) ?? undefined"
                :left-chord-gap="isLeftAdjacentChord(lineData, index)"
                @click="handleOpenPicker(item.slotKey)"
                @pointerdown="handlePointerDown"
                @remove="slotKey => scoreEditor.removeSlotChord(slotKey)"
              />
              <div class="flex items-stretch gap-0 shrink-0">
                <ChordSlotCell
                  v-for="(item, index) in lineData.endChords"
                  :key="item.slotKey"
                  :is-exporting
                  :line-hovered="hoveredLineKey === lineData.lineId"
                  :scroll-root="scoreZoneRef"
                  variant="edge"
                  :slot-key="item.slotKey"
                  :chord="item.chord"
                  :left-chord-gap="isEndEdgeGap(lineData, index)"
                  @click="handleOpenPicker(item.slotKey)"
                  @pointerdown="handlePointerDown"
                  @remove="slotKey => scoreEditor.removeSlotChord(slotKey)"
                />
                <ChordSlotCell
                  :is-exporting
                  :line-hovered="hoveredLineKey === lineData.lineId"
                  :scroll-root="scoreZoneRef"
                  variant="add"
                  :slot-key="lineData.nextEndKey"
                  add-placeholder-title="点击添加行尾和弦"
                  @click="handleOpenPicker(lineData.nextEndKey)"
                  @pointerdown="handlePointerDown"
                  @remove="slotKey => scoreEditor.removeSlotChord(slotKey)"
                />
              </div>
            </div>
          </ContextMenu>

          <div class="line-row-gutter shrink-0 w-8 max-md:w-2" aria-hidden="true" />
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="isDragging"
        :ref="setGhostEl"
        class="fixed top-0 left-0 z-top pointer-events-none will-change-transform"
      >
        <div
          class="-translate-x-1/2 -translate-y-1/2 scale-105 py-sm px-md bg-bg-panel/95 border-[1.5px] border-primary rounded-md shadow-floating backdrop-blur-md flex items-center justify-center"
        >
          <span class="text-sm font-extrabold text-primary leading-none"> {{ ghostChordName }} </span>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import ContextMenu from '@/components/context-menu/ContextMenu.vue';
import type { ContextMenuItem } from '@/components/context-menu/ContextMenuItems.vue';
import EmptyState from '@/components/base/EmptyState.vue';
import { useAutoScroll } from '@/composables/score/useAutoScroll';
import { useLyricsDragDrop } from '@/composables/score/useLyricsDragDrop';
import { useScoreLinesData } from '@/composables/score/useScoreLinesData';
import { isGlobalEditable } from '@/stores/globalState';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useUiStore } from '@/stores/uiStore';
import type { Chord } from '@/types';
import { computeSongKey } from '@/utils/music/musicTheory';
import type { LineData } from '@/utils/score/score-export';
import { Eraser, FileText, Trash2 } from '@lucide/vue';
import { computed, onActivated, onDeactivated, ref, useTemplateRef, watch } from 'vue';
import ChordSlotCell from './ChordSlotCell.vue';

defineOptions({ name: 'ScoreInteractiveArea' });

const props = defineProps<{
  selectedLineSet: Set<number>;
  exportPageLineSet?: Set<number>;
  isExporting: boolean;
  includeMetaBar: boolean;
}>();

const emit = defineEmits<{
  (e: 'open-picker', slotKey: string): void;
  (e: 'line-click', lineIdx: number): void;
}>();

const scoreEditor = useScoreEditorStore();
const uiStore = useUiStore();

const scoreZoneRef = useTemplateRef<HTMLElement>('scoreZoneRef');
const lyricsRef = useTemplateRef<HTMLElement>('lyricsRef');
const a4CaptureWrapperRef = useTemplateRef<HTMLElement>('a4CaptureWrapperRef');
const exportHeaderMetaRef = useTemplateRef<HTMLElement>('exportHeaderMetaRef');

const hoveredLineKey = ref<string | null>(null);

const { lyricsLinesWithEdges, chordsLookupMap } = useScoreLinesData();

const formatLineIndex = (index: number) => String(index + 1).padStart(2, '0');

const getCharChord = (slotKey: string): Chord | null => {
  const song = scoreEditor.activeSong;
  if (!song) return null;
  const chordId = song.chordMap[slotKey];
  if (!chordId) return null;
  return chordsLookupMap.value.get(chordId) ?? null;
};

const isLeftAdjacentChord = (lineData: LineData, currentIndex: number): boolean => {
  const currentSlotKey = lineData.chars[currentIndex]?.slotKey;
  if (!currentSlotKey || !getCharChord(currentSlotKey)) return false;

  if (currentIndex > 0) {
    const prevCharSlotKey = lineData.chars[currentIndex - 1]?.slotKey;
    if (prevCharSlotKey && getCharChord(prevCharSlotKey)) return true;
  } else if (lineData.startChords.length > 0) {
    return true;
  }

  return false;
};

const isEndEdgeGap = (lineData: LineData, index: number): boolean => {
  const edge = lineData.endChords[index];
  if (!edge || !edge.chord) return false;
  if (index === 0) {
    const lastChar = lineData.chars[lineData.chars.length - 1];
    return Boolean(lastChar && getCharChord(lastChar.slotKey));
  }
  return Boolean(lineData.endChords[index - 1]?.chord);
};

const isLineVisibleInExport = (lineIdx: number): boolean => {
  if (!props.isExporting) return false;
  if (!props.exportPageLineSet) return true;
  return props.exportPageLineSet.has(lineIdx);
};

const handleLineClick = (ev: MouseEvent, lineIdx: number) => {
  if (props.isExporting) return;
  const target = ev.target as HTMLElement;
  if (isGlobalEditable.value && target.closest('[data-slot-key], .char-box')) {
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

const buildLineMenuItems = (lineData: LineData): ContextMenuItem[] => [
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

const lineIdSignature = computed(() => lyricsLinesWithEdges.value.map(l => l.lineId).join('\u0000'));
let lineMenuItemsCache = new Map<string, ContextMenuItem[]>();
let lineMenuItemsCacheSig = '';

const getLineMenuItems = (lineData: LineData): ContextMenuItem[] => {
  const sig = lineIdSignature.value;
  if (sig !== lineMenuItemsCacheSig) {
    const map = new Map<string, ContextMenuItem[]>();
    for (const ld of lyricsLinesWithEdges.value) {
      map.set(ld.lineId, buildLineMenuItems(ld));
    }
    lineMenuItemsCache = map;
    lineMenuItemsCacheSig = sig;
  }
  return lineMenuItemsCache.get(lineData.lineId) ?? [];
};

const { isDragging, isSuppressingClick, ghostChordName, setGhostEl, handlePointerDown } =
  useLyricsDragDrop(scoreZoneRef);

const handleOpenPicker = (slotKey: string) => {
  if (isDragging.value || isSuppressingClick.value) return;
  emit('open-picker', slotKey);
};

const { stopAutoScroll } = useAutoScroll(scoreZoneRef);

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

onActivated(() => {
  if (lyricsRef.value) {
    uiStore.activeExportTarget = lyricsRef.value;
  }
});

onDeactivated(() => {
  if (uiStore.activeExportTarget === lyricsRef.value) {
    uiStore.activeExportTarget = null;
  }
});

defineExpose({ scoreZoneRef, exportHeaderMetaRef, a4CaptureWrapperRef });
</script>
