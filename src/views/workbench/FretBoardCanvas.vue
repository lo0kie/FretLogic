<template>
  <div
    ref="fretBoardRef"
    class="fretBoard-container relative touch-action-none flex flex-col items-center select-none"
    :style="{
      width: '456px',
      height: 80 + chordLabStore.fretCount * 120 + 20 + 'px',
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
          @click.stop="chordLabStore.toggleOpenString(sIdx)"
          @contextmenu.prevent.stop="handleOpenStringRightClick(sIdx)"
          class="absolute w-10 h-10 rounded-full border flex items-center justify-center font-bold text-[22px] pointer-events-auto shadow-sm active:scale-90 transition-none open-string-btn muted"
          :style="{
            left: `${getStrX(sIdx)}px`,
            transform: 'translateX(-50%)',
            top: '10px',
          }"
        >
          <span>✕</span>
        </button>

        <button
          v-else-if="fretVal === 0"
          :key="'open-' + sIdx"
          @click.stop="chordLabStore.toggleOpenString(sIdx)"
          @contextmenu.prevent.stop="handleOpenStringRightClick(sIdx)"
          class="absolute w-10 h-10 rounded-full border flex items-center justify-center font-bold text-[22px] pointer-events-auto shadow-sm active:scale-90 transition-all duration-75 open-string-btn"
          :class="[chordLabStore.rootMark === sIdx ? 'root' : 'open']"
          :style="{
            left: `${getStrX(sIdx)}px`,
            transform: 'translateX(-50%)',
            top: '10px',
          }"
        >
          <span>{{ ['E', 'A', 'D', 'G', 'B', 'E'][sIdx] }}</span>
        </button>

        <button
          v-else
          :key="'pressed-shield-' + sIdx"
          @click.stop="chordLabStore.toggleOpenString(sIdx)"
          @contextmenu.prevent.stop="handleOpenStringRightClick(sIdx)"
          class="absolute w-10 h-10 opacity-0 pointer-events-auto bg-transparent border-none outline-none cursor-pointer"
          :style="{
            left: `${getStrX(sIdx)}px`,
            transform: 'translateX(-50%)',
            top: '20px',
          }"
        ></button>
      </template>
    </div>

    <svg
      width="456"
      :height="chordLabStore.fretCount * 120 + 20"
      :viewBox="`0 0 456 ${chordLabStore.fretCount * 120 + 20}`"
      style="overflow: visible"
      class="w-full pointer-events-auto"
    >
      <line
        v-for="s in 6"
        :key="'string-' + s"
        :x1="getStrX(s - 1)"
        y1="0"
        :x2="getStrX(s - 1)"
        :y2="chordLabStore.fretCount * 120"
        :stroke="chordLabStore.isDarkMode ? '#475569' : '#94a3b8'"
        stroke-width="4"
        style="pointer-events: none"
      />

      <line
        v-for="f in chordLabStore.fretCount + 1"
        :key="'fret-line-' + f"
        x1="45"
        :y1="(f - 1) * 120"
        x2="425"
        :y2="(f - 1) * 120"
        :stroke="chordLabStore.isDarkMode ? '#334155' : '#cbd5e1'"
        stroke-width="4"
        style="pointer-events: none"
      />

      <rect
        x="43"
        y="-6"
        width="384"
        height="8"
        :fill="chordLabStore.isDarkMode ? '#f1f5f9' : '#475569'"
        style="pointer-events: none"
      />

      <template v-for="f in chordLabStore.fretCount + 1" :key="'fret-text-' + f">
        <text
          x="10"
          :y="(f - 1) * 120"
          text-anchor="middle"
          dy="0.36em"
          font-size="28"
          font-weight="900"
          :fill="chordLabStore.isDarkMode ? '#64748b' : '#94a3b8'"
          class="fret-number-text"
          v-if="f > 1 && f <= chordLabStore.fretCount"
          style="pointer-events: none"
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
            :cy="(fret - 1) * 120 + 60"
            r="28"
            :fill="chordLabStore.rootMark === sIdx ? '#f59e0b' : '#2563eb'"
            style="filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.15))"
          />
          <text
            :x="getStrX(sIdx)"
            :y="(fret - 1) * 120 + 60"
            text-anchor="middle"
            dy="0.36em"
            fill="white"
            font-size="22"
            font-weight="700"
            class="fret-note-text"
          >
            {{ calcNoteLabel(sIdx, fret, chordLabStore.capo) }}
          </text>
        </g>
      </template>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { useChordLabStore } from '@/stores/chordLabStore';
import { calcNoteLabel } from '@/utils/musicTheory';
import { useEventListener } from '@vueuse/core';
import { onMounted, ref } from 'vue';

const chordLabStore = useChordLabStore();
const fretBoardRef = ref<HTMLDivElement | null>(null);

const getStrX = (i: number) => 45 + i * 76;

let lastCancelTime = 0;
const MUTING_COOL_DOWN = 200;

let lastSIdx = -1;
let lastFIdx = -1;

let cachedBoardRect: DOMRect | null = null;

// 🌟 乐理状态机：规范右击空弦音控制区的终极闭环逻辑
const handleOpenStringRightClick = (sIdx: number) => {
  // 判定 A：如果当前已经是空弦音，且它本来就是手动主音，那右击就取消主音标记
  if (chordLabStore.rootMark === sIdx && chordLabStore.selectedFrets[sIdx] === 0) {
    chordLabStore.rootMark = -1;
  } else {
    // 判定 B（修复核心）：管你之前是禁弹(-1)还是实体按音(>0)，通通掐断清除，原地变为空弦主音！
    chordLabStore.selectedFrets[sIdx] = 0;
    chordLabStore.rootMark = sIdx;
  }
};

const handleFretRightClick = (sIdx: number) => {
  chordLabStore.rootMark = chordLabStore.rootMark === sIdx ? -1 : sIdx;
};

const handleCanvasRightClick = (e: MouseEvent) => {
  if (!fretBoardRef.value) return;
  const board = fretBoardRef.value.getBoundingClientRect();
  const scaleX = board.width / 456;
  const scaleY = board.height / (80 + chordLabStore.fretCount * 120 + 20);

  const canvasX = (e.clientX - board.left) / scaleX;
  const canvasY = (e.clientY - board.top) / scaleY;

  const sIdx = Math.round((canvasX - 45) / 76);
  const fretAreaY = canvasY - 80;
  const fIdx = fretAreaY > 0 ? Math.floor(fretAreaY / 120) + 1 : 0;

  if (sIdx >= 0 && sIdx <= 5 && fIdx >= 1 && fIdx <= chordLabStore.fretCount) {
    if (chordLabStore.selectedFrets[sIdx] === fIdx) {
      handleFretRightClick(sIdx);
      return;
    }
    chordLabStore.selectedFrets[sIdx] = fIdx;
    chordLabStore.rootMark = sIdx;
  }
};

const handleFingerClickLogic = (clientX: number, clientY: number, isMoveEvent = false) => {
  const board = cachedBoardRect || (fretBoardRef.value ? fretBoardRef.value.getBoundingClientRect() : null);
  if (!board) return;

  const scaleX = board.width / 456;
  const scaleY = board.height / (80 + chordLabStore.fretCount * 120 + 20);

  const canvasX = (clientX - board.left) / scaleX;
  const canvasY = (clientY - board.top) / scaleY;

  const sIdx = Math.round((canvasX - 45) / 76);
  const fretAreaY = canvasY - 80;
  const fIdx = fretAreaY > 0 ? Math.floor(fretAreaY / 120) + 1 : 0;

  if (sIdx >= 0 && sIdx <= 5 && fIdx >= 1 && fIdx <= chordLabStore.fretCount) {
    if (isMoveEvent && lastSIdx === sIdx && lastFIdx === fIdx) return;
    const isSameFret = chordLabStore.selectedFrets[sIdx] === fIdx;
    if (isSameFret) {
      chordLabStore.selectedFrets[sIdx] = -1;
      lastSIdx = -1;
      lastFIdx = -1;
      if (chordLabStore.rootMark === sIdx) {
        chordLabStore.rootMark = -1;
      }
      lastCancelTime = Date.now();
    } else {
      if (isMoveEvent && Date.now() - lastCancelTime < MUTING_COOL_DOWN) {
        lastSIdx = -1;
        lastFIdx = -1;
        return;
      }
      chordLabStore.selectedFrets[sIdx] = fIdx;
      lastSIdx = sIdx;
      lastFIdx = fIdx;
    }
  }
};

const handlePointerDown = (e: PointerEvent) => {
  if (e.button !== 0) return;
  if (fretBoardRef.value) {
    cachedBoardRect = fretBoardRef.value.getBoundingClientRect();
  }
  chordLabStore.isDraggingFinger = true;
  lastSIdx = -1;
  lastFIdx = -1;
  handleFingerClickLogic(e.clientX, e.clientY, false);
};

const handlePointerMove = (e: PointerEvent) => {
  if (!chordLabStore.isDraggingFinger) return;
  handleFingerClickLogic(e.clientX, e.clientY, true);
};

const handlePointerUp = () => {
  chordLabStore.isDraggingFinger = false;
  lastSIdx = -1;
  lastFIdx = -1;
  cachedBoardRect = null;
};

onMounted(() => {
  if (fretBoardRef.value) {
    useEventListener(fretBoardRef, 'pointerdown', handlePointerDown);
    useEventListener(window, 'pointermove', handlePointerMove);
    useEventListener(window, 'pointerup', handlePointerUp);
  }
});
</script>

<style scoped lang="less">
.fretBoard-container {
  .fret-number-text,
  .fret-note-text {
    font-family:
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      sans-serif;
  }
  .open-string-btn {
    border-color: #cbd5e1;
    color: #334155;
    background-color: #ffffff;
    transition: all 0.075s cubic-bezier(0.4, 0, 0.2, 1);
    &.muted {
      border-color: rgba(239, 68, 68, 0.3) !important;
      color: #ef4444 !important;
      background-color: rgba(239, 68, 68, 0.08) !important;
      transition: none !important;
    }
    &.open {
      border-color: #2563eb50 !important;
      color: #2563eb !important;
      background-color: rgba(37, 99, 235, 0.08) !important;
    }
    &.root {
      border-color: #f59e0b !important;
      color: #ffffff !important;
      background-color: #f59e0b !important;
      box-shadow: 0 2px 4px rgba(245, 158, 11, 0.3);
    }
  }
}
:global(.dark) {
  .fretBoard-container {
    .open-string-btn {
      border-color: #475569;
      color: #f8fafc;
      background-color: #1e293b;
      &.muted {
        border-color: rgba(239, 68, 68, 0.4) !important;
        color: #f87171 !important;
        background-color: rgba(239, 68, 68, 0.15) !important;
        transition: none !important;
      }
      &.open {
        border-color: #3b82f6 !important;
        color: #3b82f6 !important;
        background-color: rgba(59, 130, 246, 0.15) !important;
      }
      &.root {
        border-color: #fbbf24 !important;
        color: #1e293b !important;
        background-color: #fbbf24 !important;
        box-shadow: 0 2px 8px rgba(251, 191, 36, 0.4);
      }
    }
  }
}
</style>
