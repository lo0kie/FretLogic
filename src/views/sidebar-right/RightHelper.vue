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
      <BaseInput v-model="settingsStore.githubToken" placeholder="GitHub Token (ghp_...)" is-password clearable />
    </GlobalTooltip>

    <div class="grid-columns">
      <GlobalTooltip content="GitHub 账号名称" placement="top" class="full-width-tooltip">
        <BaseInput v-model="settingsStore.githubOwner" placeholder="Username" clearable />
      </GlobalTooltip>
      <GlobalTooltip content="仓库名称" placement="top" class="full-width-tooltip">
        <BaseInput v-model="settingsStore.githubRepo" placeholder="Repository" clearable />
      </GlobalTooltip>
    </div>

    <div class="grid-columns">
      <GlobalTooltip content="从 GitHub 下载并覆盖本地所有数据" placement="top">
        <ActionButton @click="$emit('pull-request')" :loading="isPulling" height="2rem">
          <template #prefix><CloudDownload :size="14" stroke-width="3" /></template>
          拉取
        </ActionButton>
      </GlobalTooltip>

      <GlobalTooltip content="将本地数据强制推送到 GitHub" placement="top">
        <ActionButton @click="$emit('push-request')" :loading="isSyncing" height="2rem">
          <template #prefix><CloudUpload :size="14" stroke-width="3" /></template>
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
  gap: 0.6rem;
  background-color: var(--bg-panel);
  padding: 0.75rem;
  border-radius: @radius-md;
  border: 1px solid var(--border-light);
  box-shadow: @shadow-sm;
  box-sizing: border-box;

  :deep(.theme-default) {
    :global(.dark) & {
      background-color: var(--bg-body) !important;
      border-color: var(--border-base) !important;
    }
  }
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.2rem;
  box-sizing: border-box;
}

.panel-title {
  font-size: 0.7rem;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-disabled);
  margin: 0;
}

.grid-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.6rem;
  box-sizing: border-box;
}

.full-width-tooltip {
  width: 100%;
}

.env-badge {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  box-sizing: border-box;
}

.status-dot {
  width: 0.3rem;
  height: 0.3rem;
  border-radius: 50%;
  background-color: #10b981;

  &.is-dev {
    background-color: #f59e0b;
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
}

.env-text {
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #10b981;

  &.is-dev {
    color: #f59e0b;
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
