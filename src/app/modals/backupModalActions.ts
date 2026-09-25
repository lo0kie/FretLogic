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
import { toRef } from 'vue';

import { describeSecretDecryptFailure } from '@/app/services/backup/backupCrypto';
import { useImportExportService } from '@/app/services/backup/useImportExportService';
import { runBusyAction } from '@/platform/composables/runBusyAction';
import { useUiStore } from '@/platform/store/uiStore';
import { logger } from '@/platform/utils/logger';

import { close, modalData, openImportWithPayload } from './useBackupModals';

// 本模块是懒加载实现（仅由 useBackupModals 动态 import），求值必然晚于 app.use(pinia)，
// 故服务与 store 引用在模块加载时取一次即可复用（同 textTransferActions.ts 写法）：
// 三个确认动作各自 useImportExportService()/useUiStore() 属于每次调用重复解析同一份引用。
const ioService = useImportExportService();
const uiStore = useUiStore();

/** 文件选择入口：解析成功后打开导入勾选面板（失败已 message，静默返回）。
 *  与拆分前的差异仅在 isParsing 置位/复位与 resetInput 仍由状态壳负责（保持按钮加载态同步）。 */
export const parseBackupFileAndOpen = async (file: File): Promise<void> => {
  try {
    const payload = await ioService.parseBackupFile(file);
    openImportWithPayload(payload, file.name);
  } catch {
    // 解析失败：parseBackupFile 内已 message，无需额外处理
  }
};

/** 确认导出：成功才关闭弹窗，失败保持打开让用户调整勾选/密码；busy 置位防 PBKDF2 await 窗口内重复点击 */
export const handleExportConfirm = async (): Promise<void> => {
  // run 的返回值即「是否导出成功」；重入守卫退出与失败都归为 null/false → 不关闭弹窗
  const ok = await runBusyAction({
    busy: toRef(modalData, 'exportBusy'),
    onError: err => {
      logger.error('backup', '导出失败', err);
      uiStore.message.error('导出失败，请重试');
    },
    run: async () => ioService.triggerFullExport(modalData.exportSelection, modalData.exportPassphrase),
  });
  if (!ok) return;
  close('export');
};

/** 确认导入：按勾选把备份包覆盖写入本地；含加密凭据块时先解密还原；busy 置位防重复触发（O7） */
export const handleImportConfirm = async (): Promise<void> => {
  const payload = modalData.parsedPayload;
  if (!payload) {
    uiStore.message.error('备份包未就绪，请重新选择文件');
    close('import');
    return;
  }
  // run 返回 false = 中途退出（缺密码 / 解密失败），弹窗保持打开供重试且不提示成功
  const applied = await runBusyAction({
    busy: toRef(modalData, 'importBusy'),
    onError: err => {
      logger.error('backup', '导入失败', err);
      uiStore.message.error('导入失败，请重试');
    },
    run: async () => {
      // 勾选先取**快照**：下面是 await 窗口（PBKDF2 解密，可长达数百毫秒），而弹窗的勾选面板
      // 在这段时间里仍可交互。若门禁判定与末尾的 applyImportSelection 各自现读
      // modalData.importSelection，两者就会落在不同版本的勾选上——典型后果是窗口内新勾上
      // 「同步配置」后，写入带着 syncSettings 却跳过了这里的解密校验（包内凭据仍是密文，
      // 用户拿到一个「看起来已导入、实际同步配置全是密文」的状态）。
      const selection = { ...modalData.importSelection };
      // 勾选同步配置且包内凭据已加密：必须提供密码并解密成功才应用
      if (selection.syncSettings && payload.syncSettings?.secrets) {
        if (!modalData.importPassphrase) {
          modalData.secretDecryptFailed = true;
          uiStore.message.warning('该备份的凭据已加密，请输入导出时设置的密码');
          return false;
        }
        try {
          await ioService.revealEncryptedSyncSettings(payload.syncSettings, modalData.importPassphrase);
        } catch (err) {
          // 密码错误 / 密文损坏：保持弹窗打开供重试，不清空已输入密码
          // 文案（不区分两种失败，避免探测信息）与 warn 留痕统一由 describeSecretDecryptFailure 负责
          modalData.secretDecryptFailed = true;
          uiStore.message.error(describeSecretDecryptFailure(err));
          return false;
        }
      }
      ioService.applyImportSelection(payload, selection);
      return true;
    },
  });
  if (!applied) return;
  close('import');
  uiStore.message.success('已导入所选数据并覆盖本地');
};
