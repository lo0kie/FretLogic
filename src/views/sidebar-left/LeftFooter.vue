<template>
  <div class="p-4 border-t border-slate-100 dark:border-slate-800 min-w-[335px] bg-slate-50/50 dark:bg-slate-900/20">
    <input type="file" ref="fileInputRef" accept=".json" @change="processImport" class="hidden" />
    <div class="grid grid-cols-2 gap-2">
      <ActionButton @click="handleImportTrigger" class="control-bordered">导入备份</ActionButton>
      <ActionButton @click="triggerFullExport" class="control-bordered">全量导出</ActionButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import { useChordLabStore } from '@/stores/chordLabStore';
import { useUiStore } from '@/stores/uiStore';
import { ref } from 'vue';

const uiStore = useUiStore();
const chordLabStore = useChordLabStore();
const fileInputRef = ref<HTMLInputElement | null>(null);

const handleImportTrigger = () => fileInputRef.value?.click();

const processImport = (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (!target.files || target.files.length === 0) return;

  const reader = new FileReader();
  reader.onload = ev => {
    try {
      if (ev.target?.result) {
        const imported = JSON.parse(ev.target.result as string);
        if (imported?.groups) {
          chordLabStore.groups = imported.groups;
          chordLabStore.savedChordsList = imported.chords;
          uiStore.showToast('📂 恢复成功');
        }
      }
    } catch (err) {
      uiStore.showToast('❌ 备份解析失败，请检查文件格式');
    }
  };
  reader.readAsText(target.files[0]);
};

const triggerFullExport = () => {
  const link = document.createElement('a');
  const data = JSON.stringify({ groups: chordLabStore.groups, chords: chordLabStore.savedChordsList });
  link.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  link.download = `和弦备份_${Date.now()}.json`;
  link.click();
  uiStore.showToast('💾 备份已下载');
};
</script>
