<template>
  <BaseModal
    v-model:visible="isSyncModalOpen"
    title="云端同步设置"
    :show-footer="false"
    width="w-80"
    :close-on-mask="!isSyncing && !isPulling"
  >
    <SyncSettingsCard
      :is-syncing="isSyncing"
      :is-pulling="isPulling"
      @pull-request="handlePullClick"
      @push-request="triggerGlobalSync"
    />
  </BaseModal>
</template>

<script setup lang="ts">
import BaseModal from '@/components/BaseModal.vue';
import { useGithubSyncService } from '@/services/useGithubSyncService';
import SyncSettingsCard from './SyncSettingsCard.vue';

const isSyncModalOpen = defineModel<boolean>('isSyncModalOpen', { required: true });

const { triggerGlobalSync, pullFromGithub, isSyncing, isPulling } = useGithubSyncService();

const handlePullClick = async () => {
  await pullFromGithub();

  isSyncModalOpen.value = false;
};
</script>
