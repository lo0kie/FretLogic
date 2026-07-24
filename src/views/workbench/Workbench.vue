<template>
  <div class="workbench-layout-wrapper">
    <div class="workbench-top-toolbar">
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

      <div class="toolbar-divider"></div>

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

      <div class="toolbar-divider"></div>

      <GlobalTooltip content="所有音符往低品位推移" placement="top">
        <ActionButton @click="handleShiftFret('down')" :disabled="isShiftDownDisabled" size="sm">
          <template #prefix><ChevronUp :size="18" stroke-width="3" /></template>
          上移
        </ActionButton>
      </GlobalTooltip>

      <GlobalTooltip content="所有音符往高品位推移" placement="top">
        <ActionButton @click="handleShiftFret('up')" :disabled="isShiftUpDisabled" size="sm">
          <template #prefix><ChevronDown :size="18" stroke-width="3" /></template>
          下移
        </ActionButton>
      </GlobalTooltip>
    </div>

    <div
      ref="FretBoardCaptureArea"
      class="workbench-card"
      :style="{ height: dynamicHeight, width: `${CANVAS_CONFIG.BOARD_WIDTH + 60}px` }"
    >
      <input
        v-model="editorStore.currentChordName"
        type="text"
        spellcheck="false"
        placeholder="CHORD"
        class="input-chord-name"
        :class="editorStore.currentChordName ? 'has-name' : 'is-empty'"
      />

      <div class="fretboard-render-zone">
        <Fretboard
          v-model:strings="editorStore.strings"
          v-model:capo="editorStore.capo"
          :fretCount="editorStore.fretCount"
          :activeBaseStrings="editorStore.activeBaseStrings"
          :isDarkMode="settingsStore.isDarkMode"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import Fretboard from '@/components/Fretboard.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { useAudioPlayer } from '@/composables/useAudioPlayer';
import { CANVAS_CONFIG, FRETBOARD_SCALE_MAP, WORKBENCH_LAYOUT } from '@/constants';
import { useChordService } from '@/services/useChordService';
import { useEditorStore } from '@/stores/editorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';
import { cloneDeep } from '@/utils/dataParser';
import { ChevronDown, ChevronUp, Copy, Image, Play, Square } from '@lucide/vue';
import { computed, ref, toRaw } from 'vue';

const editorStore = useEditorStore();
const settingsStore = useSettingsStore();
const uiStore = useUiStore();
const chordService = useChordService();
const FretBoardCaptureArea = ref<HTMLDivElement>();
const { isPlaying, playCurrentChord } = useAudioPlayer();

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
@import '@/assets/tokens.module';

.workbench-layout-wrapper {
  flex: 1;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  position: relative;
  overflow: hidden;
  box-sizing: border-box;
  transition: @transition-base;
}

.workbench-top-toolbar {
  position: absolute;
  top: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem;
  background-color: color-mix(in srgb, var(--bg-panel), transparent 20%);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  box-shadow: @shadow-floating;
  border: 1px solid var(--control-border);
  border-radius: @radius-lg;
  z-index: 100;
  transition: @transition-base;
}

.toolbar-divider {
  width: 1px;
  height: 1rem;
  background-color: var(--control-border);
  margin: 0 0.25rem;
}

.workbench-card {
  background-color: var(--bg-panel);
  border: @border-solid-light;
  border-radius: @radius-md;
  box-shadow: @shadow-floating;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-evenly;
  position: relative;
  margin-top: 2rem;
  box-sizing: border-box;
  flex-shrink: 0;
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
    border-top-left-radius: @radius-md;
    border-top-right-radius: @radius-md;
    pointer-events: none;
  }
}

.input-chord-name {
  padding-left: 2rem;
  padding-right: 2rem;
  width: 100%;
  text-align: center;
  font-weight: 900;
  background-color: transparent;
  border: none;
  outline: none;
  cursor: pointer;
  user-select: none;
  caret-color: @primary;
  font-size: 4rem;
  line-height: 1;
  letter-spacing: -0.05em;
  box-sizing: border-box;
  transition: all 0.3s ease;

  &::placeholder {
    color: #cbd5e1;
  }

  :global(.dark) &::placeholder {
    color: #334155;
  }

  &.has-name {
    color: var(--text-title);
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.05));
  }

  &.is-empty {
    opacity: 0.2;
    color: #94a3b8;

    :global(.dark) & {
      color: #475569;
    }
  }
}

.fretboard-render-zone {
  position: relative;
  width: 100%;
  display: flex;
  justify-content: center;
  z-index: 0;
  flex-shrink: 0;
}
</style>
