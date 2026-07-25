<template>
  <div class="workbench-layout-wrapper">
    <!-- 1. 中间居中指板卡片 -->
    <div
      ref="FretBoardCaptureArea"
      class="workbench-card"
      :style="{ height: dynamicHeight, width: `${CANVAS_CONFIG.BOARD_WIDTH + 64}px` }"
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

    <!-- 2. 右侧固定面板：顶部与中间卡片对齐 -->
    <ChordAnalysisPanel />

    <!-- 3. 底部动态浮动操作条 -->
    <Transition name="floating-bar-fade">
      <div v-if="isFloatingBarVisible" class="floating-action-bar">
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
import ChordAnalysisPanel from '@/layouts/ChordAnalysisPanel.vue';
import { useChordService } from '@/services/useChordService';
import { useEditorStore } from '@/stores/editorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { CANVAS_CONFIG, FRETBOARD_SCALE_MAP, WORKBENCH_LAYOUT } from '@/utils/constants';
import { computed, ref } from 'vue';

const editorStore = useEditorStore();
const settingsStore = useSettingsStore();
const chordService = useChordService();
const FretBoardCaptureArea = ref<HTMLDivElement>();

const dynamicHeight = computed(() => {
  const baseVerticalSpace = WORKBENCH_LAYOUT.BASE_VERTICAL_PADDING;
  const rawCanvasHeight =
    CANVAS_CONFIG.OFFSET_Y_TOP + editorStore.fretCount * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.OFFSET_Y_BOTTOM;
  const currentScale = FRETBOARD_SCALE_MAP[editorStore.fretCount] || 1.0;
  const realBoardHeight = rawCanvasHeight * currentScale;
  return `${baseVerticalSpace + realBoardHeight}px`;
});

const isFloatingBarVisible = computed(() => {
  const cleanName = editorStore.currentChordName ? editorStore.currentChordName.trim() : '';
  const hasModified =
    cleanName !== '' ||
    !editorStore.isFretBoardEmpty ||
    editorStore.capo > 0 ||
    editorStore.fretCount > 3 ||
    editorStore.editingId !== null;
  return hasModified;
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
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: flex-start; /* 保持顶部对齐 */
  justify-content: center; /* 中间指板卡片完美居中 */
  padding: 2rem;
  padding-top: 3.5rem; /* 控制中间与右侧卡片统一的顶部边距 */
  padding-bottom: 6.15rem;
  overflow: hidden;
  box-sizing: border-box;
  pointer-events: none;
}

.workbench-card {
  pointer-events: auto;
  background-color: var(--bg-panel);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--glass-border);
  border-radius: @radius-md;
  box-shadow: @shadow-floating;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-evenly;
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
  position: absolute;
  bottom: 1.8rem;
  z-index: 10;
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.5rem;
  background-color: var(--bg-panel);
  backdrop-filter: blur(30px);
  -webkit-backdrop-filter: blur(30px);
  border: 1px solid var(--glass-border);
  border-radius: 9999px;
  box-shadow: @shadow-floating;
  box-sizing: border-box;
}

.bar-divider {
  width: 1px;
  height: 1rem;
  background-color: var(--border-base);
  opacity: 0.6;
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
  position: relative;
  width: 100%;
  display: flex;
  justify-content: center;
  z-index: 0;
  flex-shrink: 0;
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
  transform: translateY(20px) scale(0.95);
}
</style>
