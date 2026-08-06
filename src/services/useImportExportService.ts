import { useChordStore } from '@/stores/chordStore';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import type { ImportExportPayload } from '@/types';
import { cloneDeep } from '@/utils/cloneDeep';
import { validateImportExportPayload } from '@/utils/validatePayload';

export function useImportExportService() {
  const chordStore = useChordStore();
  const songStore = useSongStore();
  const uiStore = useUiStore();

  const processImport = (file: File, resetInputCallback: () => void): Promise<ImportExportPayload | null> => {
    return new Promise(resolve => {
      if (file.size === 0) {
        uiStore.toast.error('导入失败：不能导入空文件');
        resetInputCallback();
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = async ev => {
        const loadingId = uiStore.toast.loading('正在解析数据...');
        await new Promise(r => setTimeout(r, 30));
        try {
          const resultStr = ((ev.target?.result as string) || '').trim();
          if (!resultStr) {
            uiStore.removeToast(loadingId);
            uiStore.toast.error('导入失败：文件内容为空');
            resolve(null);
            return;
          }
          const imported = JSON.parse(resultStr);
          const { isValid, payload } = validateImportExportPayload(imported);
          if (isValid && payload) {
            uiStore.removeToast(loadingId);
            resolve(payload);
          } else {
            throw new Error('Import verification failed');
          }
        } catch (err) {
          console.error('备份解析拦截:', err);
          uiStore.removeToast(loadingId);
          uiStore.toast.error('文件非标准备份或核心数据已损坏');
          resolve(null);
        } finally {
          resetInputCallback();
        }
      };
      reader.readAsText(file);
    });
  };

  const applySelectedImport = (
    data: ImportExportPayload,
    selectedState: { groupIds: Set<string>; chordIds: Set<string>; songIds: Set<string> }
  ) => {
    const newGroupIds = selectedState.groupIds;
    const targetGroups = (data.groups || []).filter(g => newGroupIds.has(g.id));
    const localGroupIds = new Set(chordStore.groups.map(g => g.id));
    const mergedGroups = [...chordStore.groups];
    targetGroups.forEach(g => {
      if (!localGroupIds.has(g.id)) {
        mergedGroups.push(cloneDeep(g));
        localGroupIds.add(g.id);
      }
    });
    const newChordIds = selectedState.chordIds;
    const targetChords = (data.chords || []).filter(c => newChordIds.has(c.id));
    const localChordIds = new Set(chordStore.savedChordsList.map(c => c.id));
    const localChordFps = new Set(chordStore.savedChordsList.map(c => c.fingerprint));
    const mergedChords = [...chordStore.savedChordsList];
    targetChords.forEach(c => {
      const isExistById = localChordIds.has(c.id);
      const isExistByFp = c.fingerprint ? localChordFps.has(c.fingerprint) : false;
      if (!isExistById && !isExistByFp) {
        mergedChords.push(cloneDeep(c));
        localChordIds.add(c.id);
        if (c.fingerprint) localChordFps.add(c.fingerprint);
      }
    });
    const newSongIds = selectedState.songIds;
    const targetSongs = (data.songs || []).filter(s => newSongIds.has(s.id));
    const localSongIds = new Set(songStore.songs.map(s => s.id));
    const mergedSongs = [...songStore.songs];
    targetSongs.forEach(s => {
      if (!localSongIds.has(s.id)) {
        mergedSongs.push(cloneDeep(s));
        localSongIds.add(s.id);
      }
    });
    let finalSelectedId = chordStore.selectedGroupId;
    if (!mergedGroups.some(g => g.id === finalSelectedId)) {
      finalSelectedId = mergedGroups[0]?.id || null;
    }
    mergedGroups.forEach(g => {
      g.collapsed = g.id !== finalSelectedId;
    });
    chordStore.overwriteGroups(mergedGroups);
    chordStore.overwriteChords(mergedChords);
    songStore.overwriteSongs(mergedSongs);
    chordStore.selectedGroupId = finalSelectedId;
    uiStore.toast.success('已完成所选数据的导入恢复');
  };

  const triggerFullExport = () => {
    const originalData = {
      version: 1,
      groups: cloneDeep(chordStore.groups).map(g => ({ ...g, collapsed: true })),
      chords: cloneDeep(chordStore.savedChordsList),
      songs: cloneDeep(songStore.songs),
    };
    const { isValid } = validateImportExportPayload(originalData);
    if (isValid) {
      const now = new Date();
      const tzOffset = now.getTimezoneOffset() * 60000;
      const localISOTime = new Date(now.getTime() - tzOffset).toISOString().slice(0, -1);
      const dateStr = localISOTime.replace(/T/, '_').replace(/:/g, '-').split('.')[0];
      const link = document.createElement('a');
      const dataString = JSON.stringify(originalData);
      const blob = new Blob([dataString], { type: 'application/json' });
      const objectUrl = URL.createObjectURL(blob);
      link.href = objectUrl;
      link.download = `FretLogic备份_${dateStr}.json`;
      link.click();
      setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 1000);
      uiStore.toast.success('备份已下载');
    } else {
      uiStore.toast.error('当前本地缓存存在严重破损数据，请检查控制台');
    }
  };

  return {
    processImport,
    triggerFullExport,
    applySelectedImport,
  };
}
