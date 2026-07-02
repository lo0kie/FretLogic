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
            <BaseInput v-model="settingsStore.githubToken" placeholder="GitHub Token (ghp_...)" is-password clearable />
          </GlobalTooltip>

          <div class="grid grid-cols-2 gap-2">
            <GlobalTooltip content="GitHub 账号名称" placement="top" class="w-full">
              <BaseInput v-model="settingsStore.githubOwner" placeholder="用户名 (Owner)" clearable />
            </GlobalTooltip>
            <GlobalTooltip content="仓库名称" placement="top" class="w-full">
              <BaseInput v-model="settingsStore.githubRepo" placeholder="仓库名 (Repo)" clearable />
            </GlobalTooltip>
          </div>

          <div class="grid grid-cols-2 gap-2 pt-1 mt-1">
            <GlobalTooltip content="从 GitHub 下载并覆盖本地所有数据" placement="top">
              <ActionButton @click="$emit('pull-request')" height="2rem">
                <template #prefix><CloudDownload :size="16" stroke-width="3" /></template>
                云端拉取
              </ActionButton>
            </GlobalTooltip>

            <GlobalTooltip content="将本地数据强制推送到 GitHub" placement="top">
              <ActionButton @click="$emit('push-request')" height="2rem">
                <template #prefix><CloudUpload :size="16" stroke-width="3" /></template>
                强制同步
              </ActionButton>
            </GlobalTooltip>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import BaseInput from '@/components/BaseInput.vue'; // 💡 引入公共输入框组件
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { useEditorStore } from '@/stores/editorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';
import type { GuitarStringsModel } from '@/types';
import { ChevronDown, ChevronUp, CloudDownload, CloudUpload } from '@lucide/vue';
import { computed, toRaw } from 'vue';

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
  uiStore.showToast('和弦指型已平移');
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.less';
.helper-inner-panel {
  background-color: var(--bg-body);
  border: @border-solid-base;
}
</style>
