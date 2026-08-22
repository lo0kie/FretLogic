<template>
  <div class="sync-panel-card">
    <div class="panel-header">
      <h3 class="panel-title">云端同步</h3>

      <BaseBadge
        :variant="isDevEnv ? 'warning' : 'success'"
        appearance="subtle"
        size="xs"
        show-dot
        :title="`目标分支: ${settingsStore.githubBranch}`"
      >
        {{ isDevEnv ? 'DEV' : 'PROD' }}
      </BaseBadge>
    </div>

    <BaseInput
      v-model="settingsStore.githubToken"
      v-tooltip="'GitHub Token'"
      placeholder="GitHub Token (ghp_...)"
      is-password
      clearable
      autofocus
      :maxlength="100"
      show-count
    />

    <div class="grid-columns">
      <BaseInput
        v-model="settingsStore.githubOwner"
        v-tooltip="'GitHub 账号名称'"
        placeholder="Username"
        clearable
        :maxlength="39"
        show-count
      />

      <BaseInput
        v-model="settingsStore.githubRepo"
        v-tooltip="'仓库名称'"
        placeholder="Repository"
        clearable
        :maxlength="100"
        show-count
      />
    </div>

    <div class="grid-columns">
      <ActionButton
        v-tooltip="
          isPulling ? '同步中' : isPullConfigComplete ? '请先填写账号和仓库名' : '从 GitHub 下载并覆盖本地数据 GitHub'
        "
        :disabled="isPullConfigComplete || isSyncing"
        width="100%"
        :loading="isPulling"
        @click="$emit('pull-request')"
      >
        <template #prefix>
          <CloudDownload :size="13" stroke-width="2.5" />
        </template>
        拉取
      </ActionButton>

      <ActionButton
        v-tooltip="isSyncing ? '同步中' : isPushConfigComplete ? '请先填写token' : '将本地数据推送到 GitHub'"
        :disabled="isPushConfigComplete || isSyncing"
        width="100%"
        :loading="isSyncing"
        @click="$emit('push-request')"
      >
        <template #prefix>
          <CloudUpload :size="13" stroke-width="2.5" />
        </template>
        同步
      </ActionButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/ui/components/ActionButton.vue';
import BaseBadge from '@/ui/components/BaseBadge.vue';
import BaseInput from '@/ui/components/BaseInput.vue';
import { useSettingsStore } from '@/stores/settingsStore';
import { CloudDownload, CloudUpload } from '@lucide/vue';
import { computed } from 'vue';

defineProps<{
  isSyncing: boolean;
  isPulling: boolean;
}>();

defineEmits<{
  (e: 'pull-request'): void;
  (e: 'push-request'): void;
}>();

const isDevEnv = import.meta.env.DEV;
const settingsStore = useSettingsStore();

const isPullConfigComplete = computed(() => {
  return !settingsStore.githubOwner.trim() || !settingsStore.githubRepo.trim() || !settingsStore.githubPath.trim();
});

const isPushConfigComplete = computed(() => {
  return isPullConfigComplete.value || !settingsStore.githubToken.trim();
});
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.sync-panel-card {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: @space-sm;
  background-color: var(--bg-panel);
  padding: @space-md;
  border-radius: @radius-lg;
  border: 1px solid var(--glass-border);
  box-sizing: border-box;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
}

.panel-title {
  font-size: @fs-xs;
  font-weight: 600;
  color: var(--text-disabled);
  margin: 0;
}

.grid-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: @space-sm;
  box-sizing: border-box;
}
</style>
