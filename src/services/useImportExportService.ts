import { useChordStore } from '@/stores/chordStore';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import { cleanAndValidateData } from '@/utils/dataParser';

export function useImportExportService() {
  const chordStore = useChordStore();
  const songStore = useSongStore();
  const uiStore = useUiStore();

  const processImport = (file: File, resetInputCallback: () => void) => {
    if (file.size === 0) {
      uiStore.toast.error('导入失败：不能导入空文件');
      resetInputCallback();
      return;
    }

    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const resultStr = ((ev.target?.result as string) || '').trim();
        if (!resultStr) {
          uiStore.toast.error('导入失败：文件内容为空');
          return;
        }

        const imported = JSON.parse(resultStr);

        if (cleanAndValidateData(imported, 'import')) {
          chordStore.overwriteGroups(imported.groups);
          chordStore.overwriteChords(imported.chords);

          // 🌟 恢复乐谱数据
          if (imported.songs) {
            songStore.overwriteSongs(imported.songs);
          }

          if (!chordStore.groups.some(g => g.id === chordStore.selectedGroupId)) {
            chordStore.selectedGroupId = chordStore.groups[0]?.id || null;
          }
          uiStore.toast.success('数据恢复成功');
        } else {
          throw new Error('Import verification failed');
        }
      } catch (err) {
        console.error('备份解析拦截:', err);
        uiStore.toast.error('文件非标准备份或核心数据已损坏');
      } finally {
        resetInputCallback();
      }
    };
    reader.readAsText(file);
  };

  const triggerFullExport = () => {
    const originalData = {
      groups: chordStore.groups,
      chords: chordStore.savedChordsList,
      songs: songStore.songs, // 🌟 打包乐谱数据全量导出
    };

    if (cleanAndValidateData(originalData, 'export')) {
      chordStore.overwriteChords(originalData.chords);

      const now = new Date();
      const tzOffset = now.getTimezoneOffset() * 60000;
      const localISOTime = new Date(now.getTime() - tzOffset).toISOString().slice(0, -1);
      const dateStr = localISOTime.replace(/T/, '_').replace(/:/g, '-').split('.')[0];
      const link = document.createElement('a');
      const dataString = JSON.stringify(originalData);
      link.href = URL.createObjectURL(new Blob([dataString], { type: 'application/json' }));
      link.download = `FretLogic备份_${dateStr}.json`;
      link.click();
      uiStore.toast.success('备份已下载');
    } else {
      uiStore.toast.error('当前本地缓存存在严重破损数据，请检查控制台');
    }
  };

  return { processImport, triggerFullExport };
}
