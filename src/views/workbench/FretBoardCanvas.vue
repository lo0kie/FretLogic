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
  >
    <div class="w-full h-[80px] relative pointer-events-none flex items-end justify-end">
      <template v-for="(item, sIdx) in chordLabStore.openStringsUIState" :key="'os-' + sIdx">
        <button
          @click.stop="chordLabStore.toggleOpenString(sIdx)"
          class="absolute w-10 h-10 rounded-full border flex items-center justify-center font-bold text-[16px] pointer-events-auto shadow-sm active:scale-90 transition-transform duration-100 open-string-btn"
          :class="[item.type, { 'opacity-0': ![-1, 0].includes(item.fretVal) }]"
          :style="{
            left: `calc(${getStrX(sIdx)}px - 20px)`,
            top: '10px',
          }"
        >
          {{ item.fretVal === -1 ? '✕' : ['E', 'A', 'D', 'G', 'B', 'E'][sIdx] }}
        </button>
      </template>
    </div>

    <svg
      width="456"
      :height="chordLabStore.fretCount * 120 + 20"
      :viewBox="`0 0 456 ${chordLabStore.fretCount * 120 + 20}`"
      style="overflow: visible"
      class="w-full"
    >
      <line
        v-for="s in 6"
        :key="'string-' + s"
        :x1="getStrX(s - 1)"
        y1="0"
        :x2="getStrX(s - 1)"
        :y2="chordLabStore.fretCount * 120"
        :stroke="chordLabStore.isDarkMode ? '#475569' : '#94a3b8'"
        :stroke-width="2 + (6 - s) * 0.4"
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
      />

      <rect x="43" y="-6" width="384" height="8" :fill="chordLabStore.isDarkMode ? '#f1f5f9' : '#475569'" />

      <template v-for="f in chordLabStore.fretCount + 1" :key="'fret-text-' + f">
        <text
          x="18"
          :y="(f - 1) * 120"
          text-anchor="middle"
          dy="0.36em"
          font-size="20"
          font-weight="900"
          :fill="chordLabStore.isDarkMode ? '#64748b' : '#94a3b8'"
          class="fret-number-text"
          v-if="f > 1 && f <= chordLabStore.fretCount"
        >
          {{ chordLabStore.capo > 0 ? chordLabStore.capo + f - 1 : f - 1 }}
        </text>
      </template>

      <template v-for="(fret, sIdx) in chordLabStore.selectedFrets" :key="'finger-' + sIdx">
        <g v-if="fret > 0 && fret <= chordLabStore.fretCount" class="cursor-pointer">
          <circle
            :cx="getStrX(sIdx)"
            :cy="(fret - 1) * 120 + 60"
            r="28"
            :fill="isRootNote(sIdx, fret, chordLabStore.capo, chordLabStore.currentChordName) ? '#f59e0b' : '#2563eb'"
            style="filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.15))"
          />
          <text
            :x="getStrX(sIdx)"
            :y="(fret - 1) * 120 + 60"
            text-anchor="middle"
            dy="0.36em"
            fill="white"
            font-size="20"
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
import { calcNoteLabel, isRootNote } from '@/utils/musicTheory';
import { useEventListener } from '@vueuse/core';
import { onMounted, ref } from 'vue';

const chordLabStore = useChordLabStore();
const fretBoardRef = ref<HTMLDivElement | null>(null);

const getStrX = (i: number) => 45 + i * 76;

const handleFingerClickLogic = (clientX: number, clientY: number) => {
  if (!fretBoardRef.value) return;
  const board = fretBoardRef.value.getBoundingClientRect();

  const scaleX = board.width / 456;
  const scaleY = board.height / (80 + chordLabStore.fretCount * 120 + 20);

  const canvasX = (clientX - board.left) / scaleX;
  const canvasY = (clientY - board.top) / scaleY;

  const sIdx = Math.round((canvasX - 45) / 76);
  const fretAreaY = canvasY - 80;
  const fIdx = fretAreaY > 0 ? Math.floor(fretAreaY / 120) + 1 : 0;

  if (
    sIdx >= 0 &&
    sIdx <= 5 &&
    fIdx >= 1 &&
    fIdx <= chordLabStore.fretCount &&
    chordLabStore.lastPos !== `${sIdx}-${fIdx}`
  ) {
    chordLabStore.selectedFrets[sIdx] = chordLabStore.selectedFrets[sIdx] === fIdx ? 0 : fIdx;
    chordLabStore.lastPos = `${sIdx}-${fIdx}`;
  }
};

const handlePointerDown = (e: PointerEvent) => {
  if (e.button !== 0) return;
  chordLabStore.isDraggingFinger = true;
  chordLabStore.lastPos = '';
  handleFingerClickLogic(e.clientX, e.clientY);
};

const handlePointerMove = (e: PointerEvent) => {
  if (chordLabStore.isDraggingFinger) handleFingerClickLogic(e.clientX, e.clientY);
};

const handlePointerUp = () => {
  chordLabStore.isDraggingFinger = false;
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

  // 🌟 顶部的独立空弦按钮样式流（浅色模式）
  .open-string-btn {
    border-color: #cbd5e1;
    color: #334155;
    background-color: #ffffff;

    &.muted {
      border-color: rgba(239, 68, 68, 0.3) !important;
      color: #ef4444 !important;
      background-color: rgba(239, 68, 68, 0.08) !important;
    }
    &.open {
      border-color: #2563eb50 !important;
      color: #2563eb !important;
      background-color: rgba(37, 99, 235, 0.08) !important;
    }
    &.root {
      border-color: #f59e0b50 !important;
      color: #f59e0b !important;
      background-color: rgba(245, 158, 11, 0.08) !important;
    }
  }
}

// 🌟 顶部的独立空弦按钮样式流（深色模式）
.dark {
  .fretBoard-container {
    .open-string-btn {
      border-color: #475569;
      color: #f8fafc;
      background-color: #1e293b;

      &.muted {
        border-color: rgba(239, 68, 68, 0.4) !important;
        color: #f87171 !important;
        background-color: rgba(239, 68, 68, 0.15) !important;
      }
      &.open {
        border-color: #3b82f6 !important;
        color: #3b82f6 !important;
        background-color: rgba(59, 130, 246, 0.15) !important;
      }
      &.root {
        border-color: #fbbf24 !important;
        color: #fbbf24 !important;
        background-color: rgba(251, 191, 36, 0.15) !important;
      }
    }
  }
}
</style>
