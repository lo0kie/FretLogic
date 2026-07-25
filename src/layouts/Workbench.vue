<template>
  <div class="workbench-layout-wrapper">
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
  </div>
</template>

<script setup lang="ts">
import Fretboard from '@/components/Fretboard.vue';
import { useEditorStore } from '@/stores/editorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { CANVAS_CONFIG, FRETBOARD_SCALE_MAP, WORKBENCH_LAYOUT } from '@/utils/constants';
import { computed, ref } from 'vue';

const editorStore = useEditorStore();
const settingsStore = useSettingsStore();
const FretBoardCaptureArea = ref<HTMLDivElement>();

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

/* 🌟 核心修改：绝对定位脱离 Flex 布局流，永远在整个窗口内正中间居中 */
.workbench-layout-wrapper {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  overflow: hidden;
  box-sizing: border-box;
  pointer-events: none; /* 防止遮挡底层的点击，内部卡片开启 pointer-events */
}

.workbench-card {
  pointer-events: auto; /* 恢复卡片交互 */
  background-color: var(--bg-panel);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--glass-border);
  border-radius: @radius-xl;
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

  :global(.dark) & {
    box-shadow: @shadow-floating-dark;
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
  font-size: 3.8rem;
  line-height: 1;
  letter-spacing: -0.04em;
  box-sizing: border-box;
  transition: all 0.25s ease;

  &::placeholder {
    color: var(--text-disabled);
    opacity: 0.6;
  }

  &.has-name {
    color: var(--text-title);
  }

  &.is-empty {
    opacity: 0.25;
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
</style>
