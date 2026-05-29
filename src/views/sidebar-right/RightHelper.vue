<template>
  <div class="helper-action-box flex flex-col gap-2">
    <label class="text-xs font-black tracking-widest uppercase" style="color: var(--text-disabled)">系统辅助</label>

    <div class="flex flex-col gap-4">
      <GlobalTooltip content="生成高清无背景图片并复制" placement="top">
        <ActionButton
          @click="uiStore.copyFretBoardToClipboard('#fretBoard-capture-area')"
          :disabled="uiStore.isCopying"
        >
          <span class="text-sm leading-none mr-2">{{ uiStore.isCopying ? '⌛' : '📸' }}</span>
          <span>{{ uiStore.isCopying ? '正在导出...' : '复制当前到剪切板' }}</span>
        </ActionButton>
      </GlobalTooltip>

      <div class="helper-inner-panel flex flex-col gap-2 p-3 rounded-xl">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold tracking-wider" style="color: var(--text-muted)">指型整体平移</span>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <GlobalTooltip content="将当前指型向高品位移动" placement="top">
            <ActionButton
              @click="handleShiftFret('down')"
              :disabled="isShiftDownDisabled"
              class="h-8 rounded-lg text-xs"
            >
              <span class="text-xs leading-none mr-2">▲</span>
              <span>上移</span>
            </ActionButton>
          </GlobalTooltip>

          <GlobalTooltip content="将当前指型向低品位移动" placement="top">
            <ActionButton @click="handleShiftFret('up')" :disabled="isShiftUpDisabled" class="h-8 rounded-lg text-xs">
              <span>下移</span>
              <span class="text-xs leading-none ml-2">▼</span>
            </ActionButton>
          </GlobalTooltip>
        </div>
      </div>

      <ActionButton @click="playCurrentChord" :disabled="chordLabStore.isFretBoardEmpty || isPlaying">
        <span v-if="chordLabStore.isFretBoardEmpty">请添加指板音</span>
        <template v-else>
          <span class="text-sm leading-none mr-2">{{ isPlaying ? '🎵' : '🔊' }}</span>
          <span>{{ isPlaying ? '正在试听...' : '试听当前和弦' }}</span>
        </template>
      </ActionButton>

      <ActionButton @click="chordLabStore.isDarkMode = !chordLabStore.isDarkMode">
        <span class="text-sm leading-none mr-2">{{ chordLabStore.isDarkMode ? '🌙' : '☀️' }}</span>
        <span>{{ chordLabStore.isDarkMode ? '深色模式' : '浅色模式' }}</span>
      </ActionButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue'; // 🌟 引入 Tooltip
import { useAudioPlayer } from '@/composables/useAudioPlayer';
import { useChordLabStore } from '@/stores/chordLabStore';
import { useUiStore } from '@/stores/uiStore';
import { computed } from 'vue';

const uiStore = useUiStore();
const chordLabStore = useChordLabStore();
const { isPlaying, playCurrentChord } = useAudioPlayer();

const hasNoPressedFrets = computed(() => !chordLabStore.selectedFrets.some(fret => fret > 0));

const isShiftDownDisabled = computed(
  () =>
    chordLabStore.isFretBoardEmpty || hasNoPressedFrets.value || chordLabStore.selectedFrets.some(fret => fret === 1)
);

const isShiftUpDisabled = computed(
  () =>
    chordLabStore.isFretBoardEmpty ||
    hasNoPressedFrets.value ||
    chordLabStore.selectedFrets.some(fret => fret === chordLabStore.fretCount)
);

const handleShiftFret = (direction: 'up' | 'down') => {
  if (chordLabStore.isFretBoardEmpty || hasNoPressedFrets.value) return;

  if (direction === 'up') {
    if (chordLabStore.selectedFrets.some(fret => fret === chordLabStore.fretCount)) return;
    chordLabStore.selectedFrets = chordLabStore.selectedFrets.map(fret => (fret > 0 ? fret + 1 : fret));
  } else {
    if (chordLabStore.selectedFrets.some(fret => fret === 1)) return;
    chordLabStore.selectedFrets = chordLabStore.selectedFrets.map(fret => (fret > 0 ? fret - 1 : fret));
  }
  uiStore.showToast(`🎶 和弦指型已完成整体平移`);
};
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

.helper-inner-panel {
  background-color: var(--bg-body);
  border: @border-solid-base;
}

.helper-action-box button:not(:disabled):hover {
  border-color: @primary;
  color: @primary;
}
</style>
