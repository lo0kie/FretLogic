<template>
  <div
    class="p-4 border-t border-[var(--control-border)] bg-[var(--bg-body)] rounded-b-xl"
    :style="{ minWidth: LEFT_SIDEBAR_WIDTH_PIXEL }"
  >
    <input type="file" ref="fileInputRef" accept=".json" @change="handleFileChange" class="hidden" />

    <div class="grid grid-cols-2 gap-2">
      <GlobalTooltip content="从本地选择 JSON 备份恢复数据" placement="top">
        <ActionButton @click="handleImportTrigger" class="text-xs">
          <template #prefix>
            <Download :size="18" :stroke-width="3" />
          </template>
          <span>导入备份</span>
        </ActionButton>
      </GlobalTooltip>

      <GlobalTooltip content="导出当前所有分组与和弦为本地文件" placement="top">
        <ActionButton @click="ioService.triggerFullExport()" class="text-xs">
          <template #prefix>
            <Upload :size="18" :stroke-width="3" />
          </template>
          <span>全量导出</span>
        </ActionButton>
      </GlobalTooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { LEFT_SIDEBAR_WIDTH_PIXEL } from '@/constants';
import { useImportExportService } from '@/services/useImportExportService';
import { Download, Upload } from '@lucide/vue';
import { ref } from 'vue';

const ioService = useImportExportService();
const fileInputRef = ref<HTMLInputElement | null>(null);

const handleImportTrigger = () => fileInputRef.value?.click();

const handleFileChange = (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (!target.files || target.files.length === 0) return;
  const file = target.files[0];

  const resetInput = () => {
    if (fileInputRef.value) fileInputRef.value.value = '';
  };

  ioService.processImport(file, resetInput);
};
</script>
