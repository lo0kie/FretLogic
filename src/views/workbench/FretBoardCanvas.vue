<template>
  <div
    ref="fretBoardRef"
    class="fretBoard-container relative touch-action-none flex flex-col items-center select-none"
    :style="{
      width: `${CANVAS_CONFIG.BOARD_WIDTH}px`,
      height: `${rawHeight}px`,
      transform: `scale(${fretboardScale})`,
      transformOrigin: 'top center',
      marginBottom: `-${rawHeight * (1 - fretboardScale)}px`,
    }"
    @contextmenu.prevent="handleCanvasRightClick"
  >
    <div class="w-full relative pointer-events-none" :style="{ height: `${CANVAS_CONFIG.OFFSET_Y_TOP}px` }">
      <template v-for="(fretVal, sIdx) in chordLabStore.selectedFrets" :key="'os-' + sIdx">
        <GlobalTooltip
          placement="top"
          :content="fretVal > 0 ? undefined : '🖱️ 左键：切换空弦/静音 \n 🖱️ 右键：设为根音'"
          :style="{
            position: 'absolute',
            left: `${getStrX(sIdx)}px`,
            top: fretVal > 0 ? '20px' : '10px',
            transform: 'translateX(-50%)',
            width: 'auto',
          }"
        >
          <button
            @click.stop="handleLocalToggleOpenString(sIdx)"
            @contextmenu.prevent.stop="handleOpenStringRightClick(sIdx)"
            @mousedown.middle.prevent.stop="fretVal === 0 ? handleFretMiddleClick(sIdx) : null"
            class="w-10 h-10 box-border pointer-events-auto shadow-sm transition-all duration-75 flex items-center justify-center"
            :class="[
              fretVal > 0
                ? 'opacity-0 bg-transparent border-none outline-none cursor-pointer'
                : 'rounded-full border-[3px] active:scale-90',
              getOpenStringStatusClass(fretVal, sIdx),
            ]"
          >
            <template v-if="fretVal === -1">
              <X class="w-4.5 h-4.5" stroke-width="2.5" />
            </template>

            <span v-else-if="fretVal === 0" class="font-black text-lg tracking-tighter open-note-text">
              {{
                calcNoteLabel(sIdx, 0, chordLabStore.capo, chordLabStore.useFlat[sIdx], chordLabStore.activeBaseStrings)
              }}
            </span>
          </button>
        </GlobalTooltip>
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
        :stroke="chordLabStore.isDarkMode ? '#cbd5e1' : '#1e293b'"
        :stroke-width="4"
        class="string-line"
        style="pointer-events: none"
        shape-rendering="crispEdges"
      />

      <line
        v-for="f in chordLabStore.fretCount"
        :key="'fret-line-' + f"
        :x1="CANVAS_CONFIG.OFFSET_X"
        :y1="f * CANVAS_CONFIG.FRET_HEIGHT"
        :x2="getStrX(5)"
        :y2="f * CANVAS_CONFIG.FRET_HEIGHT"
        :stroke="chordLabStore.isDarkMode ? '#94a3b8' : '#334155'"
        stroke-width="4"
        style="pointer-events: none"
        shape-rendering="crispEdges"
      />

      <rect
        :x="CANVAS_CONFIG.OFFSET_X - 2"
        y="-4"
        :width="5 * CANVAS_CONFIG.STRING_SPACING + 4"
        height="8"
        :fill="chordLabStore.isDarkMode ? '#ffffff' : '#0f172a'"
        style="pointer-events: none"
      />

      <text
        v-for="i in chordLabStore.fretCount"
        :key="'fret-text-' + i"
        :x="(CANVAS_CONFIG.OFFSET_X - 32) / 2"
        :y="i * CANVAS_CONFIG.FRET_HEIGHT"
        text-anchor="middle"
        dominant-baseline="central"
        dy="-2px"
        font-size="28"
        font-weight="900"
        :fill="chordLabStore.isDarkMode ? '#cbd5e1' : '#1e293b'"
        style="pointer-events: none"
      >
        {{ chordLabStore.capo > 0 ? chordLabStore.capo + i : i }}
      </text>

      <template v-for="(fret, sIdx) in chordLabStore.selectedFrets" :key="'finger-' + sIdx">
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
            font-size="24"
            font-weight="900"
            :fill="getFingerTextColor(sIdx)"
            class="finger-text"
          >
            {{
              calcNoteLabel(
                sIdx,
                fret,
                chordLabStore.capo,
                chordLabStore.useFlat[sIdx],
                chordLabStore.activeBaseStrings
              )
            }}
          </text>
        </g>
      </template>
    </svg>
  </div>
</template>

<script setup lang="ts">
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { useFretboardInteraction } from '@/composables/useFretboardInteraction';
import { CANVAS_CONFIG } from '@/constants';
import { FRETBOARD_SCALE_MAP } from '@/constants/fretboard';
import { useChordLabStore } from '@/stores/chordLabStore';
import { calcNoteLabel } from '@/utils/musicTheory';
import { X } from '@lucide/vue';
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
  return FRETBOARD_SCALE_MAP[chordLabStore.fretCount] || 1.0;
});

const {
  handleLocalToggleOpenString,
  handleOpenStringRightClick,
  handleFretRightClick,
  handleCanvasRightClick,
  handleFretMiddleClick,
} = useFretboardInteraction(fretBoardRef);

const getOpenStringStatusClass = (fretVal: number, sIdx: number) => {
  if (fretVal === -1) {
    return 'border-[#dc2626] text-[#dc2626] dark:border-[#f87171] dark:text-[#f87171] bg-transparent';
  }
  if (fretVal === 0) {
    if (chordLabStore.rootMark === sIdx) {
      return 'bg-[#f59e0b] border-[#f59e0b] text-[#ffffff] shadow-[0_2px_4px_rgba(245,158,11,0.3)] dark:bg-[#fbbf24] dark:border-[#fbbf24] dark:text-[#0f172a] dark:shadow-[0_2px_8px_rgba(251,191,36,0.4)]';
    }
    return 'border-[#93c5fd] text-[#1d4ed8] dark:border-[#1e3a8a] dark:text-[#93c5fd] bg-transparent';
  }
  return '';
};

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

.open-note-text {
  display: inline-block;
  line-height: 1;
  margin-bottom: 1.5px;
}

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
</style>
