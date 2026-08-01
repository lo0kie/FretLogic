<template>
  <div class="sync-panel-card">
    <div class="panel-header">
      <h3 class="panel-title">云端同步</h3>

      <div class="env-badge" :title="`目标分支: ${settingsStore.githubBranch}`">
        <span class="status-dot" :class="{ 'is-dev': isDevEnv }"></span>
        <span class="env-text" :class="{ 'is-dev': isDevEnv }">
          {{ isDevEnv ? 'DEV' : 'PROD' }}
        </span>
      </div>
    </div>

    <GlobalTooltip content="GitHub Token" placement="top" class="full-width-tooltip">
      <BaseInput
        v-model="settingsStore.githubToken"
        placeholder="GitHub Token (ghp_...)"
        is-password
        clearable
        autofocus
        fontSize="xs"
      />
    </GlobalTooltip>

    <div class="grid-columns">
      <GlobalTooltip content="GitHub 账号名称" placement="top" class="full-width-tooltip">
        <BaseInput v-model="settingsStore.githubOwner" placeholder="Username" clearable fontSize="xs" />
      </GlobalTooltip>
      <GlobalTooltip content="仓库名称" placement="top" class="full-width-tooltip">
        <BaseInput v-model="settingsStore.githubRepo" placeholder="Repository" clearable fontSize="xs" />
      </GlobalTooltip>
    </div>

    <div class="grid-columns">
      <GlobalTooltip content="从 GitHub 下载并覆盖本地数据" placement="top">
        <ActionButton width="100%" @click="$emit('pull-request')" :loading="isPulling" size="sm">
          <template #prefix><CloudDownload :size="13" stroke-width="2.5" /></template>
          拉取
        </ActionButton>
      </GlobalTooltip>

      <GlobalTooltip content="将本地数据推送到 GitHub" placement="top">
        <ActionButton width="100%" @click="$emit('push-request')" :loading="isSyncing" size="sm">
          <template #prefix><CloudUpload :size="13" stroke-width="2.5" /></template>
          同步
        </ActionButton>
      </GlobalTooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import BaseInput from '@/components/BaseInput.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { useSettingsStore } from '@/stores/settingsStore';
import { CloudDownload, CloudUpload } from '@lucide/vue';

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
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.sync-panel-card {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  background-color: var(--bg-panel);
  padding: 0.75rem;
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
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-disabled);
  margin: 0;
}

.grid-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.4rem;
  box-sizing: border-box;
}

.full-width-tooltip {
  width: 100%;
}

.env-badge {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  box-sizing: border-box;
}

.status-dot {
  width: 0.35rem;
  height: 0.35rem;
  border-radius: 50%;
  background-color: var(--color-success);

  &.is-dev {
    background-color: var(--color-warning);
  }
}

.env-text {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--color-success);

  &.is-dev {
    color: var(--color-warning);
  }
}
</style>
