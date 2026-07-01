<template>
  <div class="right-helper-panel-wrapper w-full flex flex-col gap-4">
    <div class="helper-action-box flex flex-col gap-2">
      <div class="flex flex-col gap-4">
        <div class="helper-inner-panel flex flex-col gap-2 p-3 rounded-xl">
          <div class="flex items-center justify-between">
            <span class="text-[12px] font-bold tracking-wider" style="color: var(--text-muted)">
              指型整体品位平移
            </span>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <GlobalTooltip content="将指板上按下的所有音符往高品位（琴桥方向）推移" placement="top">
              <ActionButton @click="handleShiftFret('down')" :disabled="isShiftDownDisabled">
                <template #prefix><ChevronUp :size="18" stroke-width="3" /></template>
                上移
              </ActionButton>
            </GlobalTooltip>
            <GlobalTooltip content="将指板上按下的所有音符往低品位（琴头方向）推移" placement="top">
              <ActionButton @click="handleShiftFret('up')" :disabled="isShiftUpDisabled">
                下移
                <template #suffix><ChevronDown :size="18" stroke-width="3" /></template>
              </ActionButton>
            </GlobalTooltip>
          </div>
        </div>

        <div class="helper-inner-panel flex flex-col p-3 rounded-xl">
          <div class="flex items-center justify-between pb-2">
            <span class="text-[12px] font-bold tracking-wider" style="color: var(--text-muted)"> 云端同步配置 </span>

            <div class="text-[12px]">
              <span
                class="text-[10px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider"
                :class="isDevEnv ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'"
              >
                {{ isDevEnv ? 'DEV' : 'PROD' }}
              </span>

              <a
                class="text-[12px] font-black px-1.5 py-0.5 rounded bg-[var(--color-primary)]/10 text-[var(--color-primary)] cursor-pointer hover:underline font-mono"
                title="当前数据同步目标分支"
                :href="`https://github.com/${settingsStore.githubOwner}/${settingsStore.githubRepo}/blob/${settingsStore.githubBranch}/${settingsStore.githubPath}`"
              >
                {{ settingsStore.githubBranch }}
              </a>
            </div>
          </div>

          <GlobalTooltip content="GitHub Token" placement="top" class="w-full mb-2">
            <input
              v-model="settingsStore.githubToken"
              type="text"
              placeholder="GitHub Token (ghp_...)"
              class="helper-sync-input helper-sync-crypto-input w-full text-xs"
              data-bitwarden-ignore
              autocomplete="off"
            />
          </GlobalTooltip>

          <div class="grid grid-cols-2 gap-2">
            <GlobalTooltip content="GitHub 账号名称" placement="top" class="w-full">
              <input
                v-model="settingsStore.githubOwner"
                type="text"
                placeholder="用户名 (Owner)"
                class="helper-sync-input w-full text-xs"
                data-bitwarden-ignore
                autocomplete="off"
              />
            </GlobalTooltip>

            <GlobalTooltip content="仓库名称" placement="top" class="w-full">
              <input
                v-model="settingsStore.githubRepo"
                type="text"
                placeholder="仓库名 (Repo)"
                class="helper-sync-input w-full text-xs"
                data-bitwarden-ignore
                autocomplete="off"
              />
            </GlobalTooltip>
          </div>

          <div class="grid grid-cols-2 gap-2 pt-1 mt-1">
            <GlobalTooltip content="从 GitHub 下载并覆盖本地所有数据" placement="top">
              <ActionButton @click="isPullConfirmOpen = true" height="2rem">
                <template #prefix><CloudDownload :size="16" stroke-width="3" /></template>
                云端拉取
              </ActionButton>
            </GlobalTooltip>

            <GlobalTooltip content="将本地数据强制推送到 GitHub" placement="top">
              <ActionButton @click="handleManualPush" height="2rem">
                <template #prefix><CloudUpload :size="16" stroke-width="3" /></template>
                强制同步
              </ActionButton>
            </GlobalTooltip>
          </div>
        </div>
      </div>
    </div>

    <BaseModal
      v-model:visible="isPullConfirmOpen"
      title="操作确认"
      confirm-type="danger"
      confirm-text="确认"
      @confirm="confirmPull"
    >
      <p class="text-sm font-semibold opacity-80 leading-relaxed text-body">
        从云端拉取数据将<span class="text-[var(--color-danger)] font-black">完全覆盖</span
        >您本地的所有和弦与分组记录，且此操作不可撤销！ <br /><br />您确定要继续吗？
      </p>
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import BaseModal from '@/components/BaseModal.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { useGithubSyncService } from '@/services/useGithubSyncService';
import { useEditorStore } from '@/stores/editorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';
import type { GuitarStringsModel } from '@/types';
import { ChevronDown, ChevronUp, CloudDownload, CloudUpload } from '@lucide/vue';
import { computed, ref, toRaw } from 'vue';

const isDevEnv = import.meta.env.DEV;
const settingsStore = useSettingsStore();
const uiStore = useUiStore();
const editorStore = useEditorStore();
const { triggerGlobalSync, pullFromGithub } = useGithubSyncService();

const isPullConfirmOpen = ref(false);

const hasNoPressedFrets = computed(() => !editorStore.strings.some(s => s.fret > 0));

const isShiftDownDisabled = computed(
  () => editorStore.isFretBoardEmpty || hasNoPressedFrets.value || editorStore.strings.some(s => s.fret === 1)
);

const isShiftUpDisabled = computed(
  () =>
    editorStore.isFretBoardEmpty ||
    hasNoPressedFrets.value ||
    editorStore.strings.some(s => s.fret === editorStore.fretCount)
);

const handleShiftFret = (direction: 'up' | 'down') => {
  if (editorStore.isFretBoardEmpty || hasNoPressedFrets.value) return;

  const newStrings = structuredClone(toRaw(editorStore.strings)) as GuitarStringsModel;

  if (direction === 'up') {
    if (newStrings.some(s => s.fret === editorStore.fretCount)) return;
    newStrings.forEach(s => {
      if (s.fret > 0) s.fret += 1;
    });
  } else {
    if (newStrings.some(s => s.fret === 1)) return;
    newStrings.forEach(s => {
      if (s.fret > 0) s.fret -= 1;
    });
  }

  editorStore.strings = newStrings;
  uiStore.showToast('🎸 和弦指型已完成整体平移');
};

const handleManualPush = () => {
  triggerGlobalSync();
};

const confirmPull = () => {
  pullFromGithub();
  isPullConfirmOpen.value = false;
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.less';

.helper-inner-panel {
  background-color: var(--bg-body);
  border: @border-solid-base;
}

.helper-sync-input {
  .mixin-input-base();
  height: 2rem;
  @apply cursor-pointer font-bold py-0;

  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
}

.helper-sync-crypto-input {
  -webkit-text-security: disc !important;
}
</style>
