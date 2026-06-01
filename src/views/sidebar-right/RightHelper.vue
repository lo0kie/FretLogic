/** * @Author likan * @Date 2026-06-01 * @Filepath fret-logic/src/views/sidebar-right/RightHelper.vue */

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

      <ActionButton @click="executeToggleThemeWithAnimation($event)">
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
import type { GuitarStringsModel } from '@/types/chord';
import { ChevronDown, ChevronUp, Moon, Play, Square, Sun } from '@lucide/vue';
import { computed, toRaw } from 'vue';

const uiStore = useUiStore();
const chordLabStore = useChordLabStore();
const chordService = useChordService();
const { isPlaying, playCurrentChord } = useAudioPlayer();

const hasNoPressedFrets = computed(() => !chordLabStore.strings.some(s => s.fret > 0));

const isShiftDownDisabled = computed(
  () => chordLabStore.isFretBoardEmpty || hasNoPressedFrets.value || chordLabStore.strings.some(s => s.fret === 1)
);

const isShiftUpDisabled = computed(
  () =>
    chordLabStore.isFretBoardEmpty ||
    hasNoPressedFrets.value ||
    chordLabStore.strings.some(s => s.fret === chordLabStore.fretCount)
);

/**
 * 🌟 核心防线：安全隔离且带有水波纹切割特效的主题更迭器
 * 为 event 追加可选标记，防止键盘快捷键或边缘宏触发时没有 MouseEvent 导致空指针
 */
const executeToggleThemeWithAnimation = (event?: MouseEvent) => {
  const rootEl = document.documentElement;
  rootEl.setAttribute('theme-changing', 'true');

  const disableChangingAttribute = () => {
    setTimeout(() => {
      rootEl.removeAttribute('theme-changing');
    }, 350);
  };

  const isSupportViewTransition = 'startViewTransition' in document;
  if (!isSupportViewTransition || !event) {
    chordLabStore.isDarkMode = !chordLabStore.isDarkMode;
    disableChangingAttribute();
    return;
  }

  const x = event.clientX;
  const y = event.clientY;
  const endRadius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

  const transition = (document as any).startViewTransition(() => {
    chordLabStore.isDarkMode = !chordLabStore.isDarkMode;
  });

  transition.ready.then(() => {
    document.documentElement.animate(
      {
        clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`],
      },
      {
        duration: 350,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        pseudoElement: '::view-transition-new(root)',
      }
    );
  });

  transition.finished.then(() => {
    disableChangingAttribute();
  });
};

const handleShiftFret = (direction: 'up' | 'down') => {
  if (chordLabStore.isFretBoardEmpty || hasNoPressedFrets.value) return;

  const newStrings = structuredClone(toRaw(chordLabStore.strings)) as GuitarStringsModel;

  if (direction === 'up') {
    if (newStrings.some(s => s.fret === chordLabStore.fretCount)) return;
    newStrings.forEach(s => {
      if (s.fret > 0) s.fret += 1;
    });
  } else {
    if (newStrings.some(s => s.fret === 1)) return;
    newStrings.forEach(s => {
      if (s.fret > 0) s.fret -= 1;
    });
  }

  chordLabStore.strings = newStrings;
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
