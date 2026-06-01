/** * @Author likan * @Date 2026-06-01 * @Filepath fret-logic/src/views/workbench/FretBoardCanvas.vue */

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
      <template v-for="(str, sIdx) in chordLabStore.strings" :key="'os-' + sIdx">
        <GlobalTooltip
          placement="top"
          :content="str.fret > 0 ? undefined : '🖱️ 左键：切换空弦/静音 \n 🖱️ 右键：设为根音'"
          :style="{
            position: 'absolute',
            left: `${getStrX(sIdx)}px`,
            top: str.fret > 0 ? '20px' : '10px',
            transform: 'translateX(-50%)',
            width: 'auto',
          }"
        >
          <button
            @click.stop="handleLocalToggleOpenString(sIdx)"
            @contextmenu.prevent.stop="handleOpenStringRightClick(sIdx)"
            @mousedown.middle.prevent.stop="str.fret === 0 ? handleFretMiddleClick(sIdx) : null"
            class="w-10 h-10 box-border pointer-events-auto shadow-sm transition-all duration-75 flex items-center justify-center"
            :class="[
              str.fret > 0
                ? 'opacity-0 bg-transparent border-none outline-none cursor-pointer'
                : 'rounded-full border-[3px] active:scale-90',
              getOpenStringStatusClass(str),
            ]"
          >
            <template v-if="str.fret === -1">
              <X class="w-4.5 h-4.5" stroke-width="2.5" />
            </template>

            <span v-else-if="str.fret === 0" class="font-black text-lg tracking-tighter open-note-text">
              {{ calcNoteLabel(sIdx, 0, chordLabStore.capo, str.preferFlat, chordLabStore.activeBaseStrings) }}
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

      <g
        v-for="i in chordLabStore.fretCount"
        :key="'fret-text-' + i"
        @click="chordLabStore.barreFret = chordLabStore.barreFret === i ? 0 : i"
        class="cursor-pointer group"
        style="pointer-events: auto"
      >
        <title>点击手动标记/解除横按 (Barre)</title>
        <rect
          :x="0"
          :y="(i - 1) * CANVAS_CONFIG.FRET_HEIGHT"
          :width="CANVAS_CONFIG.OFFSET_X - 10"
          :height="CANVAS_CONFIG.FRET_HEIGHT"
          fill="transparent"
        />
        <text
          :x="(CANVAS_CONFIG.OFFSET_X - 32) / 2"
          :y="i * CANVAS_CONFIG.FRET_HEIGHT"
          text-anchor="middle"
          dominant-baseline="central"
          dy="-2px"
          font-size="28"
          font-weight="900"
          :fill="
            chordLabStore.barreFret === i
              ? chordLabStore.isDarkMode
                ? '#60a5fa'
                : '#3b82f6'
              : chordLabStore.isDarkMode
                ? '#cbd5e1'
                : '#1e293b'
          "
          style="pointer-events: none; transition: fill 0.2s ease"
        >
          {{ chordLabStore.capo > 0 ? chordLabStore.capo + i : i }}
        </text>
      </g>

      <rect
        v-for="barre in barreLines"
        :key="'barre-' + barre.fret"
        :x="getStrX(barre.minS) - 16"
        :y="(barre.fret - 1) * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.FRET_HEIGHT / 2 - 16"
        :width="getStrX(barre.maxS) - getStrX(barre.minS) + 32"
        height="32"
        rx="16"
        ry="16"
        :fill="chordLabStore.isDarkMode ? '#3b82f6' : '#2563eb'"
        class="transition-all duration-200"
        style="pointer-events: none; filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))"
      />

      <template v-for="(str, sIdx) in chordLabStore.strings" :key="'finger-' + sIdx">
        <g
          v-if="str.fret > 0 && str.fret <= chordLabStore.fretCount"
          :key="`pos-${str.fret}`"
          class="cursor-pointer"
          style="pointer-events: auto"
          @contextmenu.prevent.stop="handleFretRightClick(sIdx)"
          @mousedown.middle.prevent.stop="handleFretMiddleClick(sIdx)"
        >
          <circle
            :cx="getStrX(sIdx)"
            :cy="(str.fret - 1) * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.FRET_HEIGHT / 2"
            r="28"
            :fill="getFingerColor(str)"
            class="finger-circle"
            style="filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.15))"
          />
          <text
            :x="getStrX(sIdx)"
            :y="(str.fret - 1) * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.FRET_HEIGHT / 2"
            text-anchor="middle"
            dy="0.36em"
            font-size="24"
            font-weight="900"
            :fill="getFingerTextColor(str)"
            class="finger-text"
          >
            {{ calcNoteLabel(sIdx, str.fret, chordLabStore.capo, str.preferFlat, chordLabStore.activeBaseStrings) }}
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
import type { GuitarStringEntity } from '@/types/chord';
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

// 🌟 手动控制：读取手动指定的 barreFret，并自适应锁定其实际跨越的有效物理琴弦范围
const barreLines = computed(() => {
  const f = chordLabStore.barreFret;
  if (!f || f <= 0 || f > chordLabStore.fretCount) return [];

  const stringsOnFret: number[] = [];
  // 遍历 6 根实体弦，智能提取被按在此品或被横按涵盖的弦索引
  chordLabStore.strings.forEach((str, sIdx) => {
    if (str.fret >= f) stringsOnFret.push(sIdx);
  });

  if (stringsOnFret.length > 0) {
    return [
      {
        fret: f,
        minS: Math.min(...stringsOnFret),
        maxS: Math.max(...stringsOnFret),
      },
    ];
  } else {
    // 若还没有在该品按弦，默认横按条贯穿全全弦区
    return [{ fret: f, minS: 0, maxS: 5 }];
  }
});

const {
  handleLocalToggleOpenString,
  handleOpenStringRightClick,
  handleFretRightClick,
  handleCanvasRightClick,
  handleFretMiddleClick,
} = useFretboardInteraction(fretBoardRef);

const getOpenStringStatusClass = (str: GuitarStringEntity) => {
  if (str.fret === -1) {
    return 'border-[#dc2626] text-[#dc2626] dark:border-[#f87171] dark:text-[#f87171] bg-transparent';
  }
  if (str.fret === 0) {
    if (str.isRoot) {
      return 'bg-[#f59e0b] border-[#f59e0b] text-[#ffffff] shadow-[0_2px_4px_rgba(245,158,11,0.3)] dark:bg-[#fbbf24] dark:border-[#fbbf24] dark:text-[#0f172a] dark:shadow-[0_2px_8px_rgba(251,191,36,0.4)]';
    }
    return 'border-[#93c5fd] text-[#1d4ed8] dark:border-[#1e3a8a] dark:text-[#93c5fd] bg-transparent';
  }
  return '';
};

const getFingerColor = (str: GuitarStringEntity) => {
  if (str.isRoot) return chordLabStore.isDarkMode ? '#fbbf24' : '#f59e0b';
  return chordLabStore.isDarkMode ? '#3b82f6' : '#2563eb';
};

const getFingerTextColor = (str: GuitarStringEntity) => {
  return str.isRoot && chordLabStore.isDarkMode ? '#1e293b' : '#ffffff';
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
