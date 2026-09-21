/**
 * 备份包构造器：把当前 store 快照组装为可导出 / 可推送的 ImportExportPayload。
 */
import { useChordStore } from '@/domains/chord/store/chordStore';
import { useSongStore } from '@/domains/score/library/store/songStore';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { logger } from '@/platform/utils/logger';

import { FULL_BACKUP_SELECTION } from './backupSelection';

import type { ImportExportPayload, SyncSettingsBackup } from '@/app/types';
import type { BackupSelection } from '@/app/types/payload';

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
 * payload 校验模块（含 zod）为动态加载：备份构造只发生在导出/推送时，
 * 静态引入会把 zod 拖进首屏闭包（check-bundle 220KB 预算）。
 */
export async function buildBackupPayloadResult(options?: BuildBackupOptions): Promise<BuildBackupResult> {
  const selection = options?.selection ?? FULL_BACKUP_SELECTION;
  const mode = options?.mode ?? 'lenient';
  const chordStore = useChordStore();
  const songStore = useSongStore();
  const settingsStore = useSettingsStore();

  const baseChords = selection.chords ? chordStore.savedChordsList : [];
  const songs = selection.songs ? songStore.songs : [];
  // 导出乐谱时必须连带其引用的和弦：即便未勾选「和弦」，歌曲 chordMap 引用的和弦也应一并导出，
  // 否则导入端 pruneOrphanChordRefs 会把悬空引用剪光，乐谱变成无和弦空壳（D14）
  let chords = baseChords;
  if (selection.songs && !selection.chords) {
    const referencedIds = new Set<string>();
    for (const song of songs)
      for (const slots of song.chordMap.values())
        for (const id of [...slots.char.values(), ...slots.start, ...slots.end]) if (id) referencedIds.add(id);

    const existingIds = new Set(baseChords.map(c => c.id));
    const referenced = chordStore.savedChordsList.filter(c => referencedIds.has(c.id) && !existingIds.has(c.id));
    chords = [...baseChords, ...referenced];
  }
  // N1：补进的被引用和弦不能悬空——其所属分组必须连带导出，否则导出路径自身的
  // 孤儿清洗（validateImportExportPayload → pruneOrphanChordRefs）会把它们全部剪掉，
  // D14 的修复空转，产物仍是「无和弦空壳」
  let groups = selection.chords ? chordStore.groups : [];
  if (selection.songs && !selection.chords) {
    const neededGroupIds = new Set(chords.map(c => c.groupId));
    const referencedGroups = chordStore.groups.filter(g => neededGroupIds.has(g.id));
    if (referencedGroups.length > 0) groups = referencedGroups;
  }

  // 同步配置按当前 syncTarget 组装为判别联合的对应分支
  const syncSettings: SyncSettingsBackup | undefined = selection.syncSettings
    ? (() => {
        switch (settingsStore.syncTarget) {
          case 'github':
            return {
              kind: 'github',
              token: settingsStore.githubToken,
              owner: settingsStore.githubOwner,
              repo: settingsStore.githubRepo,
              branch: settingsStore.githubBranch,
              path: settingsStore.githubPath,
            } satisfies SyncSettingsBackup;
          case 'gitee':
            return {
              kind: 'gitee',
              token: settingsStore.giteeToken,
              owner: settingsStore.giteeOwner,
              repo: settingsStore.giteeRepo,
              branch: settingsStore.giteeBranch,
              path: settingsStore.giteePath,
            } satisfies SyncSettingsBackup;
          case 'webdav':
            return {
              kind: 'webdav',
              serverUrl: settingsStore.webdavServerUrl,
              username: settingsStore.webdavUsername,
              password: settingsStore.webdavPassword,
              useDefaultProxy: settingsStore.webdavUseDefaultProxy,
              proxyUrl: settingsStore.webdavProxyUrl,
            } satisfies SyncSettingsBackup;
          case 'server':
            return {
              kind: 'server',
              serverUrl: settingsStore.serverUrl,
              token: settingsStore.serverToken,
            } satisfies SyncSettingsBackup;
        }
      })()
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

  const { validateImportExportPayload } = await import('@/app/services/validation/payload');
  const { isValid, payload, issues, warnings = [] } = validateImportExportPayload(raw, { mode });
  if (!isValid || !payload) {
    logger.error('backup', '备份包构造校验失败', issues);
    return { payload: null, issues, warnings };
  }
  return { payload, issues: [], warnings };
}

export async function buildBackupPayload(options?: BuildBackupOptions): Promise<ImportExportPayload | null> {
  return (await buildBackupPayloadResult(options)).payload;
}
