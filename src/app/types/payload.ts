import type { Chord, Group } from '@/domains/chord/types';
import type { Song } from '@/domains/score/types';
import type {
  AppPreferencesBackup,
  EncryptedSyncSettingsBackup,
  SyncProviderKind,
  SyncSettingsBackup,
} from '@/platform/types';

export type { AppPreferencesBackup, SyncProviderKind, SyncSettingsBackup, EncryptedSyncSettingsBackup };

/** 备份包结构版本；历史包可能是任意旧版本，迁移链逐级升级到 CURRENT_PAYLOAD_VERSION */
export type PayloadVersion = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface ImportExportPayload {
  version?: PayloadVersion;
  groups: Group[];
  chords: Chord[];
  songs: Song[];
  /** 同步配置：判别联合（kind）+ 可选加密凭据块 */
  syncSettings?: EncryptedSyncSettingsBackup;
  preferences?: AppPreferencesBackup;
  /** 上传至云端时的数据校验和（MD5，覆盖不含本字段的其余载荷内容），供启动时与本地比对判定是否一致 */
  dataMd5?: string;
  /** 上传时载荷内实体的最新修改时间戳（max updatedAt），供启动比对时判断「本地/云端」哪边更新 */
  dataUpdatedAt?: number;
}

/** 备份内容勾选项：和弦（含分组）/ 乐谱 / 同步配置 / 偏好设置 */
export interface BackupSelection {
  chords: boolean;
  songs: boolean;
  syncSettings: boolean;
  preferences: boolean;
}
