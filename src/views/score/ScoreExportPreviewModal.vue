<template>
  <BaseModal
    v-model:visible="visibleModel"
    :show-footer="false"
    width="w-lg"
    :close-on-mask="!isGenerating"
    height="h-full"
    title="导出歌词数据"
    @cancel="modeModel = ExportMode.NORMAL"
  >
    <template #header-extra>
      <BaseSegmentedControl v-model="modeModel" size="sm" :options="modeOptions" />
    </template>

    <div class="flex flex-col gap-md flex-1 h-full min-h-0">
      <div
        class="relative flex flex-col items-center w-full flex-1 h-0 min-h-0 p-md overflow-auto box-border border border-border-light rounded-lg bg-bg-body isolate no-scrollbar [background-image:linear-gradient(45deg,var(--tint-borderbase-85)_25%,transparent_25%),linear-gradient(-45deg,var(--tint-borderbase-85)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,var(--tint-borderbase-85)_75%),linear-gradient(-45deg,transparent_75%,var(--tint-borderbase-85)_75%)] [background-size:16px_16px] [background-position:0_0,0_8px,8px_-8px,-8px_0px]"
      >
        <div
          v-if="isGenerating"
          class="flex items-center justify-center w-full min-h-[260px] text-text-disabled text-sm leading-normal gap-2 m-auto"
        >
          <Loader2 class="w-4 h-4 text-primary animate-spin" />
          <span>正在生成预览{{ (progress ?? 0) > 0 ? ` (${progress}%)` : '' }}...</span>
        </div>
        <EmptyState v-else-if="pages.length === 0" description="暂无预览内容" size="md" class="m-auto" />
        <img
          v-else
          :src="currentPage?.objectUrl"
          class="block shrink-0 rounded-sm shadow-md bg-bg-main object-contain transition-all duration-fast"
          :class="mode === ExportMode.A4 ? 'w-auto h-full max-w-full max-h-full' : 'w-auto max-w-full h-auto'"
          alt="导出预览"
        />
      </div>

      <!-- 底部固定组件区：禁止收缩 (flex-shrink: 0) -->
      <div class="flex flex-col gap-sm shrink-0">
        <BasePagination
          v-if="modeModel === ExportMode.A4"
          v-model="currentPageIndexModel"
          :total="pages.length"
          :disabled="isGenerating"
          size="md"
          :formatter="(current, total) => `第 ${current} / ${total} 张`"
        />

        <BaseSlider
          v-model="qualityDisplayPercent"
          label="导出质量"
          :min="5"
          :max="100"
          :step="5"
          size="md"
          :formatter="val => `${val}%`"
          :disabled="isGenerating"
          @change="handleQualityCommit"
        />

        <div class="flex items-center justify-center gap-sm">
          <ActionButton
            variant="subtle"
            :disabled="isActionDisabled"
            :size="buttonSize"
            @click="emit('download-current-page')"
          >
            <template #prefix>
              <Download :size="14" :stroke-width="2.5" />
            </template>
            下载
          </ActionButton>

          <ActionButton
            variant="subtle"
            :disabled="isActionDisabled"
            :size="buttonSize"
            @click="emit('copy-current-page')"
          >
            <template #prefix>
              <Copy :size="14" :stroke-width="2.5" />
            </template>
            复制图片
          </ActionButton>

          <ActionButton
            v-if="mode === ExportMode.A4"
            variant="subtle"
            :disabled="isActionDisabled"
            :size="buttonSize"
            @click="emit('download-all-zip')"
          >
            <template #prefix>
              <Archive :size="14" :stroke-width="2.5" />
            </template>
            下载全部 (ZIP)
          </ActionButton>

          <ActionButton
            v-if="mode === ExportMode.A4"
            variant="subtle"
            :disabled="isActionDisabled"
            :size="buttonSize"
            @click="emit('download-pdf')"
          >
            <template #prefix>
              <FileDown :size="14" :stroke-width="2.5" />
            </template>
            下载 PDF
          </ActionButton>
        </div>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import ActionButton from '@/components/base/ActionButton.vue';
import BaseModal from '@/components/base/BaseModal.vue';
import BasePagination from '@/components/base/BasePagination.vue';
import BaseSegmentedControl from '@/components/base/BaseSegmentedControl.vue';
import BaseSlider from '@/components/base/BaseSlider.vue';
import EmptyState from '@/components/base/EmptyState.vue';
import { ExportMode, type PreviewPage } from '@/composables/score/useScoreExportPreview';
import { Archive, Copy, Download, FileDown, Loader2 } from '@lucide/vue';
import { computed, ref, watch } from 'vue';

const props = defineProps<{
  visible: boolean;
  isGenerating: boolean;
  pages: PreviewPage[];
  currentPage: PreviewPage | null;
  mode: ExportMode;
  quality: number;
  currentPageIndex: number;
  progress?: number;
  buttonSize?: 'sm' | 'md' | 'lg';
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'update:mode', value: ExportMode): void;
  (e: 'update:currentPageIndex', value: number): void;
  (e: 'commit-quality', value: number): void;
  (e: 'download-current-page'): void;
  (e: 'copy-current-page'): void;
  (e: 'download-all-zip'): void;
  (e: 'download-pdf'): void;
}>();

const buttonSize = computed(() => props.buttonSize || 'md');

const isActionDisabled = computed(() => props.isGenerating || props.pages.length === 0);

// 滑块本地显示值：拖动中只更新显示，松手（change）才提交 commit-quality，避免拖动时反复重新生成
const qualityDisplayPercent = ref(Math.round(props.quality * 100));
watch(
  () => props.quality,
  v => {
    qualityDisplayPercent.value = Math.round(v * 100);
  }
);
const handleQualityCommit = (val: number | [number, number]) => {
  const numericVal = Array.isArray(val) ? (val[0] ?? 100) : val;
  emit('commit-quality', numericVal / 100);
};

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
  { label: '长图', value: ExportMode.NORMAL },
  { label: 'A4', value: ExportMode.A4 },
];
</script>
