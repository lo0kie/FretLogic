<template>
  <div
    ref="fretBoardRef"
    class="fretBoard-container relative touch-action-none flex flex-col items-center select-none"
    title="💡 左键点击/滑动：添加按压音符&#10;💡 右键点击：设为根音&#10;💡 中键点击：切换升降号(如A#⇄Bb)&#10;💡 鼠标滚轮：切换吉他把位"
    :style="{
      width: `${CANVAS_CONFIG.BOARD_WIDTH}px`,
      height: `${rawHeight}px`,
      transform: `scale(${fretboardScale})`,
      transformOrigin: 'top center',
      marginBottom: `-${rawHeight * (1 - fretboardScale)}px`,
    }"
    @contextmenu.prevent="handleCanvasRightClick"
  >
    <div class="w-full h-[80px] relative pointer-events-none">
      <template v-for="(fretVal, sIdx) in chordLabStore.selectedFrets" :key="'os-' + sIdx">
        <button
          v-if="fretVal === -1"
          :key="'muted-' + sIdx"
          title="左键：切换为空弦音&#10;右键：设为根音"
          @click.stop="handleLocalToggleOpenString(sIdx)"
          @contextmenu.prevent.stop="handleOpenStringRightClick(sIdx)"
          class="absolute w-10 h-10 rounded-full border flex items-center justify-center font-bold text-[22px] pointer-events-auto shadow-sm active:scale-90 transition-none border-red-500/30 dark:border-red-500/40 text-red-500 dark:text-red-400 bg-red-500/10 dark:bg-red-500/15"
          :style="{ left: `${getStrX(sIdx)}px`, transform: 'translateX(-50%)', top: '10px' }"
        >
          <span>✕</span>
        </button>

        <button
          v-else-if="fretVal === 0"
          :key="'open-' + sIdx"
          title="左键：切换为静音(✕)&#10;右键：设为/取消根音&#10;中键：切换等音名(b)"
          @click.stop="handleLocalToggleOpenString(sIdx)"
          @contextmenu.prevent.stop="handleOpenStringRightClick(sIdx)"
          @mousedown.middle.prevent.stop="handleFretMiddleClick(sIdx)"
          class="absolute w-10 h-10 rounded-full border flex items-center justify-center font-bold text-[22px] pointer-events-auto shadow-sm active:scale-90 transition-all duration-75"
          :class="[
            chordLabStore.rootMark === sIdx
              ? 'border-amber-500 dark:border-amber-400 text-white dark:text-slate-800 bg-amber-500 dark:bg-amber-400 shadow-[0_2px_4px_rgba(245,158,11,0.3)] dark:shadow-[0_2px_8px_rgba(251,191,36,0.4)]'
              : 'border-blue-600/30 dark:border-blue-500 text-blue-600 dark:text-blue-500 bg-blue-600/10 dark:bg-blue-500/15',
          ]"
          :style="{ left: `${getStrX(sIdx)}px`, transform: 'translateX(-50%)', top: '10px' }"
        >
          <span>{{ calcNoteLabel(sIdx, 0, chordLabStore.capo, chordLabStore.useFlat[sIdx]) }}</span>
        </button>

        <button
          v-else
          :key="'pressed-shield-' + sIdx"
          title="左键：取消该品位按压&#10;右键：设为/取消根音"
          @click.stop="handleLocalToggleOpenString(sIdx)"
          @contextmenu.prevent.stop="handleOpenStringRightClick(sIdx)"
          class="absolute w-10 h-10 opacity-0 pointer-events-auto bg-transparent border-none outline-none cursor-pointer"
          :style="{ left: `${getStrX(sIdx)}px`, transform: 'translateX(-50%)', top: '20px' }"
        ></button>
      </template>
    </div>

    <svg
      :width="CANVAS_CONFIG.BOARD_WIDTH"
      :height="chordLabStore.fretCount * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.OFFSET_Y_BOTTOM"
      :viewBox="`0 0 ${CANVAS_CONFIG.BOARD_WIDTH} ${chordLabStore.fretCount * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.OFFSET_Y_BOTTOM}`"
      style="overflow: visible"
      class="w-full pointer-events-auto"
    >
      <line
        v-for="s in 6"
        :key="'string-' + s"
        :x1="getStrX(s - 1)"
        y1="0"
        :x2="getStrX(s - 1)"
        :y2="chordLabStore.fretCount * CANVAS_CONFIG.FRET_HEIGHT"
        :stroke="chordLabStore.isDarkMode ? '#475569' : '#94a3b8'"
        :stroke-width="4"
        class="string-line"
        style="pointer-events: none"
        shape-rendering="crispEdges"
      />

      <line
        v-for="f in chordLabStore.fretCount + 1"
        :key="'fret-line-' + f"
        :x1="CANVAS_CONFIG.OFFSET_X"
        :y1="(f - 1) * CANVAS_CONFIG.FRET_HEIGHT"
        :x2="CANVAS_CONFIG.BOARD_WIDTH - 31"
        :y2="(f - 1) * CANVAS_CONFIG.FRET_HEIGHT"
        :stroke="chordLabStore.isDarkMode ? '#475569' : '#94a3b8'"
        stroke-width="4"
        style="pointer-events: none"
        shape-rendering="crispEdges"
      />

      <rect
        :x="CANVAS_CONFIG.OFFSET_X - 2"
        y="-6"
        width="384"
        height="8"
        :fill="chordLabStore.isDarkMode ? '#f1f5f9' : '#475569'"
        style="pointer-events: none"
      />

      <template v-for="f in chordLabStore.fretCount + 1" :key="'fret-text-' + f">
        <text
          x="10"
          :y="(f - 1) * CANVAS_CONFIG.FRET_HEIGHT"
          text-anchor="middle"
          dy="0.36em"
          font-size="28"
          font-weight="900"
          :fill="chordLabStore.isDarkMode ? '#64748b' : '#94a3b8'"
          v-if="f > 1 && f <= chordLabStore.fretCount"
          style="
            pointer-events: none;
            font-family:
              system-ui,
              -apple-system,
              sans-serif;
          "
        >
          {{ chordLabStore.capo > 0 ? chordLabStore.capo + f - 1 : f - 1 }}
        </text>
      </template>

      <template v-for="(fret, sIdx) in chordLabStore.selectedFrets" :key="'finger-' + sIdx">
        <Transition name="fade-fast">
          <g
            v-if="fret > 0 && fret <= chordLabStore.fretCount"
            :key="`pos-${fret}`"
            class="cursor-pointer"
            style="pointer-events: auto"
            @contextmenu.prevent.stop="handleFretRightClick(sIdx)"
            @mousedown.middle.prevent.stop="handleFretMiddleClick(sIdx)"
          >
            <circle
              :cx="getStrX(sIdx)"
              :cy="(fret - 1) * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.FRET_HEIGHT / 2"
              r="28"
              :fill="getFingerColor(sIdx)"
              class="finger-circle"
              style="filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.15))"
            />
            <text
              :x="getStrX(sIdx)"
              :y="(fret - 1) * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.FRET_HEIGHT / 2"
              text-anchor="middle"
              dy="0.36em"
              font-size="22"
              font-weight="700"
              :fill="getFingerTextColor(sIdx)"
              class="finger-text"
              style="
                font-family:
                  system-ui,
                  -apple-system,
                  sans-serif;
              "
            >
              {{ calcNoteLabel(sIdx, fret, chordLabStore.capo, chordLabStore.useFlat[sIdx]) }}
            </text>
          </g>
        </Transition>
      </template>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { useFretboardInteraction } from '@/composables/useFretboardInteraction';
import { CANVAS_CONFIG } from '@/constants';
import { useChordLabStore } from '@/stores/chordLabStore';
import { calcNoteLabel } from '@/utils/musicTheory';
import { computed, ref } from 'vue';

const chordLabStore = useChordLabStore();
const fretBoardRef = ref<HTMLDivElement | null>(null);

const getStrX = (i: number) => CANVAS_CONFIG.OFFSET_X + i * CANVAS_CONFIG.STRING_SPACING;

const rawHeight = computed(() => {
  return (
    CANVAS_CONFIG.OFFSET_Y_TOP + chordLabStore.fretCount * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.OFFSET_Y_BOTTOM
  );
});

const fretboardScale = computed(() => {
  const scaleMap: Record<number, number> = { 3: 1.0, 4: 0.92, 5: 0.85 };
  return scaleMap[chordLabStore.fretCount] || 1.0;
});

// 🌟 所有控制权外包给可复用的 composition 函数，彻底解耦
const {
  handleLocalToggleOpenString,
  handleOpenStringRightClick,
  handleFretRightClick,
  handleCanvasRightClick,
  handleFretMiddleClick,
} = useFretboardInteraction(fretBoardRef);

const getFingerColor = (sIdx: number) => {
  if (chordLabStore.rootMark === sIdx) return chordLabStore.isDarkMode ? '#fbbf24' : '#f59e0b';
  return chordLabStore.isDarkMode ? '#3b82f6' : '#2563eb';
};

const getFingerTextColor = (sIdx: number) => {
  return chordLabStore.rootMark === sIdx && chordLabStore.isDarkMode ? '#1e293b' : '#ffffff';
};
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';
.fretBoard-container {
  transition:
    height @duration-slow @bezier-standard,
    transform @duration-slow @bezier-standard,
    margin-bottom @duration-slow @bezier-standard;
}
.string-line {
  transition: y2 @duration-slow @bezier-standard;
}
.finger-circle,
.finger-text {
  transition: fill @duration-fast ease;
}
.fade-fast-enter-active,
.fade-fast-leave-active {
  transition: opacity 0.15s ease-out;
}
.fade-fast-enter-from,
.fade-fast-leave-to {
  opacity: 0;
}
</style>
