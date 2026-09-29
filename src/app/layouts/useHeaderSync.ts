import { computed, ref } from 'vue';

import { useBackupModals } from '@/app/modals/useBackupModals';
import {
  getSyncProviderLabel,
  getSyncProviderMeta,
  SYNC_PROVIDER_META,
  SYNC_PROVIDER_ORDER,
} from '@/app/services/sync/providerMeta';
import { getBuiltinAuthorTargetNotice } from '@/app/services/sync/syncTargetConfig';
import { useSyncService } from '@/app/services/sync/useSyncService';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { useUiStore } from '@/platform/store/uiStore';

import type { MenuItem } from '@/platform/ui/menu/types';

/**
 * 顶栏的**云端同步接线**：菜单项、两个确认弹窗、同步设置弹窗的入口。
 *
 * 两条不变量（改动本文件前先读这两条）：
 * 1. **凭据预检先于确认流程**（见 handleSyncMenuClick）：缺 Token 时不进确认、不发请求，直接给「去配置」。
 * 2. **同步目标的收窄用 `find` 而非 `as` 断言**：非法值直接忽略，不会静默写坏 `syncTarget`。
 */
export function useHeaderSync() {
  const uiStore = useUiStore();
  const settingsStore = useSettingsStore();
  const { triggerGlobalSync, pullFromRemote, resolvePushCredentialIssue, isSyncing, isPulling } = useSyncService();
  const backupModals = useBackupModals();

  const isSyncConfirmOpen = ref(false);
  const isPullConfirmOpen = ref(false);
  const isSyncModalOpen = ref(false);

  const currentSchemeName = computed(() => getSyncProviderLabel(settingsStore.syncTarget));

  /**
   * 拉取确认里的数据归属提示：目标仍是出厂默认的 gitee + 作者仓库时非空。
   * 与首访引导、同步设置弹窗共用同一判据——否则用户会把作者示例数据当成自己的基线拉进来。
   */
  const pullAuthorNotice = computed(() => getBuiltinAuthorTargetNotice());

  /** 用户确认上传：执行全局同步，成功后关闭确认弹窗 */
  const handleConfirmSync = async () => {
    const ok = await triggerGlobalSync();
    if (ok) isSyncConfirmOpen.value = false;
  };

  /** 用户确认拉取：拉取成功后关闭弹窗，并携带云端数据进入导入面板供勾选应用 */
  const handleConfirmPull = async () => {
    const payload = await pullFromRemote();
    isPullConfirmOpen.value = false;
    if (payload) backupModals.openImportWithPayload(payload, '云端同步数据');
  };

  /** 打开同步设置弹窗，并把弹窗内的方案选择器对齐到当前同步目标（保证看到的就是缺 Token 的那一项） */
  const openSyncSettings = () => {
    uiStore.syncModalProvider = settingsStore.syncTarget;
    isSyncModalOpen.value = true;
  };

  /** 菜单「同步」入口的凭据预检：缺失时不进入确认流程、不发起请求，
   *  改为提示并提供「去配置」入口直接打开对应目标的同步设置弹窗 */
  const handleSyncMenuClick = () => {
    const issue = resolvePushCredentialIssue();
    if (issue) {
      // 通知而非常驻 Message：「去配置」入口随 toast 飘走就没了，用户得记住自己去顶栏找设置
      uiStore.notice.warning({
        title: issue,
        actionText: '去配置',
        onAction: () => void openSyncSettings(),
      });
      return;
    }
    isSyncConfirmOpen.value = true;
  };

  const syncMenuItems = computed<MenuItem[]>(() => [
    {
      label: isSyncing.value ? '推送中...' : '推送到云端',
      icon: 'refresh-cw',
      disabled: isSyncing.value || isPulling.value,
      action: handleSyncMenuClick,
    },
    {
      label: isPulling.value ? '拉取中...' : '从云端拉取',
      icon: 'cloud-download',
      disabled: isSyncing.value || isPulling.value,
      action: () => {
        isPullConfirmOpen.value = true;
      },
    },
    {
      label: '同步目标',
      icon: getSyncProviderMeta(settingsStore.syncTarget).icon,
      // 子菜单是单选组：勾选态与点击由本层的 model / onPick 派生，子项只描述 label/icon/value。
      // 收窄用 find 而非 as 断言 —— 非法值直接忽略，不会静默写坏 syncTarget
      model: settingsStore.syncTarget,
      onPick: value => {
        const kind = SYNC_PROVIDER_ORDER.find(k => k === value);
        if (kind !== undefined) settingsStore.syncTarget = kind;
      },
      children: SYNC_PROVIDER_ORDER.map(kind => ({
        label: SYNC_PROVIDER_META[kind].label,
        icon: SYNC_PROVIDER_META[kind].icon,
        value: kind,
        keepOpen: true,
      })),
    },
    // 同步设置入口放在一级：「同步目标」子菜单只负责切换「推送 / 拉取」使用的云端方案，
    // 真正填写凭据的弹窗不该再藏进子菜单里多绕一层
    {
      label: '同步设置',
      icon: 'settings',
      divided: true,
      // 走 openSyncSettings 而非直接置位：弹窗内的方案选择器需对齐当前同步目标，
      // 保证看到的就是缺凭据的那一项
      action: openSyncSettings,
    },
  ]);

  return {
    isSyncConfirmOpen,
    isPullConfirmOpen,
    isSyncModalOpen,
    isSyncing,
    isPulling,
    currentSchemeName,
    pullAuthorNotice,
    handleConfirmSync,
    handleConfirmPull,
    openSyncSettings,
    handleSyncMenuClick,
    syncMenuItems,
  };
}
