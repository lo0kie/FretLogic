/** * @Author likan * @Date 2026-05-31 * @Filepath fret-logic/src/views/sidebar-left/LeftFooter.vue */

<template>
  <div
    class="p-4 border-t border-[var(--control-border)] bg-[var(--bg-body)] rounded-b-xl"
    :class="`min-w-[${SIDEBAR_WIDTH_PIXEL}]`"
  >
    <input type="file" ref="fileInputRef" accept=".json" @change="handleFileChange" class="hidden" />

    <div class="grid grid-cols-2 gap-2">
      <ActionButton @click="handleImportTrigger" class="text-xs">
        <Download :size="18" :stroke-width="3" class="mr-2" />
        <span>导入备份</span>
      </ActionButton>

      <ActionButton @click="ioService.triggerFullExport()" class="text-xs">
        <Upload :size="18" :stroke-width="3" class="mr-2" />
        <span>全量导出</span>
      </ActionButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import { SIDEBAR_WIDTH_PIXEL } from '@/constants';
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
