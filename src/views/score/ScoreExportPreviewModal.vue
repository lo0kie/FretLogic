<template>
  <BaseModal
    v-model:visible="visibleModel"
    :show-footer="false"
    width="w-lg"
    @cancel="modeModel = 'normal'"
    :close-on-mask="!isGenerating"
    height="h-full"
    title="导出歌词数据"
  >
    <template #header-extra>
      <BaseSegmentedControl v-model="modeModel" size="sm" :options="modeOptions" class="mode-segmented" />
    </template>

    <div class="export-preview-body">
      <div class="preview-stage no-scrollbar">
        <div v-if="isGenerating" class="preview-loading">正在生成预览...</div>
        <EmptyState v-else-if="pages.length === 0" description="暂无预览内容" size="md" />
        <img
          v-else
          :src="currentPage?.objectUrl"
          class="preview-image"
          :class="{ 'is-a4': mode === 'a4' }"
          alt="导出预览"
        />
      </div>

      <BasePagination
        v-if="modeModel === 'a4'"
        v-model="currentPageIndexModel"
        :total="pages.length"
        :disabled="isGenerating"
        size="sm"
      />

      <div class="preview-actions-row">
        <ActionButton variant="subtle" :disabled="isActionDisabled" @click="emit('download-current-page')">
          <template #prefix><Download :size="14" stroke-width="2.5" /></template>
          下载
        </ActionButton>

        <ActionButton variant="subtle" :disabled="isActionDisabled" @click="emit('copy-current-page')">
          <template #prefix><Copy :size="14" stroke-width="2.5" /></template>
          复制
        </ActionButton>

        <ActionButton primary :disabled="isActionDisabled" @click="emit('download-pdf')">
          <template #prefix><FileDown :size="14" stroke-width="2.5" /></template>
          生成 PDF
        </ActionButton>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import BaseModal from '@/components/BaseModal.vue';
import BasePagination from '@/components/BasePagination.vue';
import BaseSegmentedControl from '@/components/BaseSegmentedControl.vue';
import EmptyState from '@/components/EmptyState.vue';
import type { ExportMode, PreviewPage } from '@/services/useScoreExportPreview';
import { Copy, Download, FileDown } from '@lucide/vue';
import { computed } from 'vue';

const props = defineProps<{
  visible: boolean;
  mode: ExportMode;
  pages: PreviewPage[];
  currentPage: PreviewPage | null;
  currentPageIndex: number;
  isGenerating: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'update:mode', value: ExportMode): void;
  (e: 'update:currentPageIndex', value: number): void;
  (e: 'copy-current-page'): void;
  (e: 'download-pdf'): void;
  (e: 'download-current-page'): void;
}>();

const isActionDisabled = computed(() => props.pages.length === 0 || props.isGenerating);
const visibleModel = computed({
  get: () => props.visible,
  set: val => emit('update:visible', val),
});
const modeModel = computed({
  get: () => props.mode,
  set: val => emit('update:mode', val),
});
const currentPageIndexModel = computed({
  get: () => props.currentPageIndex,
  set: val => emit('update:currentPageIndex', val),
});

const modeOptions = [
  { label: '常规', value: 'normal' },
  { label: 'A4', value: 'a4' },
];
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.export-preview-body {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 0.75rem;
  flex: 1; /* 🌟 关键：让自身在父容器中占满剩余高度 */
  height: 100%; /* 🌟 补全高度继承 */
  min-height: 0;
}

.preview-stage {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  flex: 1;
  height: 0;
  min-height: 320px;
  padding: 0.6rem;
  overflow: auto;
  box-sizing: border-box;
  border: 1px solid var(--border-light);
  border-radius: @radius-lg;
  background-color: var(--bg-body);
  isolation: isolate;

  @grid-color: color-mix(in srgb, var(--border-base), transparent 85%);
  background-image:
    linear-gradient(45deg, @grid-color 25%, transparent 25%), linear-gradient(-45deg, @grid-color 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, @grid-color 75%), linear-gradient(-45deg, transparent 75%, @grid-color 75%);
  background-size: 16px 16px;
  background-position:
    0 0,
    0 8px,
    8px -8px,
    -8px 0;

  > :not(.preview-image) {
    margin: auto;
  }
}

/* =========================
 * Preview Image
 * ========================= */
.preview-image {
  display: block;
  width: auto;
  max-width: 100%;
  height: auto; /* 🌟 常规模式保持原本自适应尺寸 */
  flex-shrink: 0;

  border-radius: @radius-sm;
  box-shadow: var(--shadow-md);
  background-color: var(--bg-main);
  object-fit: contain;
  transition:
    box-shadow @duration-fast ease,
    transform @duration-fast ease;

  /* 🌟 仅在 A4 模式下拉满父容器高度 */
  &.is-a4 {
    height: 100%;
    max-height: 100%;
  }
}

/* =========================
 * Loading & UI Components
 * ========================= */
.preview-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 260px;
  color: var(--text-disabled);
  font-size: 0.85rem;
  line-height: 1.5;

  &::before {
    content: '';
    width: 1rem;
    height: 1rem;
    margin-right: 0.55rem;
    border: 2px solid var(--border-base);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: export-preview-spin 0.7s linear infinite;
  }
}

@keyframes export-preview-spin {
  to {
    transform: rotate(360deg);
  }
}

.preview-actions-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

@media (max-width: 640px) {
  .preview-stage {
    min-height: 260px;
    max-height: 45vh;
    padding: 0.75rem;
    border-radius: @radius-md;
  }

  .preview-image.is-a4 {
    max-height: 42vh;
  }

  .preview-actions-row {
    justify-content: stretch;
    > * {
      flex: 1;
    }
  }
}
</style>
