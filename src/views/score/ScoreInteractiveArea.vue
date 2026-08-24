<template>
  <div
    ref="scoreZoneRef"
    class="interactive-score-zone no-scrollbar"
    :style="{ '--score-font-scale': scoreEditor.effectiveFontScale }"
  >
    <div ref="a4CaptureWrapperRef" class="a4-capture-wrapper">
      <EmptyState
        v-if="!scoreEditor.activeSong?.lyrics.trim()"
        :icon="FileText"
        description="请先在“编辑歌词”模式下输入文本内容"
        size="lg"
      />
      <div v-else ref="lyricsRef" class="lyrics-lines-container" :class="{ 'is-export-mode': isExporting }">
        <div v-show="isExporting && includeMetaBar" ref="exportHeaderMetaRef" class="export-header-meta">
          <h1 class="export-song-title">
            {{ scoreEditor.activeSong?.title }}
          </h1>
          <div class="export-song-info">
            <span class="info-side info-side-left">
              {{ computeSongKey(scoreEditor.activeSong.playKey, scoreEditor.activeSong.capo) }} 调
            </span>
            <span class="info-divider">|</span>
            <span class="info-side info-side-right">Capo: {{ scoreEditor.activeSong.capo }}</span>
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
              class="lyrics-line"
              :class="{
                'is-line-selected': isLineVisibleInExport(lineData.lineIdx),
                'is-context-open': isOpen,
              }"
              @click="e => handleLineClick(e, lineData.lineIdx)"
            >
              <div v-show="!isExporting" class="line-index-badge">
                <span
                  class="index-text-tag"
                  :class="{
                    'is-selected': !isExporting && selectedLineSet.has(lineData.lineIdx),
                  }"
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
                  @click="emit('open-picker', lineData.nextStartKey)"
                  @pointerdown="handlePointerDown"
                  @remove="slotKey => scoreEditor.removeSlotChord(slotKey)"
                />
                <ChordSlotCell
                  v-for="item in lineData.startChords"
                  :key="item.slotKey"
                  :is-exporting
                  :scroll-root="scoreZoneRef"
                  variant="edge"
                  :slot-key="item.slotKey"
                  :chord="item.chord"
                  @click="emit('open-picker', item.slotKey)"
                  @pointerdown="handlePointerDown"
                  @remove="slotKey => scoreEditor.removeSlotChord(slotKey)"
                />
              </div>
              <ChordSlotCell
                v-for="(item, index) in lineData.chars"
                :key="item.slotKey"
                :is-exporting
                :scroll-root="scoreZoneRef"
                variant="char"
                :slot-key="item.slotKey"
                :chord="getCharChord(item.slotKey)"
                :char="item.char"
                :left-chord-gap="isLeftAdjacentChord(lineData, index)"
                @click="emit('open-picker', item.slotKey)"
                @pointerdown="handlePointerDown"
                @remove="slotKey => scoreEditor.removeSlotChord(slotKey)"
              />
              <div class="edge-chords-group">
                <ChordSlotCell
                  v-for="(item, index) in lineData.endChords"
                  :key="item.slotKey"
                  :is-exporting
                  :scroll-root="scoreZoneRef"
                  variant="edge"
                  :slot-key="item.slotKey"
                  :chord="item.chord"
                  :left-chord-gap="isEndEdgeGap(lineData, index)"
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
                  @click="emit('open-picker', lineData.nextEndKey)"
                  @pointerdown="handlePointerDown"
                  @remove="slotKey => scoreEditor.removeSlotChord(slotKey)"
                />
              </div>
            </div>
          </GlobalContextMenu>

          <div class="line-row-gutter" aria-hidden="true" />
        </div>
      </div>
    </div>
    <Teleport to="body">
      <div v-if="isDragging" :ref="setGhostEl" class="drag-ghost-floating">
        <div class="drag-ghost-card">
          <span class="ghost-chord-name">{{ ghostChordName }}</span>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { A4_HEIGHT_PX, A4_MARGIN_PX, A4_WIDTH_PX } from '@/utils/constants';
import { isGlobalEditable } from '@/stores/globalState.ts';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useUiStore } from '@/stores/uiStore.ts';
import type { Chord } from '@/types';
import EmptyState from '@/components/EmptyState.vue';
import GlobalContextMenu, { type ContextMenuItem } from '@/components/GlobalContextMenu.vue';
import { stopAutoScroll, useAutoScroll } from '@/composables/useAutoScroll.ts';
import { useLyricsDragDrop } from '@/composables/useLyricsDragDrop';
import { useScoreLinesData } from '@/composables/useScoreLinesData.ts';
import { computeSongKey } from '@/utils/musicTheory';
import type { LineData } from '@/utils/score-export';
import { Eraser, FileText, Trash2 } from '@lucide/vue';
import { computed, onActivated, onDeactivated, useTemplateRef, watch } from 'vue';
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

const uiStore = useUiStore();
const scoreEditor = useScoreEditorStore();
const scoreZoneRef = useTemplateRef<HTMLElement>('scoreZoneRef');
const lyricsRef = useTemplateRef<HTMLElement>('lyricsRef');
const exportHeaderMetaRef = useTemplateRef<HTMLElement>('exportHeaderMetaRef');
const a4CaptureWrapperRef = useTemplateRef<HTMLElement>('a4CaptureWrapperRef');

// 拖拽高亮（is-drop-target / is-dragging-source）由 useLyricsDragDrop 直接操作 DOM class，
// 不进响应式渲染链路；这里只保留低频的 isDragging（拖拽起止各变一次）
const { isDragging, ghostChordName, setGhostEl, handlePointerDown } = useLyricsDragDrop(scoreZoneRef);
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
  const map = new Map<string, Chord>();
  const chordMap = scoreEditor.activeSong?.chordMap;
  if (!chordMap) return map;
  for (const [slotKey, chordId] of Object.entries(chordMap)) {
    const chord = chordsLookupMap.value.get(chordId);
    if (chord) map.set(slotKey, chord);
  }
  return map;
});

const getCharChord = (slotKey: string) => slotChordMap.value.get(slotKey);

/** 连续字符都分配了和弦时，靠右的那个需要横向间距，避免和弦卡片互相紧贴 */
const isLeftAdjacentChord = (lineData: LineData, index: number): boolean => {
  const cur = lineData.chars[index];
  if (!cur) return false;
  if (index === 0) {
    // 行首：若行首 edge 和弦紧邻第一个字符，同样需要间距
    const startEdgeHasChord = lineData.startChords.some(edge => Boolean(edge.chord));
    return startEdgeHasChord && Boolean(getCharChord(cur.slotKey));
  }
  const prev = lineData.chars[index - 1];
  if (!prev) return false;
  return Boolean(getCharChord(prev.slotKey)) && Boolean(getCharChord(cur.slotKey));
};

/** 行尾 edge 和弦：若紧邻的最后一个字符也有和弦，需要横向间距 */
const isEndEdgeGap = (lineData: LineData, index: number): boolean => {
  const edge = lineData.endChords[index];
  if (!edge || !edge.chord) return false;
  if (index === 0) {
    const lastChar = lineData.chars[lineData.chars.length - 1];
    return Boolean(lastChar && getCharChord(lastChar.slotKey));
  }
  // 多个行尾和弦相邻时，靠右的同样需要间距
  return Boolean(lineData.endChords[index - 1]?.chord);
};

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

// 行集合（顺序）不变时复用同一批 items 数组，避免每次渲染为每行生成新引用导致 N 个菜单组件级联重渲染
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

<style scoped lang="less">
@import '@/assets/tokens.module';

.interactive-score-zone {
  flex: 1;
  padding: @space-xl 0 (@space-3xl * 2) @space-2xl; /* 底部留出空间，避免内容被悬浮操作栏遮挡 */
  overflow-y: auto;
  overflow-x: auto;
  box-sizing: border-box;
  position: relative;
}

.lyrics-lines-container {
  display: flex;
  flex-direction: column;
  gap: @space-xs;
  max-width: 900px;
  margin: 0 auto;
  width: max-content;
  min-width: 100%;

  &.is-export-mode {
    min-width: 0 !important;
    width: max-content !important;
    gap: 0;

    /* 导出捕获需要完整布局，禁用屏外行的渲染跳过与相关过渡 */
    .line-row {
      content-visibility: visible;
    }

    :deep(.add-btn-slot),
    .line-row-gutter {
      display: none !important;
    }

    .line-row:has(.lyrics-line:not(.is-line-selected)) {
      display: none !important;
    }

    .lyrics-line {
      transition: none !important;
      padding: 0 !important;

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
  gap: @space-sm;
  padding-bottom: 1.2rem;
  width: 100%;
}

.export-song-title {
  font-size: calc(@fs-xl * var(--score-font-scale, 1));
  font-weight: 800;
  color: var(--text-title);
  margin: 0 0 @space-sm 0;
  letter-spacing: -0.02em;
}

.export-song-info {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  font-size: calc(0.75rem * var(--score-font-scale, 1));
  font-weight: 600;
  color: var(--text-body);
}
.info-side {
  flex: 1 1 0;
  min-width: 0;
}
.info-side-left {
  text-align: right;
}
.info-side-right {
  text-align: left;
}
.info-divider {
  color: var(--text-disabled);
  opacity: 0.5;
  padding: 0 @space-md; // 原来的 gap: @space-md 去掉，改用 padding 控制左右间距
  flex: 0 0 auto;
}

.line-row {
  display: flex;
  align-items: stretch;
  /* 原生虚拟渲染：跳过屏外行的渲染/布局（保持 DOM 与交互完整），
     大幅降低长谱面的渲染成本；导出模式已用 content-visibility: visible 覆盖 */
  width: max-content;
  min-width: 100%;
  /* 屏外行跳过布局与绘制（长歌词的渲染级虚拟化）；auto 让浏览器记住已渲染行的真实高度。
     估值取带指板行的高度（偏大）：偏小会导致自动滚动因 scrollHeight 低估而提前触底 */
  content-visibility: auto;
  contain-intrinsic-size: auto 9rem;
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
  padding: @space-xs @space-sm;
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
      background-color: var(--tint-primary-90);
    }

    :deep(.add-btn-slot .add-edge-placeholder),
    :deep(.remove-chord-btn) {
      opacity: 1;
      pointer-events: auto;
    }
  }

  &.is-line-selected {
    background-color: var(--tint-primary-92);
    border-color: var(--tint-primary-60);

    &:hover,
    &:focus-within,
    &.is-context-open {
      background-color: var(--tint-primary-80);
      border-color: var(--color-primary);
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
  font-size: @fs-2xs;
  font-weight: 700;
  font-family: monospace;
  color: var(--text-disabled);
  padding: @space-xs @space-sm;
  border-radius: @radius-lg;
  transition:
    color @duration-fast ease,
    background-color @duration-fast ease;

  &.is-selected {
    color: var(--text-on-accent) !important;
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
  z-index: var(--z-top);
  pointer-events: none;
  transform: translate3d(-9999px, -9999px, 0);
  will-change: transform;
}

.drag-ghost-card {
  transform: translate(-50%, -50%) scale(1.08);
  padding: @space-sm @space-md;
  background-color: var(--bg-panel);
  border: 1.5px solid var(--color-primary);
  border-radius: @radius-md;
  box-shadow: @shadow-floating;
  backdrop-filter: var(--blur-md);
  -webkit-backdrop-filter: var(--blur-md);
  display: flex;
  align-items: center;
  justify-content: center;
}

.ghost-chord-name {
  font-size: @fs-sm;
  font-weight: 800;
  color: var(--color-primary);
  line-height: 1;
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
