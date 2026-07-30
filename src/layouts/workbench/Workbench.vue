<template>
  <div class="workbench-layout-wrapper">
    <div class="workbench-scroll-container">
      <!-- 1. 和弦指板主卡片 -->
      <div
        ref="FretBoardCaptureArea"
        class="workbench-card"
        :style="{
          height: uiStore.isMobile ? 'auto' : dynamicHeight,
          width: uiStore.isMobile ? '100%' : `${CANVAS_CONFIG.BOARD_WIDTH + 64}px`,
        }"
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
            :fret-count="editorStore.fretCount"
            :active-base-strings="editorStore.activeBaseStrings"
            :is-dark-mode="settingsStore.isDarkMode"
            :scale="uiStore.isMobile ? mobileScale : 1.0"
          />
        </div>
      </div>

      <!-- 2. 实时分析面板：5：直接位于指板正下方 -->
      <ChordAnalysisPanel />
    </div>

    <!-- 3. 底部吸附操作按钮栏 -->
    <Transition name="floating-bar-fade">
      <div v-if="isFloatingBarVisible" class="floating-action-bar" :style="{ bottom: barBottomPosition }">
        <ActionButton size="md" variant="ghost" :disabled="isClearDisabled" @click="editorStore.resetEditor()">
          {{ editorStore.editingId ? '放弃修改' : '重置指板' }}
        </ActionButton>

        <div class="bar-divider"></div>

        <ActionButton size="md" variant="subtle" :disabled="isSaveDisabled" @click="chordService.persistCurrentChord()">
          {{ editorStore.editingId ? '更新保存' : '确认保存' }}
        </ActionButton>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import Fretboard from '@/components/Fretboard.vue';
import { useChordService } from '@/services/useChordService';
import { useEditorStore } from '@/stores/editorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';
import { CANVAS_CONFIG, FRETBOARD_SCALE_MAP, WORKBENCH_LAYOUT } from '@/utils/constants';
import { useWindowSize } from '@vueuse/core';
import { computed, ref } from 'vue';
import ChordAnalysisPanel from './ChordAnalysisPanel.vue';

const editorStore = useEditorStore();
const settingsStore = useSettingsStore();
const uiStore = useUiStore();
const chordService = useChordService();
const FretBoardCaptureArea = ref<HTMLDivElement>();

const { width: windowWidth } = useWindowSize();

const mobileScale = computed(() => {
  const targetWidth = windowWidth.value - 32;
  const baseWidth = CANVAS_CONFIG.BOARD_WIDTH;
  return Math.min(1.0, Math.max(0.65, targetWidth / baseWidth));
});

const dynamicHeight = computed(() => {
  const baseVerticalSpace = WORKBENCH_LAYOUT.BASE_VERTICAL_PADDING;
  const rawCanvasHeight =
    CANVAS_CONFIG.OFFSET_Y_TOP + editorStore.fretCount * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.OFFSET_Y_BOTTOM;
  const currentScale = FRETBOARD_SCALE_MAP[editorStore.fretCount] || 1.0;
  const realBoardHeight = rawCanvasHeight * currentScale;
  return `${baseVerticalSpace + realBoardHeight}px`;
});

const barBottomPosition = computed(() => {
  if (uiStore.isMobile) return 'calc(1.8rem + env(safe-area-inset-bottom, 0px))';
  else return editorStore.fretCount === 3 ? '3.3rem' : '1.8rem';
});

const isFloatingBarVisible = computed(() => {
  const cleanName = editorStore.currentChordName ? editorStore.currentChordName.trim() : '';
  return (
    cleanName !== '' ||
    !editorStore.isFretBoardEmpty ||
    editorStore.capo > 0 ||
    editorStore.fretCount > 3 ||
    editorStore.editingId !== null
  );
});

const isSaveDisabled = computed(() => {
  const cleanName = editorStore.currentChordName ? editorStore.currentChordName.trim() : '';
  return !cleanName || editorStore.isFretBoardEmpty;
});

const isClearDisabled = computed(() => {
  if (editorStore.editingId) return false;
  const cleanName = editorStore.currentChordName ? editorStore.currentChordName.trim() : '';
  return (
    cleanName === '' &&
    editorStore.isFretBoardEmpty &&
    editorStore.capo === 0 &&
    editorStore.fretCount === 3 &&
    editorStore.currentTuning === 'STANDARD'
  );
});
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.workbench-layout-wrapper {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  position: absolute;
  inset: 0;
  z-index: 1;
  padding: 2rem;
  padding-top: 3.5rem;
  padding-bottom: 6.15rem;
  overflow: hidden;
  box-sizing: border-box;
  pointer-events: none;
}

.workbench-scroll-container {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  width: 100%;
  height: 100%;
  position: relative;

  > * {
    margin-top: 0;
  }
}

.workbench-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-evenly;
  pointer-events: auto;
  background-color: var(--bg-panel);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--glass-border);
  border-radius: @radius-md;
  box-shadow: @shadow-floating;
  position: relative;
  box-sizing: border-box;
  flex-shrink: 0;
  transition:
    height @duration-slow @bezier-sidebar,
    background-color @duration-base,
    border-color @duration-base,
    box-shadow @duration-base;
}

.floating-action-bar {
  display: flex;
  align-items: center;
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  z-index: 90;
  pointer-events: auto;
  gap: 0.5rem;
  padding: 0.4rem 0.5rem;
  background-color: var(--bg-panel);
  backdrop-filter: blur(30px);
  -webkit-backdrop-filter: blur(30px);
  border: 1px solid var(--glass-border);
  border-radius: 9999px;
  box-shadow: @shadow-floating;
  box-sizing: border-box;

  transition:
    bottom 0.35s cubic-bezier(0.16, 1, 0.3, 1),
    background-color 0.28s ease,
    border-color 0.28s ease,
    box-shadow 0.28s ease;
}

.bar-divider {
  width: 1px;
  height: 1rem;
  background-color: var(--border-base);
  opacity: 0.6;
}

.input-chord-name {
  padding-left: 1rem;
  padding-right: 1rem;
  width: 100%;
  text-align: center;
  font-weight: 900;
  background-color: transparent;
  border: none;
  outline: none;
  cursor: pointer;
  user-select: none;
  caret-color: @primary;
  font-size: 3.8rem;
  line-height: 1;
  letter-spacing: -0.04em;
  box-sizing: border-box;
  transition: all 0.25s ease;

  &::placeholder {
    color: var(--text-disabled);
    opacity: 0.22;
    font-weight: 700;
  }

  &.has-name {
    color: var(--text-title);
  }

  &.is-empty {
    color: var(--text-disabled);
  }
}

.fretboard-render-zone {
  display: flex;
  justify-content: center;
  position: relative;
  width: 100%;
  z-index: 0;
  flex-shrink: 0;
  transform: translateX(-5px);
}

.floating-bar-fade-enter-active,
.floating-bar-fade-leave-active {
  transition:
    opacity 0.25s cubic-bezier(0.25, 1, 0.5, 1),
    transform 0.25s cubic-bezier(0.34, 1.4, 0.64, 1);
}

.floating-bar-fade-enter-from,
.floating-bar-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, 20px) scale(0.95);
}

/* 📱 移动端上下排列，纵向滚动 */
@media (max-width: 768px) {
  .workbench-layout-wrapper {
    padding: 0.5rem;
    padding-bottom: 5.5rem;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    pointer-events: auto;
  }

  .workbench-scroll-container {
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    height: auto;
  }

  .workbench-card {
    padding: 1rem 0.25rem;
    width: 100% !important;
  }

  .input-chord-name {
    font-size: 2.6rem;
  }

  .fretboard-render-zone {
    display: flex;
    justify-content: center;
    width: 100%;
  }
}
</style>
