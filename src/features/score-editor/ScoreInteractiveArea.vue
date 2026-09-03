<template>
  <div
    v-scroll-cache="'score-interactive-scroll'"
    :style="{ '--score-font-scale': scoreEditor.effectiveFontScale }"
    class="no-scrollbar interactive-score-zone pt-xl pb-xl pl-xl max-md:pl-sm max-md:pt-sm relative box-border min-w-0 flex-1 overflow-x-auto overflow-y-auto pr-0 max-md:pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))]"
    ref="scoreZoneRef"
  >
    <div class="contents">
      <EmptyState
        v-if="!scoreEditor.activeSong?.lyrics.trim()"
        description="请先在“编辑歌词”模式下输入文本内容"
        icon="file-text"
        size="lg"
      />
      <div v-else class="gap-xs mx-auto flex w-max max-w-[900px] min-w-full flex-col">
        <div
          v-for="lineData in lyricsLinesWithEdges"
          v-memo="[
            lineData.lineId,
            lineData.lineIdx,
            lineData.startChords,
            lineData.chars,
            lineData.endChords,
            // 行内槽位和弦在子树中经 getCharChord 实时读取，必须依赖 chordMap 引用（每次变更为新 Map），
            // 否则删除/更换行中段和弦时 chars 等依赖不变，memo 命中导致旧和弦残留显示
            scoreEditor.activeSong?.chordMap,
            hoveredLineKey === lineData.lineId,
            isDragging,
            // 拖拽分区落点：按行归约后再进依赖，缺了分区层会被 v-memo 冻住；
            // 若直接放全局 dragOverSlotKey/dropZone，则任意落点变化会使所有行失效全量重渲染
            isDragging ? lineDropTargetKey(lineData.lineId) : null,
            isDragging ? lineDropZone(lineData.lineId) : null,
          ]"
          :key="lineData.lineId"
          class="line-row flex w-max min-w-full items-stretch"
        >
          <div
            :data-line-idx="lineData.lineId"
            @mouseenter="hoveredLineKey = lineData.lineId"
            @mouseleave="hoveredLineKey = null"
            class="lyrics-line py-xs px-sm duration-base hover:bg-bg-panel-hover hover:border-border-base focus-within:bg-bg-panel-hover focus-within:border-border-base relative box-border flex w-max min-w-0 flex-[1_1_auto] flex-nowrap items-stretch gap-0 rounded-md border border-transparent transition-all select-none"
          >
            <div class="mr-2 flex shrink-0 items-end pb-0.5 select-none">
              <span
                class="text-2xs text-text-disabled py-2xs px-xs duration-fast rounded-lg font-mono font-bold transition-colors"
              >
                {{ formatLineIndex(lineData.lineIdx) }}
              </span>
            </div>
            <div class="flex shrink-0 items-stretch gap-0">
              <ChordSlotCell
                :drop-zone="dropZoneFor(lineData.nextStartKey)"
                :is-drag-active="isDragging"
                :line-hovered="hoveredLineKey === lineData.lineId"
                :scroll-root="scoreZoneRef"
                :slot-key="lineData.nextStartKey"
                @click="handleOpenPicker(lineData.nextStartKey)"
                @pointerdown="handlePointerDown"
                @remove="slotKey => scoreEditor.removeSlotChord(slotKey)"
                add-placeholder-title="点击添加行首和弦"
                variant="add"
              />
              <ChordSlotCell
                v-for="item in lineData.startChords"
                :chord="item.chord"
                :drop-zone="dropZoneFor(item.slotKey)"
                :is-drag-active="isDragging"
                :key="item.slotKey"
                :line-hovered="hoveredLineKey === lineData.lineId"
                :scroll-root="scoreZoneRef"
                :slot-key="item.slotKey"
                @click="handleOpenPicker(item.slotKey)"
                @copy-pointerdown="handleCopyPointerDown"
                @pointerdown="handlePointerDown"
                @remove="slotKey => scoreEditor.removeSlotChord(slotKey)"
                variant="edge"
              />
            </div>

            <ChordSlotCell
              v-for="(item, index) in lineData.chars"
              :char="item.char"
              :chord="getCharChord(item.slotKey) ?? undefined"
              :drop-zone="dropZoneFor(item.slotKey)"
              :is-drag-active="isDragging"
              :key="item.slotKey"
              :left-chord-gap="isLeftAdjacentChord(lineData, index)"
              :line-hovered="hoveredLineKey === lineData.lineId"
              :scroll-root="scoreZoneRef"
              :slot-key="item.slotKey"
              @click="handleOpenPicker(item.slotKey)"
              @copy-pointerdown="handleCopyPointerDown"
              @pointerdown="handlePointerDown"
              @remove="slotKey => scoreEditor.removeSlotChord(slotKey)"
              variant="char"
            />
            <div class="flex shrink-0 items-stretch gap-0">
              <ChordSlotCell
                v-for="(item, index) in lineData.endChords"
                :chord="item.chord"
                :drop-zone="dropZoneFor(item.slotKey)"
                :is-drag-active="isDragging"
                :key="item.slotKey"
                :left-chord-gap="isEndEdgeGap(lineData, index)"
                :line-hovered="hoveredLineKey === lineData.lineId"
                :scroll-root="scoreZoneRef"
                :slot-key="item.slotKey"
                @click="handleOpenPicker(item.slotKey)"
                @copy-pointerdown="handleCopyPointerDown"
                @pointerdown="handlePointerDown"
                @remove="slotKey => scoreEditor.removeSlotChord(slotKey)"
                variant="edge"
              />
              <ChordSlotCell
                :drop-zone="dropZoneFor(lineData.nextEndKey)"
                :is-drag-active="isDragging"
                :line-hovered="hoveredLineKey === lineData.lineId"
                :scroll-root="scoreZoneRef"
                :slot-key="lineData.nextEndKey"
                @click="handleOpenPicker(lineData.nextEndKey)"
                @pointerdown="handlePointerDown"
                @remove="slotKey => scoreEditor.removeSlotChord(slotKey)"
                add-placeholder-title="点击添加行尾和弦"
                variant="add"
              />
            </div>

            <ActionButton
              :aria-hidden="hoveredLineKey !== lineData.lineId"
              :aria-label="deleteLineButtonTitle"
              :class="hoveredLineKey === lineData.lineId ? 'opacity-100' : 'opacity-0'"
              :tabindex="hoveredLineKey === lineData.lineId ? 0 : -1"
              :title="deleteLineButtonTitle"
              @click.stop="deleteLine(lineData)"
              @pointerdown.stop
              class="pl-sm text-danger duration-fast ml-auto shrink-0 self-center transition-opacity"
              icon-only
              size="lg"
              variant="subtle"
            >
              <BaseIcon :size="18" :stroke-width="2.2" name="trash-2" />
            </ActionButton>
          </div>

          <div aria-hidden="true" class="line-row-gutter w-6 shrink-0 max-md:w-2" />
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="isDragging"
        :ref="setGhostEl"
        class="z-top pointer-events-none fixed top-0 left-0 will-change-transform"
      >
        <div
          :class="dragMoveMode === 'copy' ? 'border-success' : ''"
          class="py-sm px-md bg-bg-panel/95 border-primary shadow-floating flex -translate-x-1/2 -translate-y-1/2 scale-105 items-center justify-center rounded-md border-[1.5px] backdrop-blur-md"
        >
          <span
            :class="dragMoveMode === 'copy' ? 'text-success' : 'text-primary'"
            class="text-sm leading-none font-extrabold"
          >
            {{ ghostChordName }}
          </span>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';

import ActionButton from '@/components/ui/ActionButton.vue';
import BaseIcon from '@/components/ui/BaseIcon.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import type { DropZone } from '@/features/score-editor/composables/lyrics-drag/dropZone';
import { useLyricsDragDrop } from '@/features/score-editor/composables/useLyricsDragDrop';
import { useScoreLinesData } from '@/features/score-editor/composables/useScoreLinesData';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useUiStore } from '@/stores/uiStore';
import type { Chord, LineId, SlotKey } from '@/types';
import type { LineData } from '@/utils/score/score-export';

import ChordSlotCell from './ChordSlotCell.vue';

defineOptions({ name: 'ScoreInteractiveArea' });

const emit = defineEmits<{
  (e: 'open-picker', slotKey: SlotKey): void;
}>();

const scoreEditor = useScoreEditorStore();
const uiStore = useUiStore();

const scoreZoneRef = useTemplateRef<HTMLElement>('scoreZoneRef');

const hoveredLineKey = ref<string | null>(null);
/** 删除行按钮的无障碍文本与悬停提示 */
const deleteLineButtonTitle = '删除此行';

const { lyricsLinesWithEdges, chordsLookupMap } = useScoreLinesData();

/** 行号展示为两位数字（01、02…） */
const formatLineIndex = (index: number) => String(index + 1).padStart(2, '0');

/** 按槽位键实时查找当前绑定的和弦 */
const getCharChord = (slotKey: SlotKey): Chord | null => {
  const song = scoreEditor.activeSong;
  if (!song) return null;
  const chordId = song.chordMap.get(slotKey);
  if (!chordId) return null;
  return chordsLookupMap.value.get(chordId) ?? null;
};

/** 字符槽左侧（前一个字符或行首边）是否紧邻和弦，用于渲染与和弦的间距 */
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

/** 行尾边槽左侧（末字符或前一边槽）是否为和弦，用于渲染间距 */
const isEndEdgeGap = (lineData: LineData, index: number): boolean => {
  const edge = lineData.endChords[index];
  if (!edge || !edge.chord) return false;
  if (index === 0) {
    const lastChar = lineData.chars[lineData.chars.length - 1];
    return Boolean(lastChar && getCharChord(lastChar.slotKey));
  }
  return Boolean(lineData.endChords[index - 1]?.chord);
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

/** 用户点击槽位打开 picker：拖拽中或点击抑制期忽略，避免拖拽松手误触发 */
const handleOpenPicker = (slotKey: SlotKey) => {
  if (isDragging.value || isSuppressingClick.value) return;
  emit('open-picker', slotKey);
};

defineExpose({ scoreZoneRef });
</script>
