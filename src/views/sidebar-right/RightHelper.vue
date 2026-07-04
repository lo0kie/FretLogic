<template>
  <div class="right-helper-panel-wrapper w-full flex flex-col gap-6">
    <div class="flex flex-col gap-2.5">
      <label class="text-xs font-black tracking-widest uppercase" style="color: var(--text-disabled)">
        指型整体品位平移
      </label>
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

    <div class="flex flex-col gap-2.5">
      <div class="flex items-center justify-between">
        <label class="text-xs font-black tracking-widest uppercase" style="color: var(--text-disabled)">
          云端同步
        </label>

        <div class="flex items-center gap-1.5" :title="`目标分支: ${settingsStore.githubBranch}`">
          <span
            class="w-1.5 h-1.5 rounded-full"
            :class="isDevEnv ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'"
          ></span>
          <span
            class="text-[10px] font-black uppercase tracking-wider"
            :class="isDevEnv ? 'text-amber-500' : 'text-emerald-500'"
          >
            {{ isDevEnv ? 'DEV' : 'PROD' }}
          </span>
        </div>
      </div>

      <div
        class="flex flex-col gap-2 bg-[var(--bg-panel)] p-3 rounded-md border border-[var(--border-light)] shadow-sm"
      >
        <GlobalTooltip content="GitHub Token" placement="top" class="w-full">
          <BaseInput v-model="settingsStore.githubToken" placeholder="GitHub Token (ghp_...)" is-password clearable />
        </GlobalTooltip>

        <div class="grid grid-cols-2 gap-2">
          <GlobalTooltip content="GitHub 账号名称" placement="top" class="w-full">
            <BaseInput v-model="settingsStore.githubOwner" placeholder="Username" clearable />
          </GlobalTooltip>
          <GlobalTooltip content="仓库名称" placement="top" class="w-full">
            <BaseInput v-model="settingsStore.githubRepo" placeholder="Repository" clearable />
          </GlobalTooltip>
        </div>

        <div class="grid grid-cols-2 gap-2 mt-1">
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
  uiStore.showToast('和弦指型已平移');
};
</script>
<style scoped lang="less"></style>
