/**
 * 备份勾选默认值（全类别选中）。
 * 独立成零依赖小模块的原因：useBackupModals 状态壳与 useSyncService 只需要这个常量，
 * 若从 useImportExportService 引入会把整个导入/导出服务（含 buildBackupPayload、加密等）
 * 拖进使用者的静态闭包。所有使用方（含测试）一律直接依赖本模块，不经服务壳层转发。
 */
import type { BackupSelection } from '@/app/types/payload';

export const FULL_BACKUP_SELECTION: BackupSelection = {
  chords: true,
  songs: true,
  syncSettings: true,
  preferences: true,
};
