/**
 * 备份包构造器：把当前 store 快照组装为可导出 / 可推送的 ImportExportPayload。
 */
import { validateImportExportPayload } from '@/app/services/validation/payload';
import type { ImportExportPayload, SyncSettingsBackup } from '@/app/types';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { useSongStore } from '@/domains/score/library/store/songStore';
import { useSettingsStore } from '@/platform/store/settingsStore';

import type { BackupSelection } from './useImportExportService';
import { FULL_BACKUP_SELECTION } from './useImportExportService';

/**
 * 从当前 store 快照生成经 validate 清洗后的备份包（v5 起可包含同步配置，v6 起携带偏好设置）。
 * 须在 Pinia 已激活的上下文中调用（组件 / composable / 用户事件回调）。
 * validateImportExportPayload 内部会整体克隆并重建对象，这里无需再 cloneDeep。
 */
export interface BuildBackupOptions {
  selection?: BackupSelection;
  /** 清洗模式：备份导出与云端推送默认采用 'lenient' 宽容清洗，避免单条脏记录阻断整体流程 */
  mode?: 'strict' | 'lenient';
}

export interface BuildBackupResult {
  payload: ImportExportPayload | null;
  issues: string[];
  warnings: string[];
}

/**
 * 从当前 store 快照生成经清洗后的备份结果包（包含详细的 issues 与 warnings）。
 */
export function buildBackupPayloadResult(options?: BuildBackupOptions): BuildBackupResult {
  const selection = options?.selection ?? FULL_BACKUP_SELECTION;
  const mode = options?.mode ?? 'lenient';
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
        giteeToken: settingsStore.giteeToken,
        giteeOwner: settingsStore.giteeOwner,
        giteeRepo: settingsStore.giteeRepo,
        giteeBranch: settingsStore.giteeBranch,
        giteePath: settingsStore.giteePath,
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
        scoreChordShorthand: settingsStore.scoreChordShorthand,
        scoreLayoutAlign: settingsStore.scoreLayoutAlign,
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

  const { isValid, payload, issues, warnings = [] } = validateImportExportPayload(raw, { mode });
  if (!isValid || !payload) {
    console.error('[buildBackupPayload] invalid:', issues);
    return { payload: null, issues, warnings };
  }
  return { payload, issues: [], warnings };
}

export function buildBackupPayload(options?: BuildBackupOptions): ImportExportPayload | null {
  return buildBackupPayloadResult(options).payload;
}
