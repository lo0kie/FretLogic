<template>
  <div
    class="p-4 border-t border-[var(--control-border)] bg-[var(--bg-body)] rounded-b-xl"
    :class="`min-w-[${SIDEBAR_WIDTH_PIXEL}]`"
  >
    <input type="file" ref="fileInputRef" accept=".json" @change="processImport" class="hidden" />
    <div class="grid grid-cols-2 gap-2">
      <ActionButton @click="handleImportTrigger">导入备份</ActionButton>
      <ActionButton @click="triggerFullExport">全量导出</ActionButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import { SIDEBAR_WIDTH_PIXEL } from '@/constants';
import { useChordLabStore } from '@/stores/chordLabStore';
import { useUiStore } from '@/stores/uiStore';
import { cleanAndValidateData } from '@/utils/dataParser';
import { ref } from 'vue';

const uiStore = useUiStore();
const chordLabStore = useChordLabStore();
const fileInputRef = ref<HTMLInputElement | null>(null);
const handleImportTrigger = () => fileInputRef.value?.click();

const processImport = (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (!target.files || target.files.length === 0) return;

  const file = target.files[0];

  // 🌟 拦截 1：物理大小为 0 的空文件
  if (file.size === 0) {
    uiStore.showToast('❌ 导入失败：不能导入空文件');
    target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const resultStr = ((ev.target?.result as string) || '').trim();

      // 🌟 拦截 2：内容只有空白字符或完全为空的文件
      if (!resultStr) {
        uiStore.showToast('❌ 导入失败：文件内容为空');
        return;
      }

      const imported = JSON.parse(resultStr);
      if (cleanAndValidateData(imported, 'import')) {
        chordLabStore.overwriteGroups(imported.groups);
        chordLabStore.overwriteChords(imported.chords);
        if (!chordLabStore.groups.some(g => g.id === chordLabStore.selectedGroupId)) {
          chordLabStore.selectedGroupId = chordLabStore.groups[0]?.id || null;
        }
        uiStore.showToast('📥 数据恢复成功');
      } else {
        throw new Error('Import verification failed');
      }
    } catch (err) {
      console.error('备份解析拦截:', err);
      uiStore.showToast('❌ 文件非标准和弦备份或核心数据已损坏');
    } finally {
      target.value = '';
    }
  };
  reader.readAsText(file);
};

const triggerFullExport = () => {
  const originalData = { groups: chordLabStore.groups, chords: chordLabStore.savedChordsList };
  if (cleanAndValidateData(originalData, 'export')) {
    chordLabStore.overwriteChords(originalData.chords);
    const link = document.createElement('a');
    const dataString = JSON.stringify({ groups: originalData.groups, chords: originalData.chords });
    link.href = URL.createObjectURL(new Blob([dataString], { type: 'application/json' }));
    link.download = `和弦备份_${Date.now()}.json`;
    link.click();
    uiStore.showToast('📤 备份已下载');
  } else {
    uiStore.showToast('❌ 当前本地缓存存在严重破损数据，请检查控制台');
  }
};
</script>
