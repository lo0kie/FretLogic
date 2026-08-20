import { useChordStore } from '@/stores/chordStore';
import { useSongStore } from '@/stores/songStore';
import type { ImportExportPayload } from '@/types';
import { validateImportExportPayload } from '@/utils/validatePayload';

/**
 * 从当前 store 快照生成经 validate 清洗后的备份包。
 * 须在 Pinia 已激活的上下文中调用（组件 / composable / 用户事件回调）。
 * validateImportExportPayload 内部会整体克隆并重建对象，这里无需再 cloneDeep。
 */
export function buildSanitizedBackupPayload(): ImportExportPayload | null {
  const chordStore = useChordStore();
  const songStore = useSongStore();

  const groups = chordStore.groups;

  const raw = {
    version: 1,
    groups,
    chords: chordStore.savedChordsList,
    songs: songStore.songs,
  };

  const { isValid, payload, issues } = validateImportExportPayload(raw);
  if (!isValid || !payload) {
    console.error('[buildSanitizedBackupPayload] invalid:', issues);
    return null;
  }
  return payload;
}
