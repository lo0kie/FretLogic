<template>
  <div
    ref="fretboardRef"
    class="fretboard-container relative touch-action-none cursor-pointer"
    :style="{ width: '456px', height: 60 + chordLabStore.fretCount * 120 + 'px' }"
  >
    <div
      class="absolute left-0 right-0 h-[60px] z-50 pointer-events-none flex items-center"
      :style="{
        transform: `scale(${1 - (chordLabStore.fretCount - 3) * 0.05})`,
        top: `${-20 + (chordLabStore.fretCount - 3) * 15}px`,
      }"
    >
      <template v-for="(item, sIdx) in chordLabStore.openStringsUIState" :key="'os-' + sIdx">
        <button
          v-show="[-1, 0].includes(item.fretVal)"
          @click.stop="chordLabStore.toggleOpenString(sIdx)"
          class="absolute w-10 h-10 rounded-full border flex items-center justify-center font-bold text-[16px] pointer-events-auto shadow-sm active:scale-90 transition-transform duration-100"
          :style="{
            left: `calc(${getStrX(sIdx)}px - 20px)`,
            borderColor: item.style.border,
            color: item.style.text,
            backgroundColor: item.style.bg,
          }"
        >
          {{ item.fretVal === -1 ? '✕' : item.noteLabel }}
        </button>
      </template>
    </div>

    <svg
      width="456"
      :height="60 + chordLabStore.fretCount * 120"
      :viewBox="`0 0 456 ${60 + chordLabStore.fretCount * 120}`"
      style="overflow: visible"
      :style="{ transform: `scale(${1 - (chordLabStore.fretCount - 3) * 0.05})` }"
    >
      <line
        v-for="s in 6"
        :key="'string-' + s"
        :x1="getStrX(s - 1)"
        y1="60"
        :x2="getStrX(s - 1)"
        :y2="60 + chordLabStore.fretCount * 120"
        stroke="var(--fret-color)"
        stroke-width="3"
      />
      <line
        v-for="f in chordLabStore.fretCount + 1"
        :key="'fret-line-' + f"
        x1="45"
        :y1="60 + (f - 1) * 120"
        x2="425"
        :y2="60 + (f - 1) * 120"
        stroke="var(--fret-color)"
        stroke-width="4"
      />
      <rect x="44" y="54" width="382" height="8" :fill="chordLabStore.isDarkMode ? '#f8fafc' : '#0f172a'" />

      <template v-for="f in chordLabStore.fretCount + 1" :key="'fret-text-' + f">
        <text
          x="18"
          :y="60 + (f - 1) * 120"
          text-anchor="middle"
          dominant-baseline="central"
          font-size="24"
          font-weight="900"
          class="fret-number-text"
          v-if="f > 1 && f <= chordLabStore.fretCount"
        >
          {{ chordLabStore.capo > 0 ? chordLabStore.capo + f - 1 : f - 1 }}
        </text>
      </template>

      <template v-for="(fret, sIdx) in chordLabStore.selectedFrets" :key="'finger-' + sIdx">
        <g v-if="fret > 0 && fret <= chordLabStore.fretCount">
          <circle
            :cx="getStrX(sIdx)"
            :cy="60 + (fret - 1) * 120 + 60"
            r="26"
            :fill="
              isRootNote(sIdx, fret, chordLabStore.capo, chordLabStore.currentChordName)
                ? 'var(--brand-secondary)'
                : 'var(--brand-primary)'
            "
            class="pointer-dot"
          />
          <text
            :x="getStrX(sIdx)"
            :y="60 + (fret - 1) * 120 + 67"
            text-anchor="middle"
            fill="white"
            font-size="18"
            font-weight="700"
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
import { useEventListener } from '@vueuse/core';
import { onMounted, ref } from 'vue';
// 🌟 核心增补：按需导入纯乐理逻辑工具函数
import { calcNoteLabel, isRootNote } from '@/utils/musicTheory';

const chordLabStore = useChordLabStore();
const fretboardRef = ref<HTMLDivElement | null>(null);

const getStrX = (i: number) => 45 + i * 76;

const handleFingerClickLogic = (clientX: number, clientY: number) => {
  if (!fretboardRef.value) return;
  const board = fretboardRef.value.getBoundingClientRect();
  const sIdx = Math.round((clientX - board.left - 45) / 76);
  const fIdx = clientY - board.top > 60 ? Math.floor((clientY - board.top - 60) / 120) + 1 : 0;

  if (sIdx >= 0 && sIdx <= 5 && fIdx >= 1 && fIdx <= chordLabStore.fretCount && chordLabStore.lastPos !== `${sIdx}-${fIdx}`) {
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
  if (fretboardRef.value) {
    useEventListener(fretboardRef, 'pointerdown', handlePointerDown);
    useEventListener(window, 'pointermove', handlePointerMove);
    useEventListener(window, 'pointerup', handlePointerUp);
  }
});
</script>

<style scoped lang="less">
.fretboard-container {
  .fret-number-text {
    @apply fill-slate-400 dark:fill-slate-500;
  }
  .pointer-dot {
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.12));
  }
}
</style>
