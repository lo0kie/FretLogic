/**
 * 备份包构造器：把当前 store 快照组装为可导出 / 可推送的 ImportExportPayload。
 */
import { validateImportExportPayload } from '@/services/validation/payload';
import { useChordStore } from '@/stores/chordStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSongStore } from '@/stores/songStore';
import type { ImportExportPayload, SyncSettingsBackup } from '@/types';
import type { BackupSelection } from '@/composables/app/useImportExportService';
import { FULL_BACKUP_SELECTION } from '@/composables/app/useImportExportService';

/**
 * 从当前 store 快照生成经 validate 清洗后的备份包（v5 起可包含同步配置，v6 起携带偏好设置）。
 * 须在 Pinia 已激活的上下文中调用（组件 / composable / 用户事件回调）。
 * validateImportExportPayload 内部会整体克隆并重建对象，这里无需再 cloneDeep。
 *
 * @param options.selection 按类别勾选导出内容（默认全选）。
 *   其中 syncSettings 含凭据：手动导出默认 true；云端推送（push）必须传 false，避免凭据写入云端。
 */
export function buildBackupPayload(options?: { selection?: BackupSelection }): ImportExportPayload | null {
  const selection = options?.selection ?? FULL_BACKUP_SELECTION;
  const chordStore = useChordStore();
  const songStore = useSongStore();
  const settingsStore = useSettingsStore();

  const groups = selection.chords ? chordStore.groups : [];
  const chords = selection.chords ? chordStore.savedChordsList : [];
  const songs = selection.songs ? songStore.songs : [];

  const syncSettings: SyncSettingsBackup | undefined = selection.syncSettings
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
        webdavUseDefaultProxy: settingsStore.webdavUseDefaultProxy,
        webdavProxyUrl: settingsStore.webdavProxyUrl,
        serverUrl: settingsStore.serverUrl,
        serverToken: settingsStore.serverToken,
      }
    : undefined;

  // 偏好设置不含凭据，本地导出与云端推送均携带（v6 起）
  const preferences = selection.preferences
    ? {
        workbenchChordShorthand: settingsStore.workbenchChordShorthand,
        workbenchShowPitchNames: settingsStore.workbenchShowPitchNames,
        scoreChordShorthand: settingsStore.scoreChordShorthand,
        scoreShowPitchNames: settingsStore.scoreShowPitchNames,
      }
    : undefined;

  const raw = {
    version: 1,
    groups,
    chords,
    songs,
    ...(syncSettings ? { syncSettings } : {}),
    ...(preferences ? { preferences } : {}),
  };

  const { isValid, payload, issues } = validateImportExportPayload(raw);
  if (!isValid || !payload) {
    console.error('[buildBackupPayload] invalid:', issues);
    return null;
  }
  return payload;
}
