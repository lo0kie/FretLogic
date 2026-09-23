<template>
  <BaseModal
    v-model:visible="isOpen"
    :close-locked="isPulling"
    :confirm-loading="isPulling"
    @confirm="handleConfirmPull()"
    cancel-text="暂不拉取"
    confirm-text="拉取数据"
    title="从线上拉取数据"
  >
    <p class="m-0 py-xs text-sm/relaxed text-fg-body">
      首次使用，是否从
      <strong class="text-fg-title">{{ schemeName }}</strong>
      拉取云端数据？
    </p>
    <p v-if="authorNotice" class="m-0 py-xs text-xs/relaxed text-fg-muted">{{ authorNotice }}</p>
  </BaseModal>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import BaseModal from '@/platform/ui/modal/BaseModal.vue';
import { useBackupModals } from '@/app/modals/useBackupModals';
import { getSyncProviderLabel } from '@/app/services/sync/providerMeta';
import { getBuiltinAuthorTargetNotice, isSyncConfigured } from '@/app/services/sync/syncTargetConfig';
import { preloadSyncActions, useSyncService } from '@/app/services/sync/useSyncService';
import { useStorage } from '@/platform/composables/useStorage';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { STORAGE_KEYS } from '@/platform/utils/constants';
import { prefetch } from '@/platform/utils/prefetch';

/**
 * 首次打开引导：仅当本次是「第一次打开」时弹出一次，询问是否从线上拉取备份数据。
 * 判据是持久化标记 STORAGE_KEYS.HAS_VISITED（false=首次）；弹出即置 true，
 * 因此无论用户选择拉取、暂不拉取还是直接关闭页面，后续访问都不再弹出。
 */
const hasVisited = useStorage<boolean>(STORAGE_KEYS.HAS_VISITED, false);

const settingsStore = useSettingsStore();
const backupModals = useBackupModals();
const { pullFromRemote, isPulling } = useSyncService();
// 挂载即预取同步动作 chunk，用户点「拉取」时 busy 立即翻转（消除 chunk 拉取死区）；
// 经 prefetch 吞掉失败，避免弱网下产生未处理 rejection
onMounted(() => prefetch(preloadSyncActions, 'FirstRunPullModal'));

/** 同步方案展示名（首访时 syncTarget 为默认值 gitee，见 GITEE_SYNC_CONFIG 预设） */
const schemeName = computed(() => getSyncProviderLabel(settingsStore.syncTarget));

/**
 * 数据归属提示：首访时 syncTarget 就是出厂默认的 gitee + 作者仓库，故用户点「拉取数据」拿到的
 * 是**项目作者的示例数据**。这里必须与启动检测、顶栏菜单、同步设置弹窗共用同一判据与文案，
 * 否则用户会把示例数据当成自己的基线。
 */
const authorNotice = computed(() => getBuiltinAuthorTargetNotice());

const isFirstVisit = !hasVisited.value;
// 未配置的目标（当前只有「WebDAV 未填地址」这一种）不弹拉取引导，与启动检测同一门槛
const isOpen = ref(isFirstVisit && isSyncConfigured());

// 首访先落标记再展示：用户即便不看弹窗直接刷新，也不会反复被拦截
if (isFirstVisit) hasVisited.value = true;

/** 用户确认拉取：按当前同步方案（首访默认 gitee）拉取云端数据，成功后进入导入面板供勾选应用 */
const handleConfirmPull = async () => {
  const payload = await pullFromRemote();
  isOpen.value = false;
  if (payload) backupModals.openImportWithPayload(payload, '云端同步数据');
};
</script>
