<!-- src/views/header-top/SyncModalContainer.vue -->
<template>
  <!-- 1. 云端同步设置 Modal -->
  <BaseModal v-model:visible="isSyncModalOpen" title="云端同步设置" :show-footer="false" width="w-80">
    <SyncSettingsCard
      :is-syncing="isSyncing"
      :is-pulling="isPulling"
      @pull-request="handlePullClick"
      @push-request="triggerGlobalSync"
    />
  </BaseModal>

  <!-- 🌟 2. 挂载数据合并对照 Modal -->
  <SyncMergeModal />
</template>

<script setup lang="ts">
import BaseModal from '@/components/BaseModal.vue';
import { useGithubSyncService } from '@/services/useGithubSyncService';
import SyncMergeModal from './SyncMergeModal.vue'; // 🌟 引入 Modal
import SyncSettingsCard from './SyncSettingsCard.vue';

const isSyncModalOpen = defineModel<boolean>('isSyncModalOpen', { required: true });

const { triggerGlobalSync, pullFromGithub, isSyncing, isPulling } = useGithubSyncService();

const handlePullClick = () => {
  pullFromGithub();
  isSyncModalOpen.value = false;
};
</script>

<style scoped lang="less">
.modal-text {
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.6;
  color: var(--text-body);
  margin: 0;
}
</style>
