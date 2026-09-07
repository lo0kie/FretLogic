import { computed } from 'vue';

import { FULL_BACKUP_SELECTION, useImportExportService } from '@/app/services/backup/useImportExportService';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { useSongStore } from '@/domains/score/library/store/songStore';
import { useUiStore } from '@/platform/store/uiStore';
import { useModalController } from '@/platform/store/useModalController';

import type { BackupSelection } from '@/app/services/backup/useImportExportService';
import type { ImportExportPayload } from '@/app/types';

/** 备份导入/导出弹窗的模块级共享状态：保证任意组件取用的都是同一份开关与导入数据 */
const { modals, modalData, open, close } = useModalController(
  { export: false, import: false },
  {
    // 出于凭据安全考量，导出默认不勾选同步配置，需用户知情后主动勾选
    exportSelection: { ...FULL_BACKUP_SELECTION, syncSettings: false } as BackupSelection,
    importSelection: { ...FULL_BACKUP_SELECTION } as BackupSelection,
    /** 解析成功的备份包（导入确认时应用） */
    parsedPayload: null as ImportExportPayload | null,
    fileName: '',
    isParsing: false,
  }
);

/**
 * 备份导入/导出弹窗状态：
 * - 导出：勾选要写进备份包的数据类别（和弦/乐谱/同步配置/偏好设置）
 * - 导入：文件解析成功后展示包内实际包含的数据类别，勾选要应用的部分
 */
export function useBackupModals() {
  const ioService = useImportExportService();
  const uiStore = useUiStore();
  const chordStore = useChordStore();
  const songStore = useSongStore();

  /** 当前本地数据规模（导出面板展示） */
  const exportStats = computed(() => ({
    groupCount: chordStore.groups.length,
    chordCount: chordStore.savedChordsList.length,
    songCount: songStore.songs.length,
  }));

  /** 导出面板各数据类别的本地可用性（本地无该类数据时禁用该行） */
  const exportAvailability = computed(() => ({
    chords: chordStore.groups.length > 0 || chordStore.savedChordsList.length > 0,
    songs: songStore.songs.length > 0,
    syncSettings: true,
    preferences: true,
  }));

  /** 备份包内各数据类别的实际可用性（导入面板据此禁用无效勾选） */
  const importAvailability = computed(() => {
    const p = modalData.parsedPayload;
    if (!p) return { chords: false, songs: false, syncSettings: false, preferences: false };
    return {
      chords: (p.groups?.length ?? 0) > 0 || (p.chords?.length ?? 0) > 0,
      songs: (p.songs?.length ?? 0) > 0,
      syncSettings: p.syncSettings !== undefined,
      preferences: p.preferences !== undefined,
    };
  });

  /** 备份包内各类数据的规模明细（导入面板 help 提示展示） */
  const importStats = computed(() => {
    const p = modalData.parsedPayload;
    if (!p) return null;
    return {
      groupCount: p.groups?.length ?? 0,
      chordCount: p.chords?.length ?? 0,
      songCount: p.songs?.length ?? 0,
      syncTargetLabel:
        p.syncSettings?.syncTarget === 'server'
          ? '线上服务器'
          : p.syncSettings?.syncTarget === 'webdav'
            ? 'WebDAV'
            : p.syncSettings?.syncTarget === 'gitee'
              ? 'Gitee'
              : 'GitHub',
    };
  });

  /** 判断勾选项中是否有任一类别被选中 */
  const hasSelection = (sel: BackupSelection) => sel.chords || sel.songs || sel.syncSettings || sel.preferences;
  const hasExportSelection = computed(() => hasSelection(modalData.exportSelection));
  const hasImportSelection = computed(() => hasSelection(modalData.importSelection));

  /** 全选状态：可用类别全部勾选（供全选按钮高亮与 toggle 判断） */
  const isAllSelected = (sel: BackupSelection, availability: BackupSelection) =>
    (sel.chords || !availability.chords) &&
    (sel.songs || !availability.songs) &&
    (sel.syncSettings || !availability.syncSettings) &&
    (sel.preferences || !availability.preferences);
  const isExportAll = computed(() => isAllSelected(modalData.exportSelection, exportAvailability.value));
  const isImportAll = computed(() => isAllSelected(modalData.importSelection, importAvailability.value));
  const isExportIndeterminate = computed(() => hasExportSelection.value && !isExportAll.value);
  const isImportIndeterminate = computed(() => hasImportSelection.value && !isImportAll.value);

  /** 全选按钮 toggle：全选状态下点击切换为全不选，否则勾选全部可用类别 */
  const toggleSelection = (selection: BackupSelection, availability: BackupSelection): BackupSelection => {
    if (isAllSelected(selection, availability)) {
      return { chords: false, songs: false, syncSettings: false, preferences: false };
    }
    return { ...availability };
  };

  /** 打开导出弹窗，默认勾选本地可用类别（敏感凭据 syncSettings 默认不勾选） */
  const openExport = () => {
    // 默认勾选全部本地可用的业务类别；出于安全考量，含凭据的同步配置默认不勾选，需用户显式选择
    open('export', {
      exportSelection: {
        ...exportAvailability.value,
        syncSettings: false,
      },
    });
  };

  /** header-extra 全选：导出面板在全部可用类别间切换 */
  const handleExportSelectAll = () => {
    modalData.exportSelection = toggleSelection(modalData.exportSelection, exportAvailability.value);
  };

  /** header-extra 全选：导入面板在备份包实际包含的类别间切换 */
  const handleImportSelectAll = () => {
    modalData.importSelection = toggleSelection(modalData.importSelection, importAvailability.value);
  };

  /** 直接以载荷打开导入勾选面板（用于云端拉取、扫描等非文件流入口） */
  const openImportWithPayload = (payload: ImportExportPayload, fileName = '云端同步数据') => {
    const availability = importAvailability.value;
    open('import', {
      parsedPayload: payload,
      fileName,
      importSelection: {
        chords: availability.chords,
        songs: availability.songs,
        syncSettings: availability.syncSettings,
        preferences: availability.preferences,
      },
    });
  };

  /** 文件选择入口：解析成功后打开导入勾选面板（失败已 toast，静默返回） */
  const handleFileChange = async (file: File, resetInput: () => void) => {
    modalData.isParsing = true;
    try {
      const payload = await ioService.parseBackupFile(file);
      openImportWithPayload(payload, file.name);
    } catch {
      // 解析失败：parseBackupFile 内已 toast，无需额外处理
    } finally {
      modalData.isParsing = false;
      resetInput();
    }
  };

  /** 确认导出：成功才关闭弹窗，失败保持打开让用户调整勾选 */
  const handleExportConfirm = () => {
    // 导出失败（数据损坏/无可导出内容）时保持弹窗打开，让用户调整勾选
    if (!ioService.triggerFullExport(modalData.exportSelection)) return;
    close('export');
  };

  /** 确认导入：按勾选把备份包覆盖写入本地 */
  const handleImportConfirm = () => {
    const payload = modalData.parsedPayload;
    if (!payload) {
      uiStore.toast.error('备份包未就绪，请重新选择文件');
      close('import');
      return;
    }
    ioService.applyImportSelection(payload, modalData.importSelection);
    close('import');
    uiStore.toast.success('已导入所选数据并覆盖本地');
  };

  return {
    modals,
    modalData,
    exportStats,
    exportAvailability,
    importAvailability,
    importStats,
    hasExportSelection,
    hasImportSelection,
    isExportAll,
    isImportAll,
    isExportIndeterminate,
    isImportIndeterminate,
    openExport,
    openImportWithPayload,
    handleExportSelectAll,
    handleImportSelectAll,
    handleFileChange,
    handleExportConfirm,
    handleImportConfirm,
  };
}
