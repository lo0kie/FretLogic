import type { Chord, Group } from '@/domains/chord/types';
import type { Song } from '@/domains/score/types';
import type {
  AppPreferencesBackup,
  EncryptedSyncSettingsBackup,
  SyncProviderKind,
  SyncSettingsBackup,
} from '@/platform/types';

export type { AppPreferencesBackup, SyncProviderKind, SyncSettingsBackup, EncryptedSyncSettingsBackup };

/** 备份包内的数据分区键：用于表达「源包里缺这个分区」与「源包里是空数组」的区别 */
export type PayloadSection = 'chords' | 'songs';

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
   * 传输标记：源包中**完全没有出现**的分区（不是空数组），由校验层清洗时写入，仅在确有缺分区时存在。
   * 消费方（云拉取覆盖）据此区分两种语义：缺分区 → 该分区不属于本包，保持本地原样；
   * 显式空数组 → 云端确实为空，按「完全覆盖」清空。
   * 历史上两者都被归一成 []，于是拉取旧版云包（无 songs 字段）会把本地乐谱整体清空。
   * 非数据字段：重新经过校验层会被重建；推送/导出的包三个分区恒在，故正常路径不会携带它。
   */
  absentSections?: PayloadSection[];
  /**
   * 历史字段：早期上传把 MD5 校验和内嵌进载荷。现上传路径改写入独立 meta 载体
   *（github/gitee/webdav 的 `.meta.json`、server 的 query + `/meta`），客户端不再写这两个字段；
   * 保留仅为兼容历史云端包，校验层会把包里已有的值原样透传（比对逻辑本身读 meta，不读这里）。
   */
  dataMd5?: string;
  /** 历史字段，语义同 dataMd5：早期内嵌的「载荷内实体最新修改时间戳」，现由 meta.updatedAt 承担 */
  dataUpdatedAt?: number;
  /**
   * 数据删除水位线：构造本包的设备上最近一次实体删除的时间戳（kv 水位线透传）。
   * meta.updatedAt = max(存活实体 updatedAt, deletedAt)——没有它，「删掉库里最新一条实体」
   * 会让 max(updatedAt) 回退到删除前的旧值，方向判定误以为「云端较新」而引导拉取、把刚删的数据拉回来。
   * 非内容字段：不计入载荷校验和（与 dataMd5 同口径）。
   */
  deletedAt?: number;
}

/** 备份内容勾选项：和弦（含分组）/ 乐谱 / 同步配置 / 偏好设置 */
export interface BackupSelection {
  chords: boolean;
  songs: boolean;
  syncSettings: boolean;
  preferences: boolean;
}
