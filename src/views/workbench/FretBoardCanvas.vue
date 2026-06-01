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
            top: '10px',
            transform: 'translateX(-50%)',
            width: 'auto',
          }"
        >
          <button
            @click.stop="handleLocalToggleOpenString(sIdx)"
            @contextmenu.prevent.stop="handleOpenStringRightClick(sIdx)"
            @mousedown.middle.prevent.stop="str.fret === 0 ? handleFretMiddleClick(sIdx) : null"
            class="w-10 h-10 box-border pointer-events-auto shadow-sm flex items-center justify-center rounded-full border-[3px]"
            :class="[
              str.fret > 0 ? 'is-fret-pressed active:scale-100' : 'active:scale-90',
              getOpenStringStatusClass(str),
            ]"
            :style="getOpenStringStyle(str)"
          >
            <template v-if="str.fret <= 0">
              <template v-if="str.fret === -1">
                <X class="w-4.5 h-4.5" stroke-width="2.5" />
              </template>

              <span v-else-if="str.fret === 0" class="font-black text-lg tracking-tighter open-note-text">
                {{ calcNoteLabel(sIdx, 0, chordLabStore.capo, str.preferFlat, chordLabStore.activeBaseStrings) }}
              </span>
            </template>
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

      <g v-for="i in chordLabStore.fretCount" :key="'fret-text-' + i">
        <text
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
      </g>

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
import { FRETBOARD_COLORS } from '@/constants/theme';
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
    if (str.isRoot) return '';
    return 'border-[#93c5fd] text-[#1d4ed8] dark:border-[#1e3a8a] dark:text-[#93c5fd] bg-transparent';
  }
  return '';
};

const getOpenStringStyle = (str: GuitarStringEntity) => {
  if (str.fret === 0 && str.isRoot) {
    const isDark = chordLabStore.isDarkMode;
    const bg = isDark ? FRETBOARD_COLORS.openRootBgDark : FRETBOARD_COLORS.openRootBgLight;
    const text = isDark ? FRETBOARD_COLORS.openRootTextDark : FRETBOARD_COLORS.openRootTextLight;
    const shadowColor = isDark ? 'rgba(251,191,36,0.4)' : 'rgba(245,158,11,0.3)';

    return {
      backgroundColor: bg,
      borderColor: bg,
      color: text,
      boxShadow: `0 2px ${isDark ? '8px' : '4px'} ${shadowColor}`,
    };
  }
  return {};
};

const getFingerColor = (str: GuitarStringEntity) => {
  if (str.isRoot) return chordLabStore.isDarkMode ? FRETBOARD_COLORS.rootDark : FRETBOARD_COLORS.rootLight;
  return chordLabStore.isDarkMode ? FRETBOARD_COLORS.normalDark : FRETBOARD_COLORS.normalLight;
};

const getFingerTextColor = (str: GuitarStringEntity) => {
  return str.isRoot && chordLabStore.isDarkMode ? FRETBOARD_COLORS.textRootDark : FRETBOARD_COLORS.textRootLight;
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

// 🌟 终极修复：把时间轴上的 opacity 过渡动画无情砍掉，仅保留纯粹、极速的微小缩放反馈
button {
  transition: transform 0.08s @bezier-standard;

  // 当被按下时，瞬间进行物理隐藏，零延迟，坚决不给任何多余的时差空间
  &.is-fret-pressed {
    opacity: 0 !important;
    background-color: transparent !important;
    border-color: transparent !important;
    box-shadow: none !important;
    pointer-events: auto !important;
  }
}

.string-line {
  transition: y2 @duration-slow @bezier-standard;
}
.finger-circle,
.finger-text {
  transition: fill @duration-fast ease;
}
</style>
