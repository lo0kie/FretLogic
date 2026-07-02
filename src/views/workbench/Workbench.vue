<template>
  <div class="flex-1 h-full flex items-center justify-center p-8 transition-all relative overflow-hidden">
    <div
      class="absolute inset-0 bg-gradient-to-b from-[var(--color-primary)]/5 to-transparent pointer-events-none transition-colors duration-500"
    ></div>

    <div
      class="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 p-1.5 bg-[var(--bg-panel)]/80 backdrop-blur-xl shadow-floating border border-[var(--control-border)] rounded-xl z-[100] transition-all"
    >
      <GlobalTooltip content="播放/试听当前和弦" placement="bottom">
        <ActionButton @click="playCurrentChord" primary :disabled="editorStore.isFretBoardEmpty || isPlaying" size="sm">
          <template #prefix>
            <component
              v-if="!editorStore.isFretBoardEmpty"
              :is="isPlaying ? Square : Play"
              :size="16"
              stroke-width="3"
            />
          </template>
          <span v-if="editorStore.isFretBoardEmpty">添加音符试听</span>
          <span v-else>{{ isPlaying ? '试听中...' : '试听和弦' }}</span>
        </ActionButton>
      </GlobalTooltip>

      <div class="w-px h-4 bg-[var(--control-border)] mx-1"></div>
      <GlobalTooltip content="生成指板高清切图（背景透明）" placement="bottom">
        <ActionButton
          @click="chordService.exportFretboardImage(FretBoardCaptureArea, true)"
          :disabled="uiStore.isCopying"
          size="sm"
        >
          <template #prefix><Image :size="16" stroke-width="3" /></template>
          <span>{{ uiStore.isCopying ? '导出中...' : '存为透明图' }}</span>
        </ActionButton>
      </GlobalTooltip>

      <GlobalTooltip content="生成完整工作台切图（带卡片底色）" placement="bottom">
        <ActionButton
          @click="chordService.exportFretboardImage(FretBoardCaptureArea, false)"
          :disabled="uiStore.isCopying"
          size="sm"
        >
          <template #prefix><Copy :size="16" stroke-width="3" /></template>
          <span>{{ uiStore.isCopying ? '导出中...' : '存为卡片图' }}</span>
        </ActionButton>
      </GlobalTooltip>

      <div class="w-px h-4 bg-[var(--control-border)] mx-1"></div>

      <GlobalTooltip :content="settingsStore.isDarkMode ? '切换至浅色模式' : '切换至深色模式'" placement="bottom">
        <ActionButton @click="executeToggleThemeWithAnimation($event)" size="sm">
          <template #prefix
            ><component :is="settingsStore.isDarkMode ? Moon : Sun" :size="16" stroke-width="3"
          /></template>
          <span>{{ settingsStore.isDarkMode ? '深色' : '浅色' }}</span>
        </ActionButton>
      </GlobalTooltip>
    </div>

    <div
      ref="FretBoardCaptureArea"
      class="workbench-card rounded-xl flex flex-col items-center justify-evenly relative shrink-0"
      :style="{ height: dynamicHeight, width: `${CANVAS_CONFIG.BOARD_WIDTH + 60}px` }"
    >
      <input
        v-model="editorStore.currentChordName"
        type="text"
        spellcheck="false"
        placeholder="CHORD"
        class="input-chord-name px-8 w-full text-center font-black bg-transparent border-none outline-none cursor-pointer select-none caret-blue-600 transition-all duration-300 placeholder-slate-300 dark:placeholder-slate-600 text-[4rem] leading-none tracking-tight"
        :class="
          editorStore.currentChordName
            ? ' text-slate-900 dark:text-slate-50 drop-shadow-sm'
            : 'opacity-20 text-slate-300 dark:text-slate-600'
        "
      />

      <div class="relative w-full flex justify-center z-0 shrink-0">
        <FretBoardCanvas />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { useAudioPlayer } from '@/composables/useAudioPlayer';
import { CANVAS_CONFIG, FRETBOARD_SCALE_MAP, WORKBENCH_LAYOUT } from '@/constants';
import { useChordService } from '@/services/useChordService';
import { useEditorStore } from '@/stores/editorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';
import FretBoardCanvas from '@/views/workbench/FretBoardCanvas.vue';
import { Copy, Image, Moon, Play, Square, Sun } from '@lucide/vue';
import { computed, ref } from 'vue';

const editorStore = useEditorStore();
const settingsStore = useSettingsStore();
const uiStore = useUiStore();
const chordService = useChordService();
const FretBoardCaptureArea = ref<HTMLDivElement>();
const { isPlaying, playCurrentChord } = useAudioPlayer();

const executeToggleThemeWithAnimation = (event?: MouseEvent) => {
  const rootEl = document.documentElement;
  rootEl.setAttribute('theme-changing', 'true');

  const disableChangingAttribute = () => {
    setTimeout(() => {
      rootEl.removeAttribute('theme-changing');
    }, 350);
  };

  if (!document.startViewTransition || !event) {
    settingsStore.isDarkMode = !settingsStore.isDarkMode;
    disableChangingAttribute();
    return;
  }

  const x = event.clientX;
  const y = event.clientY;
  const endRadius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

  const transition = document.startViewTransition(() => {
    settingsStore.isDarkMode = !settingsStore.isDarkMode;
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
const dynamicHeight = computed(() => {
  const baseVerticalSpace = WORKBENCH_LAYOUT.BASE_VERTICAL_PADDING;

  const rawCanvasHeight =
    CANVAS_CONFIG.OFFSET_Y_TOP + editorStore.fretCount * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.OFFSET_Y_BOTTOM;

  const currentScale = FRETBOARD_SCALE_MAP[editorStore.fretCount] || 1.0;
  const realBoardHeight = rawCanvasHeight * currentScale;

  return `${baseVerticalSpace + realBoardHeight}px`;
});
</script>

<style scoped lang="less">
@import '@/assets/tokens.less';

.workbench-card {
  .mixin-panel-base();
  box-shadow: @shadow-floating;
  transition:
    height @duration-slow @bezier-bounce,
    background-color @duration-base,
    border-color @duration-base,
    box-shadow @duration-base;

  :global(.dark) & {
    box-shadow: @shadow-floating-dark;
  }

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.5), transparent);
    opacity: 0.3;
    border-top-left-radius: 28px;
    border-top-right-radius: 28px;
    pointer-events: none;
  }
}
</style>
