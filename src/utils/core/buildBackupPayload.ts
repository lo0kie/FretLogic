import { validateImportExportPayload } from '@/services/validation/payload';
import { useChordStore } from '@/stores/chordStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSongStore } from '@/stores/songStore';
import type { ImportExportPayload, SyncSettingsBackup } from '@/types';

/**
 * 从当前 store 快照生成经 validate 清洗后的备份包（v5 起可包含云端同步配置）。
 * 须在 Pinia 已激活的上下文中调用（组件 / composable / 用户事件回调）。
 * validateImportExportPayload 内部会整体克隆并重建对象，这里无需再 cloneDeep。
 *
 * @param options.includeSyncSettings 是否携带同步配置（含凭据）。
 *   手动导出备份默认 true；云端推送（push）应传 false，避免凭据写入云端。
 */
export function buildBackupPayload(options?: { includeSyncSettings?: boolean }): ImportExportPayload | null {
  const includeSyncSettings = options?.includeSyncSettings ?? true;
  const chordStore = useChordStore();
  const songStore = useSongStore();
  const settingsStore = useSettingsStore();

  const groups = chordStore.groups;

  const syncSettings: SyncSettingsBackup | undefined = includeSyncSettings
    ? {
        syncTarget: settingsStore.syncTarget,
        githubToken: settingsStore.githubToken,
        githubOwner: settingsStore.githubOwner,
        githubRepo: settingsStore.githubRepo,
        githubBranch: settingsStore.githubBranch,
        githubPath: settingsStore.githubPath,
        webdavServerUrl: settingsStore.webdavServerUrl,
        webdavUsername: settingsStore.webdavUsername,
        webdavPassword: settingsStore.webdavPassword,
        webdavProxyUrl: settingsStore.webdavProxyUrl,
      }
    : undefined;

  const raw = {
    version: 1,
    groups,
    chords: chordStore.savedChordsList,
    songs: songStore.songs,
    ...(syncSettings ? { syncSettings } : {}),
  };

  const { isValid, payload, issues } = validateImportExportPayload(raw);
  if (!isValid || !payload) {
    console.error('[buildBackupPayload] invalid:', issues);
    return null;
  }
  return payload;
}
