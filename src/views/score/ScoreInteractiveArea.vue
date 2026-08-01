<template>
  <div class="interactive-score-zone no-scrollbar" ref="scoreZoneRef">
    <div v-if="!scoreEditor.activeSong?.lyrics.trim()" class="empty-lyrics-tip">请先在“编辑歌词”模式下输入文本内容</div>

    <div v-else class="lyrics-lines-container">
      <div
        v-for="lineData in lyricsLinesWithEdges"
        :key="lineData.lineIdx"
        :data-line-idx="lineData.lineIdx"
        class="lyrics-line"
        :class="{ 'is-line-selected': !isExporting && selectedLineSet.has(lineData.lineIdx) }"
        @dragover.prevent="handleGlobalDragOver"
      >
        <!-- 0. 行号索引 -->
        <div class="line-index-badge" title="点击或按住滑动以多选当前行">
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
          />
        </div>
      </div>
    </div>

    <!-- 底部多选导出浮动控制工具栏 -->
    <Transition name="floating-bar-fade">
      <div v-if="selectedLineSet.size > 0" class="score-floating-bar">
        <div class="bar-info-zone">
          <span class="selected-count-badge">{{ selectedLineSet.size }}</span>
          <span class="selected-text-tip">已选择行:</span>

          <div class="clickable-indices-list no-scrollbar">
            <button
              v-for="lineIdx in sortedSelectedIndices"
              :key="lineIdx"
              class="index-item-btn"
              title="点击取消选择该行"
              @click="handleRemoveLineIndex(lineIdx)"
            >
              {{ lineIdx + 1 }}
              <X class="remove-icon" :size="10" stroke-width="2.5" />
            </button>
          </div>
        </div>

        <div class="bar-divider"></div>

        <div class="bar-actions-zone">
          <ActionButton size="sm" variant="ghost" @click="handleToggleSelectAll">
            {{ isAllSelected ? '全不选' : '全选' }}
          </ActionButton>

          <ActionButton size="sm" variant="subtle" :loading="isExporting" @click="handleCopySelectedImage">
            <template #prefix><Copy :size="14" stroke-width="2.5" /></template>
            复制图片
          </ActionButton>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import { useLyricsDragDrop } from '@/services/useLyricsDragDrop';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';
import type { Chord } from '@/types';
import { Copy, X } from '@lucide/vue';
import { useEventListener } from '@vueuse/core';
import { computed, nextTick, ref, watch } from 'vue';
import ChordSlotCell from './ChordSlotCell.vue';

const emit = defineEmits<{
  (e: 'open-picker', slotKey: string | number): void;
}>();

const scoreEditor = useScoreEditorStore();
const settingsStore = useSettingsStore();
const uiStore = useUiStore();

const {
  dragOverSlotKey,
  handleGlobalDragOver,
  handleDragStart,
  handleDragOver,
  handleDragLeave,
  handleDragEnd,
  handleDrop,
} = useLyricsDragDrop();

const scoreZoneRef = ref<HTMLElement | null>(null);

const selectedLineSet = ref<Set<number>>(new Set());
const isDraggingSelection = ref(false);
const dragAnchorLine = ref(-1);
const pointerDownIdx = ref(-1);
const isMovedDuringPointerDown = ref(false);
const isDragSelecting = ref(true);
const initialSelectedSnapshot = ref<Set<number>>(new Set());
const isExporting = ref(false);

const formatLineIndex = (index: number) => String(index + 1).padStart(2, '0');

interface EdgeChordItem {
  slotKey: string;
  chord: Chord;
}

interface CharItem {
  char: string;
  globalIndex: number;
}

interface LineData {
  lineIdx: number;
  chars: CharItem[];
  startChords: EdgeChordItem[];
  endChords: EdgeChordItem[];
  nextStartKey: string;
  nextEndKey: string;
}

const lyricsLinesWithEdges = computed<LineData[]>(() => {
  if (!scoreEditor.activeSong) return [];

  const text = scoreEditor.activeSong.lyrics;
  const map = scoreEditor.activeSong.chordMap || {};
  const rawLines = text.split('\n');

  let globalCharIdx = 0;

  return rawLines.map((lineText, lineIdx) => {
    const startChords: EdgeChordItem[] = [];
    let startCount = 0;
    while (map[`line_${lineIdx}_start_${startCount}`]) {
      startChords.push({
        slotKey: `line_${lineIdx}_start_${startCount}`,
        chord: map[`line_${lineIdx}_start_${startCount}`],
      });
      startCount++;
    }

    const endChords: EdgeChordItem[] = [];
    let endCount = 0;
    while (map[`line_${lineIdx}_end_${endCount}`]) {
      endChords.push({
        slotKey: `line_${lineIdx}_end_${endCount}`,
        chord: map[`line_${lineIdx}_end_${endCount}`],
      });
      endCount++;
    }

    const chars = lineText.split('').map(char => ({
      char,
      globalIndex: globalCharIdx++,
    }));

    globalCharIdx++;

    return {
      lineIdx,
      chars,
      startChords: startChords.reverse(),
      endChords,
      nextStartKey: `line_${lineIdx}_start_${startCount}`,
      nextEndKey: `line_${lineIdx}_end_${endCount}`,
    };
  });
});

const totalLines = computed(() => lyricsLinesWithEdges.value.length);
const isAllSelected = computed(() => totalLines.value > 0 && selectedLineSet.value.size === totalLines.value);

const sortedSelectedIndices = computed(() => {
  return Array.from(selectedLineSet.value).sort((a, b) => a - b);
});

watch(
  () => scoreEditor.activeSongId,
  () => {
    selectedLineSet.value.clear();
  }
);

const handleRemoveLineIndex = (lineIdx: number) => {
  const updated = new Set(selectedLineSet.value);
  updated.delete(lineIdx);
  selectedLineSet.value = updated;
};

const getLineIdxFromPoint = (clientX: number, clientY: number): number | null => {
  const target = document.elementFromPoint(clientX, clientY);
  const rowEl = target?.closest('.lyrics-line') as HTMLElement;
  if (rowEl && rowEl.dataset.lineIdx !== undefined) {
    return parseInt(rowEl.dataset.lineIdx, 10);
  }
  return null;
};

const checkAndAutoScroll = (clientY: number) => {
  const container = scoreZoneRef.value;
  if (!container) return;

  const rect = container.getBoundingClientRect();
  const EDGE_THRESHOLD = 40;
  const SCROLL_SPEED = 12;

  if (clientY < rect.top + EDGE_THRESHOLD) {
    container.scrollTop -= SCROLL_SPEED;
  } else if (clientY > rect.bottom - EDGE_THRESHOLD) {
    container.scrollTop += SCROLL_SPEED;
  }
};

const handlePointerDown = (e: PointerEvent, idx: number) => {
  if (e.button !== 0) return;
  e.stopPropagation();

  isDraggingSelection.value = true;
  isMovedDuringPointerDown.value = false;
  pointerDownIdx.value = idx;
  dragAnchorLine.value = idx;

  isDragSelecting.value = !selectedLineSet.value.has(idx);
  initialSelectedSnapshot.value = new Set(selectedLineSet.value);
};

const handlePointerMove = (e: PointerEvent) => {
  if (!isDraggingSelection.value) return;

  checkAndAutoScroll(e.clientY);

  const idx = getLineIdxFromPoint(e.clientX, e.clientY);
  if (idx !== null) {
    if (idx !== pointerDownIdx.value) {
      isMovedDuringPointerDown.value = true;
    }

    const min = Math.min(dragAnchorLine.value, idx);
    const max = Math.max(dragAnchorLine.value, idx);
    const updated = new Set(initialSelectedSnapshot.value);

    for (let i = min; i <= max; i++) {
      if (isDragSelecting.value) {
        updated.add(i);
      } else {
        updated.delete(i);
      }
    }
    selectedLineSet.value = updated;
  }
};

const handlePointerUp = () => {
  if (!isDraggingSelection.value) return;

  if (!isMovedDuringPointerDown.value && pointerDownIdx.value !== -1) {
    const idx = pointerDownIdx.value;
    const updated = new Set(initialSelectedSnapshot.value);
    if (updated.has(idx)) {
      updated.delete(idx);
    } else {
      updated.add(idx);
    }
    selectedLineSet.value = updated;
  }

  isDraggingSelection.value = false;
  pointerDownIdx.value = -1;
};

useEventListener(window, 'pointermove', handlePointerMove);
useEventListener(window, 'pointerup', handlePointerUp);
useEventListener(window, 'pointercancel', handlePointerUp);

const handleToggleSelectAll = () => {
  if (isAllSelected.value) {
    selectedLineSet.value.clear();
  } else {
    const all = new Set<number>();
    for (let i = 0; i < totalLines.value; i++) {
      all.add(i);
    }
    selectedLineSet.value = all;
  }
};

// 🌟 导出选中的行图片：精确计算并获取所有选中行中最长的一行作为画布宽度
const handleCopySelectedImage = async () => {
  if (isExporting.value || selectedLineSet.value.size === 0) return;

  const container = scoreZoneRef.value?.querySelector('.lyrics-lines-container') as HTMLElement;
  if (!container) return;

  isExporting.value = true;
  uiStore.toast.info(`正在生成所选 ${selectedLineSet.value.size} 行图片...`);

  // 1. 设置标记为 true，隐藏页面上的高亮背景色
  isExporting.value = true;
  await nextTick(); // 等待 DOM 响应式更新

  const htmlToImage = await import('html-to-image');
  const lineEls = Array.from(container.querySelectorAll('.lyrics-line')) as HTMLElement[];

  // 临时隐藏未选中的行，并找出被选中行中的“最大行宽”
  let maxLineWidth = 0;
  lineEls.forEach((el, idx) => {
    if (!selectedLineSet.value.has(idx)) {
      el.style.display = 'none';
    } else {
      // 🌟 精准测量当前选中行的实际内容宽度
      const lineWidth = el.scrollWidth;
      if (lineWidth > maxLineWidth) {
        maxLineWidth = lineWidth;
      }
    }
  });

  console.log('[ScoreInteractiveArea.vue: 403]', maxLineWidth);

  const bgColor = getComputedStyle(document.body).getPropertyValue('--bg-main') || '#f2f2f7';

  // 🌟 自定义左右与上下留白 (px)
  const paddingX = 100; // 左右总留白
  const paddingY = 140; // 上下总留白

  const fullWidth = maxLineWidth + paddingX; // 图片总宽度 = 最长行宽度 + 左右留白
  const fullHeight = container.scrollHeight + paddingY;

  try {
    const exportOptions = {
      width: fullWidth,
      height: fullHeight,
      style: {
        transform: 'none',
        overflow: 'visible',
        backgroundColor: bgColor,
        width: `${maxLineWidth}px`, // 🌟 锁死内部渲染宽度为最长行宽度
        height: `${container.scrollHeight}px`,
        paddingTop: `${paddingY / 2}px`,
        paddingBottom: `${paddingY / 2}px`,
        paddingLeft: `${paddingX / 2}px`,
        paddingRight: `${paddingX / 2}px`,
        boxSizing: 'content-box',
      },
      backgroundColor: bgColor,
      filter: (domNode: Node) => {
        if (domNode instanceof HTMLElement && domNode.classList.contains('add-btn-slot')) {
          return false;
        }
        return true;
      },
    };

    await htmlToImage.toBlob(container, exportOptions);
    const blob = await htmlToImage.toBlob(container, {
      quality: 0.95,
      pixelRatio: 2,
      cacheBust: true,
      ...exportOptions,
    });

    if (!blob) throw new Error('生成图片失败');

    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    uiStore.toast.success(`已成功复制所选 ${selectedLineSet.value.size} 行图片至剪贴板`);
  } catch (err) {
    console.error('Export Score Lines Error:', err);
    uiStore.toast.error('导出图片失败');
  } finally {
    // 2. 恢复所有行的显示
    lineEls.forEach(el => {
      el.style.display = '';
    });
    // 3. 关闭导出状态，恢复页面上的高亮显示
    isExporting.value = false;
  }
};
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

.score-floating-bar {
  display: flex;
  align-items: center;
  position: fixed;
  left: 50%;
  bottom: 1.8rem;
  transform: translateX(-50%);
  z-index: 90;
  pointer-events: auto;
  gap: 0.6rem;
  padding: 0.4rem 0.8rem;
  background-color: var(--bg-panel);
  backdrop-filter: blur(30px);
  -webkit-backdrop-filter: blur(30px);
  border: 1px solid var(--glass-border);
  border-radius: 9999px;
  box-shadow: @shadow-floating;
  box-sizing: border-box;
}

.bar-info-zone {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-title);
}

.selected-count-badge {
  background-color: var(--color-primary);
  color: #ffffff;
  font-size: 0.65rem;
  font-weight: 800;
  padding: 0.05rem 0.4rem;
  border-radius: 9999px;
}

.selected-text-tip {
  color: var(--text-title);
  white-space: nowrap;
}

.clickable-indices-list {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  max-width: 12rem;
  overflow-x: auto;
  padding: 0.1rem 0;
}

.index-item-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.1rem 0.35rem;
  border-radius: 9999px;
  background-color: color-mix(in srgb, var(--color-primary), transparent 88%);
  color: var(--color-primary);
  border: 1px solid color-mix(in srgb, var(--color-primary), transparent 75%);
  font-size: 0.62rem;
  font-weight: 700;
  font-family: monospace;
  cursor: pointer;
  transition: @transition-fast;
  white-space: nowrap;

  &:hover {
    background-color: var(--color-danger);
    color: #ffffff;
    border-color: var(--color-danger);
  }
}

.remove-icon {
  opacity: 0.7;
}

.bar-divider {
  width: 1px;
  height: 1rem;
  background-color: var(--border-base);
  opacity: 0.6;
}

.bar-actions-zone {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.floating-bar-fade-enter-active,
.floating-bar-fade-leave-active {
  transition:
    opacity 0.25s cubic-bezier(0.25, 1, 0.5, 1),
    transform 0.25s cubic-bezier(0.34, 1.4, 0.64, 1);
}

.floating-bar-fade-enter-from,
.floating-bar-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, 20px) scale(0.95);
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
