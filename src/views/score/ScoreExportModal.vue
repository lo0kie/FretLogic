<template>
  <BaseModal v-model:visible="visibleModel" title="导出乐谱图片配置" :show-footer="false" width="w-wide">
    <div class="export-config-container">
      <!-- 1. 行选择提示与控制顶栏 -->
      <div class="lines-picker-header">
        <span class="selection-status-tip">
          <template v-if="selectedLineSet.size > 0">
            已选择 <strong>{{ selectedLineSet.size }}</strong> / {{ totalLines }} 行
          </template>
          <template v-else> 未选择行，可在下方点击多选或滑动划选 </template>
        </span>
        <button class="btn-select-all" @click="toggleSelectAll">
          {{ isAllSelected ? '取消全选' : '全选' }}
        </button>
      </div>

      <!-- 2. 歌词行列表：横向两栏网格布局，支持离散多选与拖拽划选，支持边缘自动滚动 -->
      <div class="lines-preview-grid no-scrollbar" ref="previewListRef">
        <div
          v-for="(lineText, idx) in previewLines"
          :key="idx"
          :data-line-idx="idx"
          class="line-preview-row"
          :class="{ 'is-selected': selectedLineSet.has(idx) }"
          @pointerdown="e => handlePointerDown(e, idx)"
        >
          <span class="preview-line-num">{{ String(idx + 1).padStart(2, '0') }}</span>
          <span class="preview-line-content">{{ lineText || '(空行)' }}</span>
        </div>
      </div>

      <!-- 3. 操作按钮区：常驻整张导出 + 选中区域导出/下载 -->
      <div class="action-footer-grid">
        <ActionButton width="100%" size="md" :loading="isExporting" @click="handleExportAll">
          <template #prefix>
            <Copy :size="15" stroke-width="2.5" />
          </template>
          复制整张乐谱图片
        </ActionButton>

        <ActionButton
          width="100%"
          variant="subtle"
          size="md"
          :disabled="selectedLineSet.size === 0"
          :loading="isExporting"
          @click="handleExportSelected"
        >
          <template #prefix>
            <Copy :size="15" stroke-width="2.5" />
          </template>
          复制所选 {{ selectedLineSet.size }} 行图片
        </ActionButton>

        <ActionButton
          width="100%"
          variant="ghost"
          size="md"
          :disabled="selectedLineSet.size === 0"
          :loading="isExporting"
          @click="handleDownloadSelected"
        >
          <template #prefix>
            <Download :size="15" stroke-width="2.5" />
          </template>
          下载所选 {{ selectedLineSet.size }} 行图片
        </ActionButton>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import BaseModal from '@/components/BaseModal.vue';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useUiStore } from '@/stores/uiStore';
import { Copy, Download } from '@lucide/vue';
import { useEventListener } from '@vueuse/core';
import { computed, ref, watch } from 'vue';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
}>();

const visibleModel = computed({
  get: () => props.visible,
  set: val => emit('update:visible', val),
});

// 🌟 使用重构后的专属 scoreEditorStore
const scoreEditor = useScoreEditorStore();
const uiStore = useUiStore();

const isExporting = ref<boolean>(false);
const selectedLineSet = ref<Set<number>>(new Set());

const isDraggingSelection = ref<boolean>(false);
const dragAnchorLine = ref<number>(-1);
const pointerDownIdx = ref<number>(-1);
const isMovedDuringPointerDown = ref<boolean>(false);
const isDragSelecting = ref<boolean>(true);
const initialSelectedSnapshot = ref<Set<number>>(new Set());

const previewListRef = ref<HTMLElement | null>(null);

const previewLines = computed(() => {
  if (!scoreEditor.activeSong?.lyrics) return [];
  return scoreEditor.activeSong.lyrics.split('\n');
});

const totalLines = computed(() => previewLines.value.length);

const isAllSelected = computed(() => {
  return totalLines.value > 0 && selectedLineSet.value.size === totalLines.value;
});

const toggleSelectAll = () => {
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

watch(
  () => props.visible,
  val => {
    if (val) {
      toggleSelectAll();
    }
  }
);

const getLineIdxFromPoint = (clientX: number, clientY: number): number | null => {
  const target = document.elementFromPoint(clientX, clientY);
  const rowEl = target?.closest('.line-preview-row') as HTMLElement;
  if (rowEl && rowEl.dataset.lineIdx !== undefined) {
    return parseInt(rowEl.dataset.lineIdx, 10);
  }
  return null;
};

const checkAndAutoScroll = (clientY: number) => {
  const container = previewListRef.value;
  if (!container) return;

  const rect = container.getBoundingClientRect();
  const EDGE_THRESHOLD = 30;
  const SCROLL_SPEED = 8;

  if (clientY < rect.top + EDGE_THRESHOLD) {
    container.scrollTop -= SCROLL_SPEED;
  } else if (clientY > rect.bottom - EDGE_THRESHOLD) {
    container.scrollTop += SCROLL_SPEED;
  }
};

const handlePointerDown = (e: PointerEvent, idx: number) => {
  if (e.button !== 0) return;
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

const renderAndExport = async (targetSet: Set<number>, downloadName?: string) => {
  const container = document.querySelector('.lyrics-lines-container') as HTMLElement;
  if (!container) return;

  const htmlToImage = await import('html-to-image');
  const lineEls = Array.from(container.querySelectorAll('.lyrics-line')) as HTMLElement[];

  lineEls.forEach((el, idx) => {
    if (!targetSet.has(idx)) {
      el.style.display = 'none';
    }
  });

  const bgColor = getComputedStyle(document.body).getPropertyValue('--bg-main') || '#f2f2f7';

  try {
    const exportOptions = {
      style: {
        transform: 'none',
        overflow: 'visible',
        backgroundColor: bgColor,
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

    if (!blob) throw new Error('生成图片 Blob 失败');

    if (downloadName) {
      const link = document.createElement('a');
      link.download = `${downloadName}.png`;
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
    } else {
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    }
  } finally {
    lineEls.forEach(el => {
      el.style.display = '';
    });
  }
};

const handleExportAll = async () => {
  if (isExporting.value) return;
  isExporting.value = true;
  uiStore.toast.info('正在生成整张乐谱图片...');

  try {
    const allSet = new Set<number>();
    for (let i = 0; i < totalLines.value; i++) allSet.add(i);
    await renderAndExport(allSet);
    uiStore.toast.success('完整乐谱图片已成功复制至剪贴板');
  } catch (err) {
    console.error('Export All Error:', err);
    uiStore.toast.error('导出失败');
  } finally {
    isExporting.value = false;
  }
};

const handleExportSelected = async () => {
  if (isExporting.value || selectedLineSet.value.size === 0) return;
  isExporting.value = true;
  uiStore.toast.info('正在生成选中行乐谱图片...');

  try {
    await renderAndExport(selectedLineSet.value);
    uiStore.toast.success(`已成功复制所选 ${selectedLineSet.value.size} 行乐谱图片`);
  } catch (err) {
    console.error('Export Selected Error:', err);
    uiStore.toast.error('导出失败');
  } finally {
    isExporting.value = false;
  }
};

const handleDownloadSelected = async () => {
  if (isExporting.value || selectedLineSet.value.size === 0) return;
  isExporting.value = true;
  uiStore.toast.info('正在下载图片...');

  try {
    const songTitle = scoreEditor.activeSong?.title || '乐谱';
    const fileName = `${songTitle}_选中${selectedLineSet.value.size}行`;
    await renderAndExport(selectedLineSet.value, fileName);
    uiStore.toast.success('图片已成功下载');
  } catch (err) {
    console.error('Download Error:', err);
    uiStore.toast.error('下载失败');
  } finally {
    isExporting.value = false;
  }
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.export-config-container {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.lines-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.72rem;
  color: var(--text-disabled);

  strong {
    color: var(--color-primary);
  }
}

.btn-select-all {
  border: none;
  background: transparent;
  color: var(--color-primary);
  font-weight: 700;
  font-size: 0.72rem;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
}

.lines-preview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.35rem 0.5rem;
  max-height: 15rem;
  overflow-y: auto;
  border: 1px solid var(--border-light);
  border-radius: @radius-md;
  padding: 0.5rem;
  background-color: var(--bg-body);
  user-select: none;
  touch-action: none;
  box-sizing: border-box;
}

.line-preview-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.55rem;
  border-radius: @radius-sm;
  cursor: pointer;
  transition: @transition-fast;
  background-color: var(--bg-panel);
  border: 1px solid var(--border-light);
  box-sizing: border-box;
  min-width: 0;

  &:hover {
    background-color: var(--bg-panel-hover);
    border-color: var(--border-base);
  }

  &.is-selected {
    background-color: color-mix(in srgb, var(--color-primary), transparent 85%);
    border-color: color-mix(in srgb, var(--color-primary), transparent 60%);

    .preview-line-num {
      color: var(--color-primary);
    }

    .preview-line-content {
      color: var(--color-primary);
      font-weight: 700;
    }
  }
}

.preview-line-num {
  font-size: 0.62rem;
  font-weight: 700;
  font-family: monospace;
  color: var(--text-disabled);
  flex-shrink: 0;
}

.preview-line-content {
  font-size: 0.73rem;
  font-weight: 500;
  color: var(--text-body);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.action-footer-grid {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  margin-top: 0.2rem;
}
</style>
