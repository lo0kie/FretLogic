import type { useBackupModals } from '@/app/modals/useBackupModals';
import type { InjectionKey } from 'vue';

/**
 * 备份模态控制器注入键：provide 与 inject 两端都在 app 层（`SidebarLeft` → `BackupModalsContainer`），
 * 故键就住在 app 层。
 *
 * 此前是字符串 `'backupModals'` —— 两端各自写字面量，拼错不报错，属无保障的隐式契约。
 */
export const BACKUP_MODALS: InjectionKey<ReturnType<typeof useBackupModals>> = Symbol('backup-modals');
