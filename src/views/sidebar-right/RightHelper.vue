/** * @Author likan * @Date 2026-05-31 * @Filepath fret-logic/src/views/sidebar-right/RightHelper.vue */

<template>
  <div class="helper-action-box flex flex-col gap-2">
    <label class="text-xs font-black uppercase tracking-widest" style="color: var(--text-disabled)"> 系统辅助 </label>

    <div class="flex flex-col gap-4">
      <div class="grid grid-cols-2 gap-2">
        <GlobalTooltip content="生成指板高清切图（背景透明，适合做谱）" placement="top">
          <ActionButton
            @click="chordService.exportFretboardImage('#fretBoard-capture-area', true)"
            :disabled="uiStore.isCopying"
            class="text-xs"
          >
            <span>{{ uiStore.isCopying ? '导出中...' : '复制 (透明)' }}</span>
          </ActionButton>
        </GlobalTooltip>

        <GlobalTooltip content="生成完整工作台切图（带卡片底纹，适合分享）" placement="top">
          <ActionButton
            @click="chordService.exportFretboardImage('#fretBoard-capture-area', false)"
            :disabled="uiStore.isCopying"
            class="text-xs"
          >
            <span>{{ uiStore.isCopying ? '导出中...' : '复制 (带底色)' }}</span>
          </ActionButton>
        </GlobalTooltip>
      </div>

      <div class="helper-inner-panel flex flex-col gap-2 p-3 rounded-xl">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold tracking-wider" style="color: var(--text-muted)"> 指型整体品位平移 </span>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <GlobalTooltip content="将指板上按下的所有音符往高品位（琴桥方向）推移" placement="top">
            <ActionButton
              @click="handleShiftFret('down')"
              :disabled="isShiftDownDisabled"
              class="h-8 rounded-lg text-xs"
            >
              <ChevronUp :size="18" stroke-width="3" class="mr-2" />
              <span>上移</span>
            </ActionButton>
          </GlobalTooltip>

          <GlobalTooltip content="将指板上按下的所有音符往低品位（琴头方向）推移" placement="top">
            <ActionButton @click="handleShiftFret('up')" :disabled="isShiftUpDisabled" class="h-8 rounded-lg text-xs">
              <span>下移</span>
              <ChevronDown :size="18" stroke-width="3" class="ml-2" />
            </ActionButton>
          </GlobalTooltip>
        </div>
      </div>

      <ActionButton @click="playCurrentChord" :disabled="chordLabStore.isFretBoardEmpty || isPlaying">
        <span v-if="chordLabStore.isFretBoardEmpty">请在左侧指板添加有效音符</span>
        <template v-else>
          <component :is="isPlaying ? Square : Play" class="mr-2" :size="18" stroke-width="3" />
          <span>{{ isPlaying ? '正在试听...' : '试听当前和弦' }}</span>
        </template>
      </ActionButton>

      <ActionButton @click="chordLabStore.isDarkMode = !chordLabStore.isDarkMode">
        <component :is="chordLabStore.isDarkMode ? Moon : Sun" class="mr-2" :size="18" stroke-width="3" />
        <span>{{ chordLabStore.isDarkMode ? '深色模式' : '浅色模式' }}</span>
      </ActionButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { useAudioPlayer } from '@/composables/useAudioPlayer';
import { useChordService } from '@/services/useChordService';
import { useChordLabStore } from '@/stores/chordLabStore';
import { useUiStore } from '@/stores/uiStore';
import type { FretTuple } from '@/types/types'; // 🌟 引入强类型
import { ChevronDown, ChevronUp, Moon, Play, Square, Sun } from '@lucide/vue';
import { computed } from 'vue';

const uiStore = useUiStore();
const chordLabStore = useChordLabStore();
const chordService = useChordService();
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

  // 🌟 核心修复：告别 as any，用强类型推断完成元组遍历计算
  const newFrets = [...chordLabStore.selectedFrets] as FretTuple;

  if (direction === 'up') {
    if (newFrets.some(fret => fret === chordLabStore.fretCount)) return;
    for (let i = 0; i < 6; i++) {
      if (newFrets[i] > 0) newFrets[i] += 1;
    }
  } else {
    if (newFrets.some(fret => fret === 1)) return;
    for (let i = 0; i < 6; i++) {
      if (newFrets[i] > 0) newFrets[i] -= 1;
    }
  }

  chordLabStore.selectedFrets = newFrets;
  uiStore.showToast('🎸 和弦指型已完成整体平移');
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
