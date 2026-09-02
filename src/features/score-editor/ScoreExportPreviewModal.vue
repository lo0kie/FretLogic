<template>
  <BaseModal
    v-model:visible="visibleModel"
    :close-on-mask="!isGenerating"
    :show-footer="false"
    @cancel="modeModel = ExportMode.NORMAL"
    height="h-full"
    title="导出歌词数据"
    width="w-lg"
  >
    <template #header-extra>
      <BaseSegmentedControl v-model="modeModel" :options="modeOptions" size="sm" />
    </template>

    <div class="gap-md flex h-full min-h-0 flex-1 flex-col">
      <div
        class="p-md border-border-light bg-bg-body no-scrollbar relative isolate box-border flex h-0 min-h-0 w-full flex-1 flex-col items-center overflow-auto rounded-lg border bg-[linear-gradient(45deg,var(--tint-borderbase-85)_25%,transparent_25%),linear-gradient(-45deg,var(--tint-borderbase-85)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,var(--tint-borderbase-85)_75%),linear-gradient(-45deg,transparent_75%,var(--tint-borderbase-85)_75%)] bg-size-[16px_16px] bg-position-[0_0,0_8px,8px_-8px,-8px_0px]"
      >
        <div
          v-if="isGenerating"
          class="text-text-disabled m-auto flex min-h-[260px] w-full items-center justify-center gap-2 text-sm leading-normal"
        >
          <BaseIcon class="text-primary h-4 w-4 animate-spin" name="loader-2" />
          <span>正在生成预览{{ (progress ?? 0) > 0 ? ` (${progress}%)` : '' }}...</span>
        </div>
        <EmptyState v-else-if="pages.length === 0" class="m-auto" description="暂无预览内容" size="md" />
        <img
          v-else
          :class="mode === ExportMode.A4 ? 'h-full max-h-full w-auto max-w-full' : 'h-auto w-auto max-w-full'"
          :src="currentPage?.objectUrl"
          alt="导出预览"
          class="bg-bg-main duration-fast block shrink-0 rounded-sm object-contain shadow-md transition-all"
        />
      </div>

      <div class="gap-sm flex shrink-0 flex-col">
        <BasePagination
          v-if="modeModel === ExportMode.A4"
          v-model="currentPageIndexModel"
          :disabled="isGenerating"
          :formatter="(current, total) => `第 ${current} / ${total} 张`"
          :total="pages.length"
          size="md"
        />

        <BaseSlider
          v-model="qualityDisplayPercent"
          :default-value="85"
          :disabled="isGenerating"
          :formatter="val => `${val}%`"
          :max="100"
          :min="5"
          :step="5"
          @change="handleQualityCommit"
          label="导出质量"
          size="md"
        />

        <div class="gap-sm flex items-center justify-center">
          <ActionButton
            :disabled="isActionDisabled"
            :size="buttonSize"
            @click="emit('download-current-page')"
            variant="subtle"
          >
            <template #prefix>
              <BaseIcon :size="14" :stroke-width="2.5" name="download" />
            </template>
            下载
          </ActionButton>

          <ActionButton
            :disabled="isActionDisabled"
            :size="buttonSize"
            @click="emit('copy-current-page')"
            variant="subtle"
          >
            <template #prefix>
              <BaseIcon :size="14" :stroke-width="2.5" name="copy" />
            </template>
            复制图片
          </ActionButton>

          <ActionButton
            v-if="mode === ExportMode.A4"
            :disabled="isActionDisabled"
            :size="buttonSize"
            @click="emit('download-all-zip')"
            variant="subtle"
          >
            <template #prefix>
              <BaseIcon :size="14" :stroke-width="2.5" name="archive" />
            </template>
            下载全部 (ZIP)
          </ActionButton>

          <ActionButton
            v-if="mode === ExportMode.A4"
            :disabled="isActionDisabled"
            :size="buttonSize"
            @click="emit('download-pdf')"
            variant="subtle"
          >
            <template #prefix>
              <BaseIcon :size="14" :stroke-width="2.5" name="file-down" />
            </template>
            下载 PDF
          </ActionButton>
        </div>
      </div>
    </div>
  </BaseModal>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';

import ActionButton from '@/components/ui/ActionButton.vue';
import BaseIcon from '@/components/ui/BaseIcon.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import BasePagination from '@/components/ui/BasePagination.vue';
import BaseSegmentedControl from '@/components/ui/BaseSegmentedControl.vue';
import BaseSlider from '@/components/ui/BaseSlider.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import { ExportMode, type PreviewPage } from '@/features/score-editor/composables/useScoreExportPreview';

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
/** 用户松手确认导出质量：把滑块百分比换算回 0-1 提交给父组件重新生成预览 */
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
