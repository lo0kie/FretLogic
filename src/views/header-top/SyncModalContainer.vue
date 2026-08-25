<template>
  <BaseModal
    v-model:visible="isSyncModalOpen"
    title="云端同步设置"
    :show-footer="false"
    width="w-80"
    :close-on-mask="!isSyncing && !isPulling && !isFetchingBranches"
  >
    <template #header-extra>
      <BaseSegmentedControl v-model="settingsStore.syncTarget" :options="providerOptions" />
    </template>

    <div class="sync-panel-card">
      <div class="panel-header">
        <h3 class="panel-title">云端同步</h3>
      </div>

      <template v-if="settingsStore.syncTarget === 'github'">
        <BaseInput
          v-model="settingsStore.githubToken"
          v-tooltip="'GitHub Token'"
          v-focus
          placeholder="GitHub Token (ghp_...)"
          is-password
          clearable
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
          <BaseSelector
            v-model="settingsStore.githubBranch"
            clearable
            placeholder="请选择或获取分支"
            :options="settingsStore.githubBranches"
            default-value=""
          />

          <ActionButton
            v-tooltip="isFetchBranchesDisabled ? '请先填写 Token、账号和仓库名' : '获取远程仓库分支列表'"
            :disabled="isFetchBranchesDisabled"
            :loading="isFetchingBranches"
            @click="handleFetchBranchesClick"
          >
            查询分支
          </ActionButton>
        </div>
      </template>

      <template v-else>
        <BaseInput
          v-model="settingsStore.webdavServerUrl"
          v-tooltip="'WebDAV 地址'"
          placeholder="WebDAV 地址"
          clearable
          :maxlength="200"
          show-count
        />

        <BaseInput
          v-model="settingsStore.webdavUsername"
          v-tooltip="'用户名'"
          placeholder="用户名"
          clearable
          :maxlength="100"
        />

        <BaseInput
          v-model="settingsStore.webdavPassword"
          v-tooltip="'密码'"
          placeholder="密码"
          is-password
          clearable
          :maxlength="100"
          show-count
        />

        <BaseInput
          v-model="settingsStore.webdavProxyUrl"
          v-tooltip="'可选：CORS 代理地址，用于绕开浏览器跨域限制'"
          placeholder="CORS 非必填"
          clearable
          :maxlength="200"
          show-count
        />

        <p class="sync-hint">
          提示：浏览器直连 WebDAV 常被跨域(CORS)拦截。可在服务器开启 CORS，或填写上方「CORS 代理」经代理转发请求。
        </p>
      </template>

      <div class="grid-columns">
        <ActionButton
          v-tooltip="isPulling ? '同步中' : isPullConfigComplete ? '请先填写配置' : '从云端下载并覆盖本地数据'"
          :disabled="isPullConfigComplete || isSyncing"
          width="100%"
          :loading="isPulling"
          @click="handlePullClick"
        >
          <template #prefix>
            <CloudDownload :size="13" stroke-width="2.5" />
          </template>
          拉取
        </ActionButton>

        <ActionButton
          v-tooltip="isSyncing ? '同步中' : isPushConfigComplete ? '请先填写配置' : '将本地数据推送到云端'"
          :disabled="isPushConfigComplete || isSyncing"
          width="100%"
          :loading="isSyncing"
          @click="handleSyncClick"
        >
          <template #prefix>
            <CloudUpload :size="13" stroke-width="2.5" />
          </template>
          同步
        </ActionButton>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import BaseInput from '@/components/BaseInput.vue';
import BaseModal from '@/components/BaseModal.vue';
import BaseSegmentedControl from '@/components/BaseSegmentedControl.vue';
import BaseSelector from '@/components/BaseSelector.vue';
import { useSyncService } from '@/composables/useSyncService';
import type { SyncProviderKind } from '@/services/sync/provider';
import { useSettingsStore } from '@/stores/settingsStore';
import { CloudDownload, CloudUpload } from '@lucide/vue';
import { computed, ref } from 'vue';

const isSyncModalOpen = defineModel<boolean>('isSyncModalOpen', { required: true });
const { triggerGlobalSync, pullFromRemote, fetchGithubBranches, isSyncing, isPulling } = useSyncService();
const settingsStore = useSettingsStore();
const isFetchingBranches = ref(false);

const handleSyncClick = async () => {
  const ok = await triggerGlobalSync();
  if (ok) isSyncModalOpen.value = false;
};

const handlePullClick = async () => {
  const ok = await pullFromRemote();
  if (ok) isSyncModalOpen.value = false;
};

const providerOptions: { label: string; value: SyncProviderKind }[] = [
  { label: 'GitHub', value: 'github' },
  { label: 'WebDAV', value: 'webdav' },
];

// 控制获取分支按钮的禁用状态（只要填了账号和仓库名即可获取，不需要 Token）
const isFetchBranchesDisabled = computed(() => {
  return !settingsStore.githubOwner.trim() || !settingsStore.githubRepo.trim() || isFetchingBranches.value;
});

// 拉取只需要账号、仓库、分支和文件路径（公开仓库无需 Token）
const isPullConfigComplete = computed(() => {
  if (settingsStore.syncTarget === 'webdav') {
    return !settingsStore.webdavServerUrl.trim();
  }
  return (
    !settingsStore.githubOwner.trim() ||
    !settingsStore.githubRepo.trim() ||
    !settingsStore.githubBranch.trim() ||
    !settingsStore.githubPath.trim()
  );
});

// 同步（推送）写回仓库，因此必须校验 Token 是否填写
const isPushConfigComplete = computed(() => {
  if (settingsStore.syncTarget === 'webdav') {
    return isPullConfigComplete.value;
  }
  return isPullConfigComplete.value || !settingsStore.githubToken.trim();
});

const handleFetchBranchesClick = async () => {
  isFetchingBranches.value = true;
  settingsStore.githubBranches = [];
  settingsStore.githubBranch = '';

  try {
    await fetchGithubBranches();
  } finally {
    isFetchingBranches.value = false;
  }
};
</script>

<style scoped lang="scss">
.sync-panel-card {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: $space-md;
  background-color: var(--bg-panel);
  padding: $space-md;
  border-radius: $radius-lg;
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
  font-size: $fs-xs;
  font-weight: 600;
  color: var(--text-disabled);
  margin: 0;
}

.grid-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: $space-md;
  box-sizing: border-box;
}

.sync-hint {
  margin: 0;
  font-size: $fs-2xs;
  line-height: 1.5;
  color: var(--text-disabled);
}
</style>
