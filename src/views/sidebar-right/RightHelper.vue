<template>
  <div class="right-helper-panel-wrapper">
    <div class="helper-section">
      <label class="section-label"> 指型整体品位平移 </label>
      <div class="grid-two-columns">
        <GlobalTooltip content="将指板上按下的所有音符往低品位（琴头方向）推移" placement="top">
          <ActionButton @click="handleShiftFret('down')" :disabled="isShiftDownDisabled">
            <template #prefix><ChevronUp :size="18" stroke-width="3" /></template>
            上移
          </ActionButton>
        </GlobalTooltip>

        <GlobalTooltip content="将指板上按下的所有音符往高品位（琴桥方向）推移" placement="top">
          <ActionButton @click="handleShiftFret('up')" :disabled="isShiftUpDisabled">
            下移
            <template #suffix><ChevronDown :size="18" stroke-width="3" /></template>
          </ActionButton>
        </GlobalTooltip>
      </div>
    </div>

    <div class="helper-section">
      <div class="section-header-row">
        <label class="section-label"> 云端同步 </label>

        <div class="env-badge-zone" :title="`目标分支: ${settingsStore.githubBranch}`">
          <span class="status-dot" :class="{ 'is-dev': isDevEnv, 'is-prod': !isDevEnv }"></span>
          <span class="env-text" :class="{ 'is-dev': isDevEnv, 'is-prod': !isDevEnv }">
            {{ isDevEnv ? 'DEV' : 'PROD' }}
          </span>
        </div>
      </div>

      <div class="sync-config-card">
        <GlobalTooltip content="GitHub Token" placement="top" class="full-width-tooltip">
          <BaseInput v-model="settingsStore.githubToken" placeholder="GitHub Token (ghp_...)" is-password clearable />
        </GlobalTooltip>

        <div class="grid-two-columns">
          <GlobalTooltip content="GitHub 账号名称" placement="top" class="full-width-tooltip">
            <BaseInput v-model="settingsStore.githubOwner" placeholder="Username" clearable />
          </GlobalTooltip>
          <GlobalTooltip content="仓库名称" placement="top" class="full-width-tooltip">
            <BaseInput v-model="settingsStore.githubRepo" placeholder="Repository" clearable />
          </GlobalTooltip>
        </div>

        <div class="grid-two-columns">
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
    </div>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import BaseInput from '@/components/BaseInput.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { useEditorStore } from '@/stores/editorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';
import { cloneDeep } from '@/utils/dataParser';
import { ChevronDown, ChevronUp, CloudDownload, CloudUpload } from '@lucide/vue';
import { computed, toRaw } from 'vue';

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
const uiStore = useUiStore();
const editorStore = useEditorStore();

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
  const newStrings = cloneDeep(toRaw(editorStore.strings));

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
  uiStore.toast.info('和弦指型已平移');
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.less';

.right-helper-panel-wrapper {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  box-sizing: border-box;
}

.helper-section {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  box-sizing: border-box;
}

.section-label {
  font-size: 0.7rem;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-disabled);
}

.section-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
}

.grid-two-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.6rem;
  box-sizing: border-box;
}

.full-width-tooltip {
  width: 100%;
}

.env-badge-zone {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  box-sizing: border-box;
}

.status-dot {
  width: 0.3rem;
  height: 0.3rem;
  border-radius: 50%;

  &.is-dev {
    background-color: #f59e0b;
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  &.is-prod {
    background-color: #10b981;
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

.env-text {
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.05em;

  &.is-dev {
    color: #f59e0b;
  }

  &.is-prod {
    color: #10b981;
  }
}

.sync-config-card {
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
</style>
