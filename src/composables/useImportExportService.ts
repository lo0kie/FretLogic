import { useChordEditorStore } from '@/stores/chordEditorStore';
import { useChordStore } from '@/stores/chordStore';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import type { ImportExportPayload } from '@/types';
import { buildBackupPayload } from '@/utils/buildBackupPayload';
import { wait } from '@/utils/score-export';
import { validateImportExportPayload } from '@/services/validation/payload';

export function useImportExportService() {
  const chordStore = useChordStore();
  const songStore = useSongStore();
  const uiStore = useUiStore();

  /** 清洗后的 payload 全量覆盖本地（入参是 validateImportExportPayload 的全新对象图，可直接接管） */
  const applyFullOverwrite = (data: ImportExportPayload) => {
    chordStore.replaceAllData({
      groups: data.groups ?? [],
      chords: data.chords ?? [],
    });
    const songs = data.songs ?? [];
    songStore.overwriteSongs(songs);
    chordStore.selectedGroupId = null;
    // 导入后清空指板编辑草稿（全部静音），避免残留旧指法
    useChordEditorStore().resetEditor();
  };

  const processImport = (file: File, resetInputCallback: () => void): Promise<boolean> => {
    return new Promise(resolve => {
      if (file.size === 0) {
        uiStore.toast.error('导入失败：不能导入空文件');
        resetInputCallback();
        resolve(false);
        return;
      }
      const reader = new FileReader();
      reader.onload = async ev => {
        const loadingId = uiStore.toast.loading('正在解析并恢复数据...');
        await wait(30);

        try {
          const resultStr = ((ev.target?.result as string) || '').trim();
          if (!resultStr) {
            uiStore.removeToast(loadingId);
            uiStore.toast.error('导入失败：文件内容为空');
            resolve(false);
            return;
          }
          const imported = JSON.parse(resultStr);
          const { isValid, payload } = validateImportExportPayload(imported);
          if (!isValid || !payload) {
            throw new Error('Import verification failed');
          }
          applyFullOverwrite(payload);
          uiStore.removeToast(loadingId);
          uiStore.toast.success('已导入并覆盖本地数据');
          resolve(true);
        } catch (err) {
          console.error('备份解析拦截:', err);
          uiStore.removeToast(loadingId);
          uiStore.toast.error('文件非标准备份或核心数据已损坏');
          resolve(false);
        } finally {
          resetInputCallback();
        }
      };
      reader.readAsText(file);
    });
  };

  const triggerFullExport = () => {
    const payload = buildBackupPayload();
    if (!payload) {
      uiStore.toast.error('当前本地缓存存在严重破损数据，请检查控制台');
      return;
    }
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    const localISOTime = new Date(now.getTime() - tzOffset).toISOString().slice(0, -1);
    const dateStr = localISOTime.replace(/T/, '_').replace(/:/g, '-').split('.')[0];
    const link = document.createElement('a');
    const blob = new Blob([JSON.stringify(payload)], {
      type: 'application/json',
    });
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = `FretLogic备份_${dateStr}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    uiStore.toast.success('备份已下载');
  };

  return {
    processImport,
    triggerFullExport,
    applyFullOverwrite,
  };
}
