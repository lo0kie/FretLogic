<template>
  <div class="fretboard-layout-scaler" :style="{ width: `${realScaledWidth}px`, height: `${realScaledHeight}px` }">
    <div
      ref="fretBoardRef"
      class="fretboard-container"
      :class="[interactive ? 'is-interactive' : 'is-disabled']"
      :style="{
        width: `${CANVAS_CONFIG.BOARD_WIDTH}px`,
        height: `${rawHeight}px`,
        transform: `scale(${fretboardScale})`,
        transformOrigin: 'top left',
      }"
      @contextmenu.prevent.stop="handleRightClickRoot"
    >
      <div class="open-strings-wrapper" :style="{ height: `${CANVAS_CONFIG.OFFSET_Y_TOP}px` }">
        <template v-for="(str, sIdx) in strings" :key="'os-' + sIdx">
          <GlobalTooltip
            placement="top"
            :content="
              interactive && str.fret <= 0 ? '左键：切换空弦/静音 \n 右键：设为根音 \n 滚轮：切换升降号' : undefined
            "
            :style="{
              position: 'absolute',
              left: `${stringXPositions[sIdx]}px`,
              top: '10px',
              transform: 'translateX(-50%)',
              width: 'auto',
            }"
          >
            <button
              @click.stop="handleLocalToggleOpenString(sIdx)"
              @dblclick.prevent.stop="handleTogglePitchName(sIdx)"
              class="open-string-btn"
              :class="[
                str.fret > 0 ? 'is-fret-pressed' : 'is-fret-available',
                getOpenStringStatusClass(str),
                interactive ? 'allow-events' : 'block-events',
              ]"
              :style="getOpenStringStyle(str)"
            >
              <template v-if="str.fret <= 0">
                <X v-if="isMuted(str)" class="mute-icon" stroke-width="3" />
                <span v-else-if="isOpen(str)" class="open-note-text">
                  {{ calcNoteLabel(sIdx, 0, capo, str.preferFlat, activeBaseStrings) }}
                </span>
              </template>
            </button>
          </GlobalTooltip>
        </template>
      </div>

      <svg
        :width="CANVAS_CONFIG.BOARD_WIDTH"
        :height="fretCount * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.OFFSET_Y_BOTTOM"
        :viewBox="`0 0 ${CANVAS_CONFIG.BOARD_WIDTH} ${fretCount * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.OFFSET_Y_BOTTOM}`"
        style="overflow: visible"
        class="fretboard-svg"
      >
        <g v-memo="[fretCount, isDarkMode, capo]">
          <line
            v-for="s in 6"
            :key="'string-' + s"
            :x1="stringXPositions[s - 1]"
            y1="0"
            :x2="stringXPositions[s - 1]"
            :y2="fretCount * CANVAS_CONFIG.FRET_HEIGHT"
            :stroke="isDarkMode ? '#ffffff' : '#0f172a'"
            :stroke-width="FRETBOARD_LINE_WIDTH"
            class="string-line"
            style="pointer-events: none"
            shape-rendering="crispEdges"
          />
          <line
            v-for="f in fretCount"
            :key="'fret-line-' + f"
            :x1="CANVAS_CONFIG.OFFSET_X"
            :y1="f * CANVAS_CONFIG.FRET_HEIGHT"
            :x2="stringXPositions[5]"
            :y2="f * CANVAS_CONFIG.FRET_HEIGHT"
            :stroke="isDarkMode ? '#cbd5e1' : '#334155'"
            :stroke-width="FRETBOARD_LINE_WIDTH"
            style="pointer-events: none"
            shape-rendering="crispEdges"
          />
          <rect
            :x="CANVAS_CONFIG.OFFSET_X - FRETBOARD_LINE_WIDTH / 2"
            y="-4"
            :width="5 * CANVAS_CONFIG.STRING_SPACING + FRETBOARD_LINE_WIDTH"
            height="8"
            :fill="isDarkMode ? '#ffffff' : '#0f172a'"
            style="pointer-events: none"
            rx="2"
          />
          <text
            v-for="i in fretCount"
            :key="'fret-text-' + i"
            v-show="i < fretCount"
            :x="(CANVAS_CONFIG.OFFSET_X - 32) / 2"
            :y="i * CANVAS_CONFIG.FRET_HEIGHT"
            text-anchor="middle"
            dominant-baseline="central"
            dy="-2px"
            font-size="28"
            font-weight="900"
            :fill="isDarkMode ? '#e2e8f0' : '#475569'"
            style="pointer-events: none"
          >
            {{ capo > 0 ? capo + i : i }}
          </text>
        </g>

        <g
          v-if="
            interactive &&
            hoverPoint &&
            hoverPoint.fretIndex > 0 &&
            hoverPoint.fretIndex <= fretCount &&
            hoverPoint.stringIndex >= 0 &&
            hoverPoint.stringIndex <= 5
          "
          class="finger-predictive"
        >
          <circle
            :cx="stringXPositions[hoverPoint.stringIndex]"
            :cy="(hoverPoint.fretIndex - 1) * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.FRET_HEIGHT / 2"
            r="28"
            :fill="isDarkMode ? '#28282a' : '#ffffff'"
            style="pointer-events: none"
          />

          <circle
            :cx="stringXPositions[hoverPoint.stringIndex]"
            :cy="(hoverPoint.fretIndex - 1) * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.FRET_HEIGHT / 2"
            r="25.5"
            fill="transparent"
            :stroke="isDarkMode ? 'rgba(255, 255, 255, 0.45)' : 'rgba(60, 60, 67, 0.35)'"
            stroke-width="3"
            stroke-dasharray="4 4"
            style="pointer-events: none"
          />
        </g>

        <template v-for="(str, sIdx) in strings" :key="'finger-' + sIdx">
          <g
            v-if="str.fret > 0 && str.fret <= fretCount"
            :class="[interactive ? 'finger-interactive' : 'finger-disabled']"
            @dblclick.prevent.stop="handleTogglePitchName(sIdx)"
          >
            <circle
              :cx="stringXPositions[sIdx]"
              :cy="(str.fret - 1) * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.FRET_HEIGHT / 2"
              r="28"
              :fill="getFingerColor(str)"
              class="finger-circle"
              :class="{ 'is-root-glow': str.isRoot }"
            />
            <text
              :x="stringXPositions[sIdx]"
              :y="(str.fret - 1) * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.FRET_HEIGHT / 2"
              text-anchor="middle"
              dy="0.36em"
              font-size="24"
              font-weight="900"
              :fill="getFingerTextColor(str)"
              class="finger-text"
              style="pointer-events: none"
            >
              {{ calcNoteLabel(sIdx, str.fret, capo, str.preferFlat, activeBaseStrings) }}
            </text>
          </g>
        </template>
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { X } from '@lucide/vue';
import { useEventListener } from '@vueuse/core';
import { computed, onBeforeUnmount, onMounted, ref, toRaw } from 'vue';

import GlobalTooltip from '@/components/GlobalTooltip.vue';
import type { GuitarStringEntity, GuitarStringsModel } from '@/types';
import {
  CANVAS_CONFIG,
  FRETBOARD_COLORS,
  FRETBOARD_LINE_WIDTH,
  FRETBOARD_SCALE_MAP,
  INTERACTION_CONFIG,
} from '@/utils/constants';
import { cloneDeep } from '@/utils/dataParser';
import { calcNoteLabel, canTogglePitchAccidental, DEFAULT_TUNING_MAPPING, isMuted, isOpen } from '@/utils/musicTheory';

const props = withDefaults(
  defineProps<{
    strings: GuitarStringsModel;
    fretCount: number;
    capo: number;
    activeBaseStrings?: readonly number[];
    isDarkMode?: boolean;
    interactive?: boolean;
    scale?: number;
  }>(),
  { activeBaseStrings: () => DEFAULT_TUNING_MAPPING, isDarkMode: false, interactive: true, scale: 1.0 }
);

const emit = defineEmits<{
  (e: 'update:strings', value: GuitarStringsModel): void;
  (e: 'update:capo', value: number): void;
  (e: 'drag-status-change', isDragging: boolean): void;
}>();

const fretBoardRef = ref<HTMLDivElement | null>(null);
const hoverPoint = ref<{ stringIndex: number; fretIndex: number } | null>(null);

let lastCancelTime = 0;
let lastSIdx = -1;
let lastFIdx = -1;
let wheelAccumulator = 0;
let ticking = false;
let rAF_ID = 0;
const cleanupListeners: (() => void)[] = [];

const stringXPositions = computed(() =>
  Array.from({ length: 6 }, (_, i) => CANVAS_CONFIG.OFFSET_X + i * CANVAS_CONFIG.STRING_SPACING)
);

const getCanvasPoint = (clientX: number, clientY: number) => {
  const board = fretBoardRef.value?.getBoundingClientRect();
  if (!board) return null;
  const scaleX = board.width / CANVAS_CONFIG.BOARD_WIDTH;
  const scaleY = board.height / rawHeight.value;
  const x = (clientX - board.left) / scaleX;
  const y = (clientY - board.top) / scaleY;
  const stringIndex = Math.round((x - CANVAS_CONFIG.OFFSET_X) / CANVAS_CONFIG.STRING_SPACING);
  const fretAreaY = y - CANVAS_CONFIG.OFFSET_Y_TOP;
  const fretIndex = fretAreaY > 0 ? Math.floor(fretAreaY / CANVAS_CONFIG.FRET_HEIGHT) + 1 : 0;
  return { stringIndex, fretIndex };
};

const rawHeight = computed(
  () => CANVAS_CONFIG.OFFSET_Y_TOP + props.fretCount * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.OFFSET_Y_BOTTOM
);
const fretboardScale = computed(() => (FRETBOARD_SCALE_MAP[props.fretCount] || 1.0) * props.scale);
const realScaledWidth = computed(() => CANVAS_CONFIG.BOARD_WIDTH * fretboardScale.value);
const realScaledHeight = computed(() => rawHeight.value * fretboardScale.value);

const emitStringsUpdate = (mutator: (cloned: GuitarStringsModel) => void) => {
  if (!props.interactive) return;
  const cloned = cloneDeep(toRaw(props.strings));
  mutator(cloned);
  emit('update:strings', cloned);
};

const handleRightClickRoot = (e: MouseEvent) => {
  if (!props.interactive) return;

  const point = getCanvasPoint(e.clientX, e.clientY);
  if (!point) return;

  const { stringIndex: sIdx, fretIndex: fIdx } = point;
  if (sIdx < 0 || sIdx > 5) return;

  const currentStringAsset = props.strings[sIdx];
  let isNoteClicked = false;

  if (fIdx > 0 && fIdx <= props.fretCount && currentStringAsset.fret === fIdx) {
    isNoteClicked = true;
  } else if (fIdx === 0 && isOpen(currentStringAsset)) {
    isNoteClicked = true;
  }

  if (!isNoteClicked) return;

  emitStringsUpdate(cloned => {
    const wasRoot = cloned[sIdx].isRoot;
    cloned.forEach(s => {
      s.isRoot = false;
    });
    cloned[sIdx].isRoot = !wasRoot;
  });
};

const handleLocalToggleOpenString = (sIdx: number) => {
  emitStringsUpdate(cloned => {
    const str = cloned[sIdx];
    if (str.fret > 0) {
      str.fret = 0;
      str.isRoot = false;
    } else if (isOpen(str)) {
      str.fret = -1;
      str.isRoot = false;
    } else {
      str.fret = 0;
      str.isRoot = false;
    }
  });
};

const handleTogglePitchName = (sIdx: number) => {
  emitStringsUpdate(cloned => {
    const str = cloned[sIdx];
    if (canTogglePitchAccidental(sIdx, str.fret, props.capo, props.activeBaseStrings)) {
      str.preferFlat = !str.preferFlat;
    }
  });
};

const handleFingerClickLogic = (clientX: number, clientY: number, isMoveEvent = false) => {
  const point = getCanvasPoint(clientX, clientY);
  if (
    !point ||
    point.stringIndex < 0 ||
    point.stringIndex > 5 ||
    point.fretIndex < 1 ||
    point.fretIndex > props.fretCount
  )
    return;

  const { stringIndex: sIdx, fretIndex: fIdx } = point;
  if (isMoveEvent && lastSIdx === sIdx && lastFIdx === fIdx) return;

  emitStringsUpdate(cloned => {
    const str = cloned[sIdx];
    if (str.fret === fIdx) {
      str.fret = -1;
      str.isRoot = false;
      lastSIdx = -1;
      lastFIdx = -1;
      lastCancelTime = Date.now();
    } else {
      if (isMoveEvent && Date.now() - lastCancelTime < INTERACTION_CONFIG.MUTING_COOL_DOWN) {
        lastSIdx = -1;
        lastFIdx = -1;
        return;
      }
      str.fret = fIdx;
      str.isRoot = false;
      lastSIdx = sIdx;
      lastFIdx = fIdx;
    }
  });
};

const handlePointerMove = (e: PointerEvent) => {
  const pt = getCanvasPoint(e.clientX, e.clientY);
  if (pt) hoverPoint.value = pt;

  if (ticking) return;
  ticking = true;
  rAF_ID = requestAnimationFrame(() => {
    handleFingerClickLogic(e.clientX, e.clientY, true);
    ticking = false;
  });
};

const handlePointerLeave = () => {
  hoverPoint.value = null;
};

const handlePointerUp = () => {
  emit('drag-status-change', false);
  lastSIdx = -1;
  lastFIdx = -1;
  if (rAF_ID) cancelAnimationFrame(rAF_ID);
  ticking = false;
  cleanupListeners.forEach(cleanup => cleanup());
  cleanupListeners.length = 0;
};

const handlePointerDown = (e: PointerEvent) => {
  if (!props.interactive || e.button !== 0) return;
  emit('drag-status-change', true);
  lastSIdx = -1;
  lastFIdx = -1;
  handleFingerClickLogic(e.clientX, e.clientY, false);
  cleanupListeners.push(useEventListener(window, 'pointermove', handlePointerMove));
  cleanupListeners.push(useEventListener(window, 'pointerup', handlePointerUp));
};

const handleWheel = (e: WheelEvent) => {
  if (!props.interactive) return;
  e.preventDefault();

  const point = getCanvasPoint(e.clientX, e.clientY);

  if (point && point.stringIndex >= 0 && point.stringIndex <= 5) {
    const { stringIndex: sIdx, fretIndex: fIdx } = point;
    const currentStr = props.strings[sIdx];

    const isHoveringActiveNote =
      (fIdx > 0 && fIdx <= props.fretCount && currentStr.fret === fIdx) || (fIdx === 0 && isOpen(currentStr));

    if (isHoveringActiveNote) {
      if (canTogglePitchAccidental(sIdx, currentStr.fret, props.capo, props.activeBaseStrings)) {
        handleTogglePitchName(sIdx);
      }
      return;
    }
  }

  wheelAccumulator += e.deltaY;
  if (Math.abs(wheelAccumulator) < INTERACTION_CONFIG.WHEEL_THRESHOLD) return;
  if (wheelAccumulator > 0) {
    emit('update:capo', Math.min(INTERACTION_CONFIG.MAX_CAPO_LIMIT, props.capo + 1));
  } else {
    emit('update:capo', Math.max(INTERACTION_CONFIG.MIN_CAPO_LIMIT, props.capo - 1));
  }
  wheelAccumulator = 0;
};

const getOpenStringStatusClass = (str: GuitarStringEntity) => {
  if (isMuted(str)) return 'is-muted-status';
  if (isOpen(str) && !str.isRoot) return 'is-open-status';
  return '';
};

const getOpenStringStyle = (str: GuitarStringEntity) => {
  if (isOpen(str) && str.isRoot) {
    const bg = props.isDarkMode ? FRETBOARD_COLORS.openRootBgDark : FRETBOARD_COLORS.openRootBgLight;
    return {
      backgroundColor: bg,
      borderColor: bg,
      color: props.isDarkMode ? FRETBOARD_COLORS.openRootTextDark : FRETBOARD_COLORS.openRootTextLight,
      boxShadow: 'var(--root-glow)',
    };
  }
  return {};
};

const getFingerColor = (str: GuitarStringEntity) => {
  if (str.isRoot) return props.isDarkMode ? FRETBOARD_COLORS.rootDark : FRETBOARD_COLORS.rootLight;
  return props.isDarkMode ? FRETBOARD_COLORS.normalDark : FRETBOARD_COLORS.normalLight;
};

const getFingerTextColor = (str: GuitarStringEntity) => {
  return str.isRoot && props.isDarkMode ? FRETBOARD_COLORS.textRootDark : FRETBOARD_COLORS.textRootLight;
};

onMounted(() => {
  if (fretBoardRef.value) {
    useEventListener(fretBoardRef, 'pointerdown', handlePointerDown);
    useEventListener(fretBoardRef, 'pointermove', e => {
      const pt = getCanvasPoint(e.clientX, e.clientY);
      if (pt) hoverPoint.value = pt;
    });
    useEventListener(fretBoardRef, 'pointerleave', handlePointerLeave);
    useEventListener(fretBoardRef, 'wheel', handleWheel, { passive: false });
  }
});

onBeforeUnmount(() => {
  if (rAF_ID) cancelAnimationFrame(rAF_ID);
  cleanupListeners.forEach(cleanup => cleanup());
});
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.fretboard-layout-scaler {
  display: inline-block;
  transition:
    width @duration-slow @bezier-sidebar,
    height @duration-slow @bezier-sidebar;
}

.fretboard-container {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  user-select: none;
  box-sizing: border-box;
  transition: transform @duration-slow @bezier-sidebar;

  &.is-interactive {
    touch-action: none;
    cursor: pointer;
  }

  &.is-disabled {
    pointer-events: none;
    cursor: default;
  }
}

.open-strings-wrapper {
  width: 100%;
  position: relative;
  pointer-events: none;
  box-sizing: border-box;
}

.open-string-btn {
  width: 2.25rem;
  height: 2.25rem;
  box-sizing: border-box;
  box-shadow: @shadow-sm;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border-style: solid;
  border-width: 2px;
  background-color: var(--bg-body);
  padding: 0;
  cursor: pointer;
  transition: @transition-fast;

  &.allow-events {
    pointer-events: auto;
  }

  &.block-events {
    pointer-events: none;
  }

  &.is-fret-available:active {
    transform: scale(0.92);
  }

  &.is-fret-pressed {
    opacity: 0 !important;
    transform: scale(1) !important;
    background-color: transparent !important;
    border-color: transparent !important;
    box-shadow: none !important;
    pointer-events: auto !important;
  }

  &.is-muted-status {
    border-color: color-mix(in srgb, var(--color-danger), transparent 85%);
    color: var(--color-danger);
    background-color: color-mix(in srgb, var(--color-danger), transparent 92%);
  }

  &.is-open-status {
    border-color: color-mix(in srgb, var(--color-primary), transparent 85%);
    color: var(--color-primary);
    background-color: color-mix(in srgb, var(--color-primary), transparent 92%);
  }
}

.mute-icon {
  width: 1.125rem;
  height: 1.125rem;
}

.open-note-text {
  display: inline-block;
  line-height: 1;
  font-weight: 900;
  font-size: 1.25rem;
  letter-spacing: -0.05em;
}

.fretboard-svg {
  width: 100%;
  pointer-events: auto;
  box-sizing: border-box;
}

.string-line {
  transition: y2 @duration-slow @bezier-sidebar;
}

.finger-interactive {
  cursor: pointer;
  pointer-events: auto;
}

.finger-predictive {
  cursor: pointer;
}

.finger-disabled {
  cursor: default;
  pointer-events: none;
}

.finger-circle {
  transition:
    fill @duration-fast ease,
    filter @duration-fast ease;
  filter: var(--finger-shadow);

  &.is-root-glow {
    filter: var(--root-glow);
  }
}

.finger-text {
  transition: fill @duration-fast ease;
}
</style>
