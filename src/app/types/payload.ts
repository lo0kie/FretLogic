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
  /**
   * 历史字段：早期上传把 MD5 校验和内嵌进载荷。现上传路径改写入独立 meta 载体
   *（github/gitee/webdav 的 `.meta.json`、server 的 query + `/meta`），客户端不再写这两个字段；
   * 保留仅为兼容历史云端包，校验层会把包里已有的值原样透传（比对逻辑本身读 meta，不读这里）。
   */
  dataMd5?: string;
  /** 历史字段，语义同 dataMd5：早期内嵌的「载荷内实体最新修改时间戳」，现由 meta.updatedAt 承担 */
  dataUpdatedAt?: number;
}

/** 备份内容勾选项：和弦（含分组）/ 乐谱 / 同步配置 / 偏好设置 */
export interface BackupSelection {
  chords: boolean;
  songs: boolean;
  syncSettings: boolean;
  preferences: boolean;
}
