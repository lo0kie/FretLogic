import type { Chord, Group } from '@/domains/chord/types';
import type { Song } from '@/domains/score/types';
import type { AppPreferencesBackup, SyncProviderKind, SyncSettingsBackup } from '@/platform/types';

export type { AppPreferencesBackup, SyncProviderKind, SyncSettingsBackup };

/** 备份包结构版本；历史包可能是任意旧版本，迁移链逐级升级到 CURRENT_PAYLOAD_VERSION */
export type PayloadVersion = 1 | 2 | 3 | 4 | 5 | 6;

export interface ImportExportPayload {
  version?: PayloadVersion;
  groups: Group[];
  chords: Chord[];
  songs: Song[];
  syncSettings?: SyncSettingsBackup;
  preferences?: AppPreferencesBackup;
}

/** 备份内容勾选项：和弦（含分组）/ 乐谱 / 同步配置 / 偏好设置 */
export interface BackupSelection {
  chords: boolean;
  songs: boolean;
  syncSettings: boolean;
  preferences: boolean;
}
