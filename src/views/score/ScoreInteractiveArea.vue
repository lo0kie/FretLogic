<template>
  <div
    ref="scoreZoneRef"
    v-scroll-cache="'score-interactive-scroll'"
    class="no-scrollbar interactive-score-zone flex-1 relative box-border overflow-x-auto overflow-y-auto min-w-0 pt-xl pb-[8rem] pl-2xl pr-0 max-md:pl-sm max-md:pt-sm max-md:pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))]"
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
          v-memo="[
            lineData.lineId,
            lineData.lineIdx,
            lineData.startChords,
            lineData.chars,
            lineData.endChords,
            // 行内槽位和弦在子树中经 getCharChord 实时读取，必须依赖 chordMap 引用（每次变更为新 Map），
            // 否则删除/更换行中段和弦时 chars 等依赖不变，memo 命中导致旧和弦残留显示
            scoreEditor.activeSong?.chordMap,
            isExporting ? isLineVisibleInExport(lineData.lineIdx) : selectedLineSet.has(lineData.lineIdx),
            hoveredLineKey === lineData.lineId,
            isExporting,
            isDragging,
            // 拖拽分区落点：按行归约后再进依赖，缺了分区层会被 v-memo 冻住；
            // 若直接放全局 dragOverSlotKey/dropZone，则任意落点变化会使所有行失效全量重渲染
            isDragging ? lineDropTargetKey(lineData.lineId) : null,
            isDragging ? lineDropZone(lineData.lineId) : null,
          ]"
          class="line-row flex items-stretch w-max min-w-full"
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
            }"
            @click="e => handleLineClick(e, lineData.lineIdx)"
            @mouseenter="hoveredLineKey = lineData.lineId"
            @mouseleave="hoveredLineKey = null"
          >
            <div v-show="!isExporting" class="flex items-end pb-0.5 mr-2 select-none shrink-0">
              <span
                class="text-2xs font-bold font-mono text-text-disabled py-2xs px-xs rounded-lg transition-colors duration-fast"
                :class="{ '!text-text-on-accent !bg-primary': !isExporting && selectedLineSet.has(lineData.lineIdx) }"
              >
                {{ formatLineIndex(lineData.lineIdx) }}
              </span>
            </div>
            <div class="flex items-stretch gap-0 shrink-0">
              <ChordSlotCell
                :is-exporting
                :is-drag-active="isDragging"
                :line-hovered="hoveredLineKey === lineData.lineId"
                :scroll-root="scoreZoneRef"
                variant="add"
                :slot-key="lineData.nextStartKey"
                :drop-zone="dropZoneFor(lineData.nextStartKey)"
                add-placeholder-title="点击添加行首和弦"
                @click="handleOpenPicker(lineData.nextStartKey)"
                @pointerdown="handlePointerDown"
                @remove="slotKey => scoreEditor.removeSlotChord(slotKey)"
              />
              <ChordSlotCell
                v-for="item in lineData.startChords"
                :key="item.slotKey"
                :is-exporting
                :is-drag-active="isDragging"
                :line-hovered="hoveredLineKey === lineData.lineId"
                :scroll-root="scoreZoneRef"
                variant="edge"
                :slot-key="item.slotKey"
                :chord="item.chord"
                :drop-zone="dropZoneFor(item.slotKey)"
                @click="handleOpenPicker(item.slotKey)"
                @pointerdown="handlePointerDown"
                @copy-pointerdown="handleCopyPointerDown"
                @remove="slotKey => scoreEditor.removeSlotChord(slotKey)"
              />
            </div>

            <ChordSlotCell
              v-for="(item, index) in lineData.chars"
              :key="item.slotKey"
              :is-exporting
              :is-drag-active="isDragging"
              :line-hovered="hoveredLineKey === lineData.lineId"
              :scroll-root="scoreZoneRef"
              variant="char"
              :slot-key="item.slotKey"
              :char="item.char"
              :chord="getCharChord(item.slotKey) ?? undefined"
              :drop-zone="dropZoneFor(item.slotKey)"
              :left-chord-gap="isLeftAdjacentChord(lineData, index)"
              @click="handleOpenPicker(item.slotKey)"
              @pointerdown="handlePointerDown"
              @copy-pointerdown="handleCopyPointerDown"
              @remove="slotKey => scoreEditor.removeSlotChord(slotKey)"
            />
            <div class="flex items-stretch gap-0 shrink-0">
              <ChordSlotCell
                v-for="(item, index) in lineData.endChords"
                :key="item.slotKey"
                :is-exporting
                :is-drag-active="isDragging"
                :line-hovered="hoveredLineKey === lineData.lineId"
                :scroll-root="scoreZoneRef"
                variant="edge"
                :slot-key="item.slotKey"
                :chord="item.chord"
                :left-chord-gap="isEndEdgeGap(lineData, index)"
                :drop-zone="dropZoneFor(item.slotKey)"
                @click="handleOpenPicker(item.slotKey)"
                @pointerdown="handlePointerDown"
                @copy-pointerdown="handleCopyPointerDown"
                @remove="slotKey => scoreEditor.removeSlotChord(slotKey)"
              />
              <ChordSlotCell
                :is-exporting
                :is-drag-active="isDragging"
                :line-hovered="hoveredLineKey === lineData.lineId"
                :scroll-root="scoreZoneRef"
                variant="add"
                :slot-key="lineData.nextEndKey"
                :drop-zone="dropZoneFor(lineData.nextEndKey)"
                add-placeholder-title="点击添加行尾和弦"
                @click="handleOpenPicker(lineData.nextEndKey)"
                @pointerdown="handlePointerDown"
                @remove="slotKey => scoreEditor.removeSlotChord(slotKey)"
              />
            </div>

            <ActionButton
              v-if="!isExporting"
              icon-only
              size="lg"
              variant="subtle"
              class="self-center ml-auto pl-sm shrink-0 text-danger transition-opacity duration-fast"
              :class="hoveredLineKey === lineData.lineId ? 'opacity-100' : 'opacity-0'"
              :tabindex="hoveredLineKey === lineData.lineId ? 0 : -1"
              :title="deleteLineButtonTitle"
              :aria-label="deleteLineButtonTitle"
              :aria-hidden="hoveredLineKey !== lineData.lineId"
              @pointerdown.stop
              @click.stop="deleteLine(lineData)"
            >
              <Trash2 :size="18" :stroke-width="2.2" />
            </ActionButton>
          </div>

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
          :class="dragMoveMode === 'copy' ? 'border-success' : ''"
        >
          <span
            class="text-sm font-extrabold leading-none"
            :class="dragMoveMode === 'copy' ? 'text-success' : 'text-primary'"
          >
            {{ ghostChordName }}
          </span>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/base/ActionButton.vue';
import EmptyState from '@/components/base/EmptyState.vue';
import { useActiveExportTarget } from '@/composables/app/useActiveExportTarget';
import { useAutoScroll } from '@/composables/score/useAutoScroll';
import { useLyricsDragDrop } from '@/composables/score/useLyricsDragDrop';
import type { DropZone } from '@/composables/score/lyrics-drag/dropZone';
import { useScoreLinesData } from '@/composables/score/useScoreLinesData';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useUiStore } from '@/stores/uiStore';
import type { Chord, LineId, SlotKey } from '@/types';
import { computeSongKey } from '@/utils/music/musicTheory';
import type { LineData } from '@/utils/score/score-export';
import { FileText, Trash2 } from '@lucide/vue';
import { onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';
import ChordSlotCell from './ChordSlotCell.vue';

defineOptions({ name: 'ScoreInteractiveArea' });

const props = defineProps<{
  selectedLineSet: Set<number>;
  exportPageLineSet?: Set<number>;
  isExporting: boolean;
  includeMetaBar: boolean;
}>();

const emit = defineEmits<{
  (e: 'open-picker', slotKey: SlotKey): void;
  (e: 'line-click', lineIdx: number): void;
}>();

const scoreEditor = useScoreEditorStore();
const uiStore = useUiStore();

const scoreZoneRef = useTemplateRef<HTMLElement>('scoreZoneRef');
const lyricsRef = useTemplateRef<HTMLElement>('lyricsRef');
const a4CaptureWrapperRef = useTemplateRef<HTMLElement>('a4CaptureWrapperRef');
const exportHeaderMetaRef = useTemplateRef<HTMLElement>('exportHeaderMetaRef');

const hoveredLineKey = ref<string | null>(null);
/** 删除行按钮的无障碍文本与悬停提示 */
const deleteLineButtonTitle = '删除此行';

const { lyricsLinesWithEdges, chordsLookupMap } = useScoreLinesData();

const formatLineIndex = (index: number) => String(index + 1).padStart(2, '0');

const getCharChord = (slotKey: SlotKey): Chord | null => {
  const song = scoreEditor.activeSong;
  if (!song) return null;
  const chordId = song.chordMap.get(slotKey);
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
  // 拖拽落点在起始行内时，浏览器会以行容器为公共祖先合成一次 click，
  // 若不拦截会误触发行选中切换（isSuppressingClick 在松手后短暂保持，恰好覆盖该 click）
  if (isDragging.value || isSuppressingClick.value) return;
  const target = ev.target as HTMLElement;
  if (target.closest('[data-slot-key], .char-box')) {
    return;
  }
  emit('line-click', lineIdx);
};

/** 删除歌词行：按 lineId 实时反查索引，避免 v-memo 缓存 vnode 中陈旧 lineIdx 闭包删错行 */
const deleteLine = (lineData: LineData) => {
  const song = scoreEditor.activeSong;
  if (!song) return;
  const lines = song.lyrics.split('\n');
  const lineIdx = song.lineIds.indexOf(lineData.lineId as LineId);
  if (lineIdx < 0 || lineIdx >= lines.length) return;
  lines.splice(lineIdx, 1);
  scoreEditor.updateLyrics(lines.join('\n'));
  uiStore.toast.info(`已删除第 ${lineIdx + 1} 行`, {
    actionText: '撤销',
    duration: 4000,
    onAction: () => {
      scoreEditor.undo();
      uiStore.toast.success('已恢复数据');
    },
  });
};

const {
  isDragging,
  isSuppressingClick,
  draggingSlotKey,
  dragMoveMode,
  dragOverSlotKey,
  dropZone,
  ghostChordName,
  setGhostEl,
  handlePointerDown,
} = useLyricsDragDrop(scoreZoneRef);

/** 「移动」按钮拖拽入口：源槽虚化（swap 样式）；落地动作由落点分区决定，与按钮模式无关 */
const handleCopyPointerDown = (e: PointerEvent, slotKey: string, chord: Chord) => {
  handlePointerDown(e, slotKey, chord);
};

/** 本槽位的落点分区；非当前落点、或该槽位是拖拽源自身时返回 null（源不可作为落点） */
const dropZoneFor = (slotKey: string) =>
  isDragging.value && dragOverSlotKey.value === slotKey && draggingSlotKey.value !== slotKey ? dropZone.value : null;

/** 落点按行归约：slotKey 前缀 line_${lineId}_ 判定本行是否含当前落点（供 v-memo 按行粒度失效） */
const lineDropTargetKey = (lineId: string): string | null =>
  isDragging.value && dragOverSlotKey.value?.startsWith(`line_${lineId}_`) ? dragOverSlotKey.value : null;
/** 本行落点分区值：仅落点行携带，其余行恒为 null 以保持 v-memo 命中 */
const lineDropZone = (lineId: string): DropZone | null =>
  isDragging.value && dragOverSlotKey.value?.startsWith(`line_${lineId}_`) ? dropZone.value : null;

// 拖拽中的分区规则提示：loading toast 不会自动消失，拖拽结束手动移除
let dragHintToastId: number | null = null;
watch(isDragging, dragging => {
  if (dragging) {
    dragHintToastId = uiStore.toast.loading('拖到上半：交换 / 复制 · 下半：替换 / 移动', {
      closable: false,
      customClass: 'drag-hint-toast',
    });
  } else if (dragHintToastId !== null) {
    uiStore.removeToast(dragHintToastId);
    dragHintToastId = null;
  }
});
onBeforeUnmount(() => {
  if (dragHintToastId !== null) {
    uiStore.removeToast(dragHintToastId);
    dragHintToastId = null;
  }
});

const handleOpenPicker = (slotKey: SlotKey) => {
  if (isDragging.value || isSuppressingClick.value) return;
  emit('open-picker', slotKey);
};

const { stopAutoScroll } = useAutoScroll(scoreZoneRef);

useActiveExportTarget(lyricsRef);

watch([() => props.isExporting, () => props.selectedLineSet.size], ([exporting, selectedCount]) => {
  if (exporting || selectedCount > 0) {
    stopAutoScroll();
  }
});

defineExpose({ scoreZoneRef, exportHeaderMetaRef, a4CaptureWrapperRef });
</script>
