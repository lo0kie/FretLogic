import { useChordLabStore } from '@/stores/chordLabStore';
import { useUiStore } from '@/stores/uiStore';
import { cleanAndValidateData } from '@/utils/dataParser';

export function useImportExportService() {
  const chordStore = useChordLabStore();
  const uiStore = useUiStore();

  const processImport = (file: File, resetInputCallback: () => void) => {
    if (file.size === 0) {
      uiStore.showToast('❌ 导入失败：不能导入空文件');
      resetInputCallback();
      return;
    }

    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const resultStr = ((ev.target?.result as string) || '').trim();
        if (!resultStr) {
          uiStore.showToast('❌ 导入失败：文件内容为空');
          return;
        }

        const imported = JSON.parse(resultStr);
        if (cleanAndValidateData(imported, 'import')) {
          chordStore.overwriteGroups(imported.groups);
          chordStore.overwriteChords(imported.chords);
          if (!chordStore.groups.some(g => g.id === chordStore.selectedGroupId)) {
            chordStore.selectedGroupId = chordStore.groups[0]?.id || null;
          }
          uiStore.showToast('📦 数据恢复成功');
        } else {
          throw new Error('Import verification failed');
        }
      } catch (err) {
        console.error('备份解析拦截:', err);
        uiStore.showToast('❌ 文件非标准和弦备份或核心数据已损坏');
      } finally {
        resetInputCallback();
      }
    };

    reader.readAsText(file);
  };

  const triggerFullExport = () => {
    const originalData = { groups: chordStore.groups, chords: chordStore.savedChordsList };
    if (cleanAndValidateData(originalData, 'export')) {
      chordStore.overwriteChords(originalData.chords);

      // 🌟 使用 ISO 标准时间戳生成优雅的文件名 (例如: 2026-05-31_17-03-21)
      const now = new Date();
      // 获取本地时间的偏移并处理 ISO 字符串
      const tzOffset = now.getTimezoneOffset() * 60000;
      const localISOTime = new Date(now.getTime() - tzOffset).toISOString().slice(0, -1);
      const dateStr = localISOTime.replace(/T/, '_').replace(/:/g, '-').split('.')[0];

      const link = document.createElement('a');
      const dataString = JSON.stringify({ groups: originalData.groups, chords: originalData.chords });
      link.href = URL.createObjectURL(new Blob([dataString], { type: 'application/json' }));
      link.download = `和弦备份_${dateStr}.json`;
      link.click();
      uiStore.showToast('📥 备份已下载');
    } else {
      uiStore.showToast('❌ 当前本地缓存存在严重破损数据，请检查控制台');
    }
  };

  return { processImport, triggerFullExport };
}
