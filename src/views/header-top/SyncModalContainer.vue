<template>
  <!-- 1. 云端同步设置 Modal -->
  <BaseModal
    :visible="isSyncModalOpen"
    @update:visible="val => emit('update:isSyncModalOpen', val)"
    title="云端同步设置"
    :show-footer="false"
    width="w-80"
  >
    <SyncSettingsCard
      :is-syncing="isSyncing"
      :is-pulling="isPulling"
      @pull-request="isPullConfirmOpen = true"
      @push-request="triggerGlobalSync"
    />
  </BaseModal>

  <!-- 2. 覆盖确认 Modal -->
  <BaseModal
    v-model:visible="isPullConfirmOpen"
    title="操作确认"
    confirm-type="danger"
    confirm-text="确认覆盖"
    @confirm="confirmPull"
  >
    <p class="modal-text">从云端拉取数据将完全覆盖您本地的所有和弦与分组记录，且此操作不可撤销！确定要继续吗？</p>
  </BaseModal>
</template>

<script setup lang="ts">
import BaseModal from '@/components/BaseModal.vue';
import { useGithubSyncService } from '@/services/useGithubSyncService';
import { ref } from 'vue';
import SyncSettingsCard from './SyncSettingsCard.vue';

defineProps<{ isSyncModalOpen: boolean }>();

const emit = defineEmits<{
  (e: 'update:isSyncModalOpen', value: boolean): void;
}>();

const isPullConfirmOpen = ref(false);
const { triggerGlobalSync, pullFromGithub, isSyncing, isPulling } = useGithubSyncService();

const confirmPull = () => {
  pullFromGithub();
  isPullConfirmOpen.value = false;
  emit('update:isSyncModalOpen', false);
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
