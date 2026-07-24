<template>
  <div class="left-panel-footer" :style="{ minWidth: LEFT_SIDEBAR_WIDTH_PIXEL }">
    <input type="file" ref="fileInputRef" accept=".json" @change="handleFileChange" class="hidden-input" />

    <div class="footer-grid">
      <GlobalTooltip content="从本地选择 JSON 备份恢复数据" placement="top">
        <ActionButton @click="handleImportTrigger" size="sm">
          <template #prefix>
            <Download :size="18" :stroke-width="3" />
          </template>
          <span>导入备份</span>
        </ActionButton>
      </GlobalTooltip>

      <GlobalTooltip content="导出当前所有分组与和弦为本地文件" placement="top">
        <ActionButton @click="ioService.triggerFullExport()" size="sm">
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

<style scoped lang="less">
@import '@/assets/tokens.module';

.left-panel-footer {
  padding: 1rem;
  border-top: 1px solid var(--control-border);
  background-color: var(--bg-body);
  border-bottom-left-radius: @radius-xl;
  border-bottom-right-radius: @radius-xl;
  box-sizing: border-box;
}

.hidden-input {
  display: none;
}

.footer-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
  box-sizing: border-box;
}
</style>
