/**
 * 备份导入/导出弹窗的**确认动作实现**（懒加载模块，由 useBackupModals 状态壳动态 import）：
 * - 文件解析并打开导入勾选面板（useImportExportService.parseBackupFile）
 * - 确认导出（triggerFullExport：载荷构建/清洗/加密/下载）
 * - 确认导入（按勾选覆盖写入本地 + 加密凭据解密还原）
 *
 * 独立成模块的原因：useImportExportService 整条链（buildBackupPayload、backupCrypto 等）
 * 只在用户实际确认导入/导出时才需要，静态挂在弹窗状态壳上会把链条拖进首屏闭包。
 * 弹窗状态（modals/modalData）与打开动作仍由 useBackupModals 提供（只读 store，零重依赖）。
 */
import { useImportExportService } from '@/app/services/backup/useImportExportService';
import { useUiStore } from '@/platform/store/uiStore';

import { close, modalData, openImportWithPayload } from './useBackupModals';

/** 文件选择入口：解析成功后打开导入勾选面板（失败已 toast，静默返回）。
 *  与拆分前的差异仅在 isParsing 置位/复位与 resetInput 仍由状态壳负责（保持按钮加载态同步）。 */
export const parseBackupFileAndOpen = async (file: File): Promise<void> => {
  try {
    const payload = await useImportExportService().parseBackupFile(file);
    openImportWithPayload(payload, file.name);
  } catch {
    // 解析失败：parseBackupFile 内已 toast，无需额外处理
  }
};

/** 确认导出：成功才关闭弹窗，失败保持打开让用户调整勾选/密码 */
export const handleExportConfirm = async (): Promise<void> => {
  const ioService = useImportExportService();
  const uiStore = useUiStore();
  try {
    // 导出失败（数据损坏/无可导出内容/加密失败）时保持弹窗打开，让用户调整
    const ok = await ioService.triggerFullExport(modalData.exportSelection, modalData.exportPassphrase);
    if (!ok) return;
    close('export');
  } catch (err) {
    console.error('导出失败:', err);
    uiStore.toast.error('导出失败，请重试');
  }
};

/** 确认导入：按勾选把备份包覆盖写入本地；含加密凭据块时先解密还原 */
export const handleImportConfirm = async (): Promise<void> => {
  const ioService = useImportExportService();
  const uiStore = useUiStore();
  const payload = modalData.parsedPayload;
  if (!payload) {
    uiStore.toast.error('备份包未就绪，请重新选择文件');
    close('import');
    return;
  }
  // 勾选同步配置且包内凭据已加密：必须提供密码并解密成功才应用
  if (modalData.importSelection.syncSettings && payload.syncSettings?.secrets) {
    if (!modalData.importPassphrase) {
      modalData.secretDecryptFailed = true;
      uiStore.toast.warning('该备份的凭据已加密，请输入导出时设置的密码');
      return;
    }
    try {
      await ioService.revealEncryptedSyncSettings(payload.syncSettings, modalData.importPassphrase);
    } catch {
      // 密码错误 / 密文损坏：保持弹窗打开供重试，不清空已输入密码
      modalData.secretDecryptFailed = true;
      uiStore.toast.error('凭据解密失败：导出密码错误或备份已损坏');
      return;
    }
  }
  ioService.applyImportSelection(payload, modalData.importSelection);
  close('import');
  uiStore.toast.success('已导入所选数据并覆盖本地');
};
