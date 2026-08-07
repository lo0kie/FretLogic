<template>
  <BaseModal v-model:visible="isSyncModalOpen" title="云端同步设置" :show-footer="false" width="w-80">
    <SyncSettingsCard
      :is-syncing="isSyncing"
      :is-pulling="isPulling"
      @pull-request="handlePullClick"
      @push-request="triggerGlobalSync"
    />
  </BaseModal>

  <SyncMergeModal v-model:visible="isMergeModalOpen" :pending-cloud-data="pendingCloudData" />
</template>

<script setup lang="ts">
import BaseModal from '@/components/BaseModal.vue';
import { useGithubSyncService } from '@/services/useGithubSyncService';
import type { ImportExportPayload } from '@/types';
import { ref } from 'vue';
import SyncMergeModal from './SyncMergeModal.vue';
import SyncSettingsCard from './SyncSettingsCard.vue';

const isSyncModalOpen = defineModel<boolean>('isSyncModalOpen', { required: true });
const isMergeModalOpen = ref(false);
const pendingCloudData = ref<ImportExportPayload | null>(null);

const { triggerGlobalSync, pullFromGithub, isSyncing, isPulling } = useGithubSyncService();

const handlePullClick = async () => {
  const result = await pullFromGithub();
  isSyncModalOpen.value = false;
  if (result.hasDifferences && result.cloudData) {
    pendingCloudData.value = result.cloudData;
    isMergeModalOpen.value = true;
  }
};
</script>
