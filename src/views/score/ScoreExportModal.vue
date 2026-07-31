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

      <!-- 2. 歌词行列表：支持离散多选与按住拖拽划选，支持边缘自动滚动 -->
      <div class="lines-preview-list no-scrollbar" ref="previewListRef">
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
        <!-- 🌟 常驻按钮 1：整张乐谱全量复制 -->
        <ActionButton width="100%" size="md" :loading="isExporting" @click="handleExportAll">
          <template #prefix>
            <Copy :size="15" stroke-width="2.5" />
          </template>
          复制整张乐谱图片
        </ActionButton>

        <!-- 🌟 按钮 2：复制当前选中的行 -->
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

        <!-- 🌟 按钮 3：下载当前选中的行 -->
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
import { useSongStore } from '@/stores/songStore';
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

const songStore = useSongStore();
const uiStore = useUiStore();

const isExporting = ref<boolean>(false);

// 离散多选模型：使用 Set 存储选中的行索引
const selectedLineSet = ref<Set<number>>(new Set());

const isDraggingSelection = ref<boolean>(false);
const dragAnchorLine = ref<number>(-1);
const pointerDownIdx = ref<number>(-1);
const isMovedDuringPointerDown = ref<boolean>(false);

// 🌟 记录本次拖拽的意图：true 为批量选中，false 为批量取消
const isDragSelecting = ref<boolean>(true);
// 🌟 记录拖拽开始前原本选中的行快照
const initialSelectedSnapshot = ref<Set<number>>(new Set());

const previewListRef = ref<HTMLElement | null>(null);

// 解析所有歌词行
const previewLines = computed(() => {
  if (!songStore.activeSong?.lyrics) return [];
  return songStore.activeSong.lyrics.split('\n');
});

const totalLines = computed(() => previewLines.value.length);

const isAllSelected = computed(() => {
  return totalLines.value > 0 && selectedLineSet.value.size === totalLines.value;
});

// 全选与取消全选
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

// 获取鼠标/手指坐标处的行索引
const getLineIdxFromPoint = (clientX: number, clientY: number): number | null => {
  const target = document.elementFromPoint(clientX, clientY);
  const rowEl = target?.closest('.line-preview-row') as HTMLElement;
  if (rowEl && rowEl.dataset.lineIdx !== undefined) {
    return parseInt(rowEl.dataset.lineIdx, 10);
  }
  return null;
};

// 边缘自动滚动
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

// Pointer 事件处理
const handlePointerDown = (e: PointerEvent, idx: number) => {
  if (e.button !== 0) return;
  isDraggingSelection.value = true;
  isMovedDuringPointerDown.value = false;
  pointerDownIdx.value = idx;
  dragAnchorLine.value = idx;

  // 🌟 1. 按下瞬间判断意图：如果点中的行原本未选中 -> 本次拖拽为“批量选中”；反之则为“批量取消”
  isDragSelecting.value = !selectedLineSet.value.has(idx);
  // 🌟 2. 备份拖拽前的初始状态，保证滑动划选实时响应
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

    // 🌟 3. 根据拖拽意图动态执行 add 或 delete
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

  // 🌟 4. 如果是没有发生滑动移位（只是原地点击一下），进行单行选中/取消反选
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

// 乐谱抓取与渲染导出
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

// 1. 导出整张全量乐谱
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

// 2. 复制选中的行
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

// 3. 下载选中的行
const handleDownloadSelected = async () => {
  if (isExporting.value || selectedLineSet.value.size === 0) return;
  isExporting.value = true;
  uiStore.toast.info('正在下载图片...');

  try {
    const songTitle = songStore.activeSong?.title || '乐谱';
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

.lines-preview-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 14rem;
  overflow-y: auto;
  border: 1px solid var(--border-light);
  border-radius: @radius-md;
  padding: 0.4rem;
  background-color: var(--bg-body);
  user-select: none;
  touch-action: none;
}

.line-preview-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.38rem 0.65rem;
  border-radius: @radius-sm;
  cursor: pointer;
  transition: @transition-fast;

  &:hover {
    background-color: var(--bg-panel-hover);
  }

  &.is-selected {
    background-color: color-mix(in srgb, var(--color-primary), transparent 85%);

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
  font-size: 0.65rem;
  font-weight: 700;
  font-family: monospace;
  color: var(--text-disabled);
  flex-shrink: 0;
}

.preview-line-content {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-body);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.action-footer-grid {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  margin-top: 0.2rem;
}
</style>
