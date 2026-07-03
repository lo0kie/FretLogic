<template>
  <div
    class="fretboard-layout-scaler inline-block"
    :style="{
      width: `${realScaledWidth}px`,
      height: `${realScaledHeight}px`,
    }"
  >
    <div
      ref="fretBoardRef"
      class="fretBoard-container relative flex flex-col items-center select-none"
      :class="[interactive ? 'touch-action-none' : 'pointer-events-none cursor-default']"
      :style="{
        width: `${CANVAS_CONFIG.BOARD_WIDTH}px`,
        height: `${rawHeight}px`,
        transform: `scale(${fretboardScale})`,
        transformOrigin: 'top left',
      }"
      @contextmenu.prevent="handleCanvasRightClick"
    >
      <div class="w-full relative pointer-events-none" :style="{ height: `${CANVAS_CONFIG.OFFSET_Y_TOP}px` }">
        <template v-for="(str, sIdx) in strings" :key="'os-' + sIdx">
          <GlobalTooltip
            placement="top"
            :content="interactive && str.fret <= 0 ? '左键：切换空弦/静音 \n 右键：设为根音' : undefined"
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
              @mousedown.middle.prevent.stop="isOpen(str) ? handleFretMiddleClick(sIdx) : null"
              class="w-10 h-10 box-border shadow-sm flex items-center justify-center rounded-full"
              :class="[
                str.fret > 0 ? 'is-fret-pressed' : 'is-fret-available',
                getOpenStringStatusClass(str),
                interactive ? 'pointer-events-auto' : 'pointer-events-none',
              ]"
              :style="getOpenStringStyle(str)"
            >
              <template v-if="str.fret <= 0">
                <X v-if="isMuted(str)" class="w-4.5 h-4.5" stroke-width="3" />
                <span v-else-if="isOpen(str)" class="font-black text-xl tracking-tighter open-note-text">
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
        class="w-full pointer-events-auto"
      >
        <line
          v-for="s in 6"
          :key="'string-' + s"
          :x1="getStrX(s - 1)"
          y1="0"
          :x2="getStrX(s - 1)"
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
          :x2="getStrX(5)"
          :y2="f * CANVAS_CONFIG.FRET_HEIGHT"
          :stroke="isDarkMode ? '#ffffff' : '#0f172a'"
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
        />

        <g v-for="i in fretCount" :key="'fret-text-' + i">
          <text
            v-if="i < fretCount"
            :x="(CANVAS_CONFIG.OFFSET_X - 32) / 2"
            :y="i * CANVAS_CONFIG.FRET_HEIGHT"
            text-anchor="middle"
            dominant-baseline="central"
            dy="-2px"
            font-size="28"
            font-weight="900"
            :fill="isDarkMode ? '#cbd5e1' : '#1e293b'"
            style="pointer-events: none"
          >
            {{ capo > 0 ? capo + i : i }}
          </text>
        </g>

        <template v-for="(str, sIdx) in strings" :key="'finger-' + sIdx">
          <g
            v-if="str.fret > 0 && str.fret <= fretCount"
            :class="[interactive ? 'cursor-pointer pointer-events-auto' : 'cursor-default pointer-events-none']"
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
import cloneDeep from 'lodash.clonedeep';
import { computed, onBeforeUnmount, onMounted, ref, toRaw } from 'vue';

import GlobalTooltip from '@/components/GlobalTooltip.vue';
import {
  CANVAS_CONFIG,
  FRETBOARD_COLORS,
  FRETBOARD_LINE_WIDTH,
  FRETBOARD_SCALE_MAP,
  INTERACTION_CONFIG,
} from '@/constants';
import type { GuitarStringEntity, GuitarStringsModel } from '@/types';
import { calcNoteLabel, isMuted, isOpen } from '@/utils/musicTheory';

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
  {
    activeBaseStrings: () => [40, 45, 50, 55, 59, 64],
    isDarkMode: false,
    interactive: true,
    scale: 1.0,
  }
);

const emit = defineEmits<{
  (e: 'update:strings', value: GuitarStringsModel): void;
  (e: 'update:capo', value: number): void;
  (e: 'drag-status-change', isDragging: boolean): void;
}>();

const fretBoardRef = ref<HTMLDivElement | null>(null);

let lastCancelTime = 0;
let lastSIdx = -1;
let lastFIdx = -1;
let wheelAccumulator = 0;
let ticking = false;
let rAF_ID = 0;
const cleanupListeners: (() => void)[] = [];

const getStrX = (i: number) => CANVAS_CONFIG.OFFSET_X + i * CANVAS_CONFIG.STRING_SPACING;
const rawHeight = computed(
  () => CANVAS_CONFIG.OFFSET_Y_TOP + props.fretCount * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.OFFSET_Y_BOTTOM
);

const fretboardScale = computed(() => {
  const baseFretScale = FRETBOARD_SCALE_MAP[props.fretCount] || 1.0;
  return baseFretScale * props.scale;
});

const realScaledWidth = computed(() => CANVAS_CONFIG.BOARD_WIDTH * fretboardScale.value);
const realScaledHeight = computed(() => rawHeight.value * fretboardScale.value);

const emitStringsUpdate = (mutator: (cloned: GuitarStringsModel) => void) => {
  if (!props.interactive) return;
  const cloned = cloneDeep(toRaw(props.strings));
  mutator(cloned);
  emit('update:strings', cloned);
};

const handleLocalToggleOpenString = (sIdx: number) => {
  emitStringsUpdate(cloned => {
    const str = cloned[sIdx];
    if (str.fret > 0) str.fret = 0;
    else if (isOpen(str)) {
      str.fret = -1;
      str.isRoot = false;
    } else str.fret = 0;
  });
};

const handleOpenStringRightClick = (sIdx: number) => {
  emitStringsUpdate(cloned => {
    const str = cloned[sIdx];
    if (str.isRoot && isOpen(str)) str.isRoot = false;
    else {
      cloned.forEach(s => {
        s.isRoot = false;
      });
      str.fret = 0;
      str.isRoot = true;
    }
  });
};

const handleFretRightClick = (sIdx: number) => {
  emitStringsUpdate(cloned => {
    const str = cloned[sIdx];
    if (str.fret < 0) return;
    const wasRoot = str.isRoot;
    cloned.forEach(s => {
      s.isRoot = false;
    });
    str.isRoot = !wasRoot;
  });
};

const handleFretMiddleClick = (sIdx: number) => {
  emitStringsUpdate(cloned => {
    const str = cloned[sIdx];
    if (isMuted(str)) return;
    const base = props.activeBaseStrings[sIdx];
    const actualOffset = str.fret > 0 && props.capo > 0 ? props.capo : 0;
    const noteIndex = (base + str.fret + actualOffset) % 12;
    if ([1, 3, 6, 8, 10].includes(noteIndex)) {
      str.preferFlat = !str.preferFlat;
    }
  });
};

const handleCanvasRightClick = (e: MouseEvent) => {
  if (!props.interactive || !fretBoardRef.value) return;
  const board = fretBoardRef.value.getBoundingClientRect();
  const scaleX = board.width / CANVAS_CONFIG.BOARD_WIDTH;
  const scaleY = board.height / rawHeight.value;
  const canvasX = (e.clientX - board.left) / scaleX;
  const canvasY = (e.clientY - board.top) / scaleY;
  const sIdx = Math.round((canvasX - CANVAS_CONFIG.OFFSET_X) / CANVAS_CONFIG.STRING_SPACING);
  const fretAreaY = canvasY - CANVAS_CONFIG.OFFSET_Y_TOP;
  const fIdx = fretAreaY > 0 ? Math.floor(fretAreaY / CANVAS_CONFIG.FRET_HEIGHT) + 1 : 0;

  if (sIdx >= 0 && sIdx <= 5 && fIdx >= 1 && fIdx <= props.fretCount) {
    emitStringsUpdate(cloned => {
      const str = cloned[sIdx];
      if (str.fret === fIdx) {
        handleFretRightClick(sIdx);
        return;
      }
      cloned.forEach(s => {
        s.isRoot = false;
      });
      str.fret = fIdx;
      str.isRoot = true;
    });
  }
};

const handleFingerClickLogic = (clientX: number, clientY: number, isMoveEvent = false) => {
  const board = fretBoardRef.value?.getBoundingClientRect();
  if (!board) return;

  const scaleX = board.width / CANVAS_CONFIG.BOARD_WIDTH;
  const scaleY = board.height / rawHeight.value;
  const canvasX = (clientX - board.left) / scaleX;
  const canvasY = (clientY - board.top) / scaleY;
  const sIdx = Math.round((canvasX - CANVAS_CONFIG.OFFSET_X) / CANVAS_CONFIG.STRING_SPACING);
  const fretAreaY = canvasY - CANVAS_CONFIG.OFFSET_Y_TOP;
  const fIdx = fretAreaY > 0 ? Math.floor(fretAreaY / CANVAS_CONFIG.FRET_HEIGHT) + 1 : 0;

  if (sIdx >= 0 && sIdx <= 5 && fIdx >= 1 && fIdx <= props.fretCount) {
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
        lastSIdx = sIdx;
        lastFIdx = fIdx;
      }
    });
  }
};

const handlePointerMove = (e: PointerEvent) => {
  if (ticking) return;
  ticking = true;
  rAF_ID = requestAnimationFrame(() => {
    handleFingerClickLogic(e.clientX, e.clientY, true);
    ticking = false;
  });
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
  if (isMuted(str)) return 'border-[#dc2626] text-[#dc2626] dark:border-[#f87171] dark:text-[#f87171] bg-transparent';
  if (isOpen(str) && !str.isRoot)
    return 'border-[#93c5fd] text-[#1d4ed8] dark:border-[#1e3a8a] dark:text-[#93c5fd] bg-transparent';
  return '';
};

const getOpenStringStyle = (str: GuitarStringEntity) => {
  if (isOpen(str) && str.isRoot) {
    const bg = props.isDarkMode ? FRETBOARD_COLORS.openRootBgDark : FRETBOARD_COLORS.openRootBgLight;
    return {
      backgroundColor: bg,
      borderColor: bg,
      color: props.isDarkMode ? FRETBOARD_COLORS.openRootTextDark : FRETBOARD_COLORS.openRootTextLight,
      boxShadow: `0 2px ${props.isDarkMode ? '8px' : '4px'} ${props.isDarkMode ? 'rgba(251,191,36,0.4)' : 'rgba(245,158,11,0.3)'}`,
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
    useEventListener(fretBoardRef, 'wheel', handleWheel, { passive: false });
  }
});

onBeforeUnmount(() => {
  if (rAF_ID) cancelAnimationFrame(rAF_ID);
  cleanupListeners.forEach(cleanup => cleanup());
});
</script>

<style scoped lang="less">
@import '@/assets/tokens.less';

.open-note-text {
  display: inline-block;
  line-height: 1;
}
.fretboard-layout-scaler {
  transition:
    width @duration-slow @bezier-standard,
    height @duration-slow @bezier-standard;
}
.fretBoard-container {
  transition: transform @duration-slow @bezier-standard;
}
button {
  border-width: 3px;
  transition:
    border-width 0.05s @bezier-standard,
    background-color 0.05s ease;
  &.is-fret-available:active {
    border-width: 5px !important;
  }
  &.is-fret-pressed {
    opacity: 0 !important;
    transform: scale(1) !important;
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
