import { computed, watch } from 'vue';

import { FULL_BACKUP_SELECTION } from '@/app/services/backup/backupSelection';
import { getSyncProviderLabel } from '@/app/services/sync/providerMeta';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { useSongStore } from '@/domains/score/library/store/songStore';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { useModalController } from '@/platform/store/useModalController';

import type { ImportExportPayload } from '@/app/types';
import type { BackupSelection } from '@/app/types/payload';
import type { SyncSettingsBackup } from '@/platform/types';

/** 同步目标的中文标签：按 kind 查 providerMeta 单源表；缺失/未知值显式标「未知」，不再静默误标 GitHub */
const syncTargetLabelOf = (sync?: SyncSettingsBackup): string => {
  if (!sync) return '未配置';
  const kind = 'kind' in sync ? sync.kind : (sync as { syncTarget?: string }).syncTarget;
  return getSyncProviderLabel(kind);
};

/** 备份导入/导出弹窗的模块级共享状态：保证任意组件取用的都是同一份开关与导入数据 */
const { modals, modalData, open, close } = useModalController(
  { export: false, import: false },
  {
    // 出于凭据安全考量，导入/导出两侧同步配置**都默认不勾选**，需用户知情后主动勾选：
    // 导出侧是「别把凭据带出本机」，导入侧是「别让外来包改写数据去向」——同一条准则的两面。
    exportSelection: { ...FULL_BACKUP_SELECTION, syncSettings: false } as BackupSelection,
    importSelection: { ...FULL_BACKUP_SELECTION, syncSettings: false } as BackupSelection,
    /** 解析成功的备份包（导入确认时应用） */
    parsedPayload: null as ImportExportPayload | null,
    fileName: '',
    isParsing: false,
    /** 导出密码：勾选同步配置时用于加密包内凭据（AES-GCM），导入方需输入同一密码 */
    exportPassphrase: '',
    /** 导入密码：备份包内含加密凭据块时必填，用于解密还原凭据 */
    importPassphrase: '',
    /** 凭据解密失败标记：置位后保持弹窗打开让用户重试密码 */
    secretDecryptFailed: false,
    /** 导出确认进行中：PBKDF2 派生 600k 轮的 await 窗口内挡住重复点击（O7） */
    exportBusy: false,
    /** 导入确认进行中：同上，防 applyImportSelection 交叉执行 */
    importBusy: false,
  }
);

/**
 * 备份包内各数据类别的实际可用性（**纯函数**：由载荷直接推导，不读弹窗状态）。
 *
 * 必须是纯函数而非只读 computed 的原因：openImportWithPayload 需要在 open() 写入 parsedPayload
 * **之前**就拿到可用性来初始化勾选；若从 modalData.parsedPayload 推导，此刻它仍是 null
 * （关闭时已被重置为 null），四条入口（文件流/顶栏/同步容器/首次拉取）拿到的快照恒为全 false
 * → 面板开在全不勾、确认按钮禁用，用户必须逐项手动勾。D25。
 */
const resolveImportAvailability = (p: ImportExportPayload | null): BackupSelection => {
  if (!p) return { chords: false, songs: false, syncSettings: false, preferences: false };
  return {
    chords: (p.groups?.length ?? 0) > 0 || (p.chords?.length ?? 0) > 0,
    songs: (p.songs?.length ?? 0) > 0,
    syncSettings: p.syncSettings !== undefined,
    preferences: p.preferences !== undefined,
  };
};

/** 当前解析包（modalData.parsedPayload）的可用性视图，供面板与全选逻辑消费 */
const importAvailability = computed(() => resolveImportAvailability(modalData.parsedPayload));

/**
 * 关闭导入/导出弹窗时清空勾选状态（不做保存），下次打开重新按可用项初始化。
 * 模块级 modalData 在弹窗间共享，若关闭时不清理，上次勾选会残留在内存里；
 * 归位到各自「打开时的默认值」而非保留用户操作，避免脏选择泄漏到下一次打开。
 *
 * 必须注册在模块作用域而非 composable 体内：清理的是模块级单例，守卫就得与单例同寿命。
 * 放在 `useBackupModals()` 里会随宿主组件卸载而自动停止（弹窗容器换页/重建后凭据与解析包
 * 再也清不掉），且每个调用方各注册一份重复守卫。
 */
watch(
  () => [modals.export, modals.import],
  () => {
    if (!modals.export) {
      modalData.exportSelection = { ...FULL_BACKUP_SELECTION, syncSettings: false };
      // 密码不残留：关闭即丢弃，下次导出重新输入
      modalData.exportPassphrase = '';
    }
    if (!modals.import) {
      modalData.importSelection = { ...FULL_BACKUP_SELECTION, syncSettings: false };
      modalData.parsedPayload = null;
      modalData.fileName = '';
      modalData.importPassphrase = '';
      modalData.secretDecryptFailed = false;
    }
  }
);

/** 直接以载荷打开导入勾选面板（用于云端拉取、扫描等非文件流入口）。
 *  模块级导出：懒加载实现模块（backupModalActions）解析完成后经此打开面板。 */
export const openImportWithPayload = (payload: ImportExportPayload, fileName = '云端同步数据') => {
  // 由入参载荷推导，不能读 importAvailability——此刻 parsedPayload 尚未写入（见上方注释）
  const availability = resolveImportAvailability(payload);
  open('import', {
    parsedPayload: payload,
    fileName,
    importSelection: {
      // 业务数据默认按包内实际包含项勾选
      chords: availability.chords,
      songs: availability.songs,
      // 同步配置**默认不勾选**：它是唯一一项「应用后会改变数据去向」的设置，且包内字段只经
      // 结构清洗（协议/主机是否可信无法从字符串判定——`https://任意主机/` 本身就合法），
      // 无法用校验区分「用户自己的备份」与「被别人构造的包」。故与导出侧（见下方注释：
      // 含凭据时默认不勾选）保持同一条准则：涉及凭据/去向的设置一律需用户显式知情勾选。
      // 勾选框仍可用（见 BackupModalsContainer 的 :disabled="!importAvailability.syncSettings"），
      // 恢复自有备份时手动勾上即可。
      syncSettings: false,
      preferences: availability.preferences,
    },
  });
};

/** 供懒加载实现模块（backupModalActions）读写共享弹窗状态与关闭弹窗 */
export { close, modalData };

/**
 * 备份导入/导出弹窗状态：
 * - 导出：勾选要写进备份包的数据类别（和弦/乐谱/同步配置/偏好设置）
 * - 导入：文件解析成功后展示包内实际包含的数据类别，勾选要应用的部分
 *
 * 状态壳：开关/勾选/统计等响应式状态只读 store，留在本模块；
 * 涉及 useImportExportService 的三个确认动作（文件解析/导出/导入）移入 backupModalActions.ts
 * 动态 import，避免把备份载荷与加密链路拖进首屏闭包。
 */
export function useBackupModals() {
  const chordStore = useChordStore();
  const songStore = useSongStore();
  const settingsStore = useSettingsStore();

  /** 当前是否存在非空凭据（Token / 密码）：决定导出面板的加密密码行显隐 */
  const hasCredentials = computed(() =>
    [settingsStore.githubToken, settingsStore.giteeToken, settingsStore.webdavPassword, settingsStore.serverToken].some(
      v => typeof v === 'string' && v.trim().length > 0
    )
  );

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

  /** 备份包内各类数据的规模明细（导入面板 help 提示展示） */
  const importStats = computed(() => {
    const p = modalData.parsedPayload;
    if (!p) return null;
    return {
      groupCount: p.groups?.length ?? 0,
      chordCount: p.chords?.length ?? 0,
      songCount: p.songs?.length ?? 0,
      syncTargetLabel: syncTargetLabelOf(p.syncSettings),
    };
  });

  /** 判断勾选项中是否有任一类别被选中 */
  const hasSelection = (sel: BackupSelection) => sel.chords || sel.songs || sel.syncSettings || sel.preferences;
  const hasExportSelection = computed(() => hasSelection(modalData.exportSelection));
  const hasImportSelection = computed(() => hasSelection(modalData.importSelection));

  /** 导入包是否携带加密凭据块（决定导入面板是否需要密码输入行） */
  const hasEncryptedSecrets = computed(() => modalData.parsedPayload?.syncSettings?.secrets !== undefined);
  /** 导出确认是否可点：勾选同步配置时必须已填写导出密码（O7 与服务侧判据对齐：
   *  服务侧对 selection.syncSettings 一律要求密码，不再看 hasCredentials 内存态） */
  const isExportConfirmReady = computed(
    () => hasExportSelection.value && (!modalData.exportSelection.syncSettings || modalData.exportPassphrase.length > 0)
  );

  /** 全选状态：业务类别全部勾选即视为全选（含凭据的 syncSettings 不参与判定——它必须显式勾选） */
  const isAllSelected = (sel: BackupSelection, availability: BackupSelection) =>
    (sel.chords || !availability.chords) &&
    (sel.songs || !availability.songs) &&
    (sel.preferences || !availability.preferences);
  const isExportAll = computed(() => isAllSelected(modalData.exportSelection, exportAvailability.value));
  const isImportAll = computed(() => isAllSelected(modalData.importSelection, importAvailability.value));
  const isExportIndeterminate = computed(() => hasExportSelection.value && !isExportAll.value);
  const isImportIndeterminate = computed(() => hasImportSelection.value && !isImportAll.value);

  /** 全选按钮 toggle：全选状态下点击切换为全不选，否则勾选全部可用类别 */
  const toggleSelection = (selection: BackupSelection, availability: BackupSelection): BackupSelection => {
    if (isAllSelected(selection, availability))
      return { chords: false, songs: false, syncSettings: false, preferences: false };

    // 全选不代勾含凭据的同步配置：知情门禁要求用户显式勾选（与 openExport 默认值一致）
    return { ...availability, syncSettings: false };
  };

  /** 打开导出弹窗，默认勾选本地可用类别（敏感凭据 syncSettings 默认不勾选） */
  const openExport = () =>
    // 默认勾选全部本地可用的业务类别；出于安全考量，含凭据的同步配置默认不勾选，需用户显式选择
    void open('export', {
      exportSelection: {
        ...exportAvailability.value,
        syncSettings: false,
      },
    });

  /** header-extra 全选：导出面板在全部可用类别间切换 */
  const handleExportSelectAll = () => {
    modalData.exportSelection = toggleSelection(modalData.exportSelection, exportAvailability.value);
  };

  /** header-extra 全选：导入面板在备份包实际包含的类别间切换 */
  const handleImportSelectAll = () => {
    modalData.importSelection = toggleSelection(modalData.importSelection, importAvailability.value);
  };

  /** 文件选择入口：解析成功后打开导入勾选面板（失败已 message，静默返回）。
   *  isParsing 加载态与输入框复位留在壳层（与触发按钮同步），解析实现懒加载。 */
  const handleFileChange = async (file: File, resetInput: () => void) => {
    modalData.isParsing = true;
    try {
      const { parseBackupFileAndOpen } = await import('./backupModalActions');
      await parseBackupFileAndOpen(file);
    } finally {
      modalData.isParsing = false;
      resetInput();
    }
  };

  /** 确认导出：实现懒加载（triggerFullExport 含载荷构建/加密/下载整条链） */
  const handleExportConfirm = async () => void (await (await import('./backupModalActions')).handleExportConfirm());

  /** 确认导入：实现懒加载（按勾选覆盖写入 + 加密凭据解密） */
  const handleImportConfirm = async () => void (await (await import('./backupModalActions')).handleImportConfirm());

  /** 预取备份动作实现模块（只拉取不执行）：弹窗容器挂载时调用，消除确认按钮的 chunk 拉取死区 */
  const preloadBackupActions = (): Promise<unknown> => import('./backupModalActions');

  return {
    modals,
    modalData,
    preloadBackupActions,
    exportStats,
    exportAvailability,
    importAvailability,
    importStats,
    hasCredentials,
    hasEncryptedSecrets,
    isExportConfirmReady,
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
