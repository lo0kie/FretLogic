<template>
  <div
    ref="fretBoardRef"
    class="fretBoard-container relative touch-action-none flex flex-col items-center select-none"
    :style="{
      width: `${CANVAS_CONFIG.BOARD_WIDTH}px`,
      height:
        CANVAS_CONFIG.OFFSET_Y_TOP +
        chordLabStore.fretCount * CANVAS_CONFIG.FRET_HEIGHT +
        CANVAS_CONFIG.OFFSET_Y_BOTTOM +
        'px',
      transform: `scale(${1 - (chordLabStore.fretCount - 3) * 0.06})`,
      transformOrigin: 'top center',
    }"
    @contextmenu.prevent="handleCanvasRightClick"
  >
    <div class="w-full h-[80px] relative pointer-events-none">
      <template v-for="(fretVal, sIdx) in chordLabStore.selectedFrets" :key="'os-' + sIdx">
        <button
          v-if="fretVal === -1"
          :key="'muted-' + sIdx"
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
          @click.stop="handleLocalToggleOpenString(sIdx)"
          @contextmenu.prevent.stop="handleOpenStringRightClick(sIdx)"
          class="absolute w-10 h-10 rounded-full border flex items-center justify-center font-bold text-[22px] pointer-events-auto shadow-sm active:scale-90 transition-all duration-75"
          :class="[
            chordLabStore.rootMark === sIdx
              ? 'border-amber-500 dark:border-amber-400 text-white dark:text-slate-800 bg-amber-500 dark:bg-amber-400 shadow-[0_2px_4px_rgba(245,158,11,0.3)] dark:shadow-[0_2px_8px_rgba(251,191,36,0.4)]'
              : 'border-blue-600/30 dark:border-blue-500 text-blue-600 dark:text-blue-500 bg-blue-600/10 dark:bg-blue-500/15',
          ]"
          :style="{ left: `${getStrX(sIdx)}px`, transform: 'translateX(-50%)', top: '10px' }"
        >
          <span>{{ ['E', 'A', 'D', 'G', 'B', 'E'][sIdx] }}</span>
        </button>

        <button
          v-else
          :key="'pressed-shield-' + sIdx"
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
        stroke-width="4"
        style="pointer-events: none"
      />

      <line
        v-for="f in chordLabStore.fretCount + 1"
        :key="'fret-line-' + f"
        :x1="CANVAS_CONFIG.OFFSET_X"
        :y1="(f - 1) * CANVAS_CONFIG.FRET_HEIGHT"
        :x2="CANVAS_CONFIG.BOARD_WIDTH - 31"
        :y2="(f - 1) * CANVAS_CONFIG.FRET_HEIGHT"
        :stroke="chordLabStore.isDarkMode ? '#334155' : '#cbd5e1'"
        stroke-width="4"
        style="pointer-events: none"
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
        <g
          v-if="fret > 0 && fret <= chordLabStore.fretCount"
          class="cursor-pointer"
          style="pointer-events: auto"
          @contextmenu.prevent.stop="handleFretRightClick(sIdx)"
        >
          <circle
            :cx="getStrX(sIdx)"
            :cy="(fret - 1) * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.FRET_HEIGHT / 2"
            r="28"
            :fill="
              chordLabStore.rootMark === sIdx
                ? chordLabStore.isDarkMode
                  ? '#fbbf24'
                  : '#f59e0b'
                : chordLabStore.isDarkMode
                  ? '#3b82f6'
                  : '#2563eb'
            "
            style="filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.15)); transition: fill 0.15s"
          />
          <text
            :x="getStrX(sIdx)"
            :y="(fret - 1) * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.FRET_HEIGHT / 2"
            text-anchor="middle"
            dy="0.36em"
            font-size="22"
            font-weight="700"
            :fill="chordLabStore.rootMark === sIdx && chordLabStore.isDarkMode ? '#1e293b' : '#ffffff'"
            style="
              font-family:
                system-ui,
                -apple-system,
                sans-serif;
            "
          >
            {{ calcNoteLabel(sIdx, fret, chordLabStore.capo) }}
          </text>
        </g>
      </template>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { useFretboardInteraction } from '@/composables/useFretboardInteraction';
import { CANVAS_CONFIG } from '@/constants';
import { useChordLabStore } from '@/stores/chordLabStore';
import { calcNoteLabel } from '@/utils/musicTheory';
import { ref } from 'vue';

const chordLabStore = useChordLabStore();
const fretBoardRef = ref<HTMLDivElement | null>(null);

const getStrX = (i: number) => CANVAS_CONFIG.OFFSET_X + i * CANVAS_CONFIG.STRING_SPACING;

// 🌟 核心：引入并激活解耦的交互逻辑
const { handleLocalToggleOpenString, handleOpenStringRightClick, handleFretRightClick, handleCanvasRightClick } =
  useFretboardInteraction(fretBoardRef);
</script>
