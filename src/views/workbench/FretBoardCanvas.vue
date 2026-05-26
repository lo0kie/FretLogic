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
            transform: 'translateX(-50%)' /* 🌟 乐理几何正解：利用 -50% 物理中轴锁死，不管什么分辨率都绝对完美居中 */,
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
            transform: 'translateX(-50%)' /* 🌟 物理对齐：让圆形正中心跟下面的 line 坐标做到纳米级像素重合 */,
            top: '10px',
          }"
        >
          <span>{{ ['E', 'A', 'D', 'G', 'B', 'E'][sIdx] }}</span>
        </button>

        <button
          v-else
          :key="'pressed-shield-' + sIdx"
          @click.stop="chordLabStore.toggleOpenString(sIdx)"
          @contextmenu.prevent.stop="handleFretRightClick(sIdx)"
          class="absolute w-10 h-10 opacity-0 pointer-events-auto bg-transparent border-none outline-none cursor-pointer"
          :style="{
            left: `${getStrX(sIdx)}px`,
            transform: 'translateX(-50%)' /* 🌟 触控区同步居中对齐 */,
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

let isMoved = false;
let lastCancelTime = 0;
const MUTING_COOL_DOWN = 200;

/**
 * 1. 空弦控制区右键处理中心
 * 再次右键已经是主音的空弦音时，完美切回无标记状态 (-1)
 */
const handleOpenStringRightClick = (sIdx: number) => {
  if (chordLabStore.rootMark === sIdx && chordLabStore.selectedFrets[sIdx] === 0) {
    chordLabStore.rootMark = -1; // 来回切换：已经是主音则取消标记
  } else {
    chordLabStore.selectedFrets[sIdx] = 0; // 强行激活
    chordLabStore.rootMark = sIdx;
  }
};

/**
 * 2. 已存在实体按音时的右键来回切换逻辑
 */
const handleFretRightClick = (sIdx: number) => {
  if (chordLabStore.rootMark === sIdx) {
    chordLabStore.rootMark = -1; // 🌟 闭环：已经是主音，右键切换回普通蓝色
  } else {
    chordLabStore.rootMark = sIdx; // 否则涂黄
  }
};

/**
 * 3. 指板画布空白处右键劫持中心
 */
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
    const existingFret = chordLabStore.selectedFrets[sIdx];

    // 🌟 终极双重防打架锁：
    // 如果右键点的位置，刚好就是这根弦当前已经按下的品位，判定为用户在对已有圆圈进行盲操切换，直接分流出去，坚决不重置它！
    if (existingFret === fIdx) {
      handleFretRightClick(sIdx);
      return;
    }

    // 只有点在真正没有任何按点的纯净空白格子时，才触发“闪击一键创建并设为主音”
    chordLabStore.selectedFrets[sIdx] = fIdx;
    chordLabStore.rootMark = sIdx;
  }
};

/**
 * 4. 左键点击与拖拽手势状态机
 */
const handleFingerClickLogic = (clientX: number, clientY: number, isMoveEvent = false) => {
  if (!fretBoardRef.value) return;
  const board = fretBoardRef.value.getBoundingClientRect();

  const scaleX = board.width / 456;
  const scaleY = board.height / (80 + chordLabStore.fretCount * 120 + 20);

  const canvasX = (clientX - board.left) / scaleX;
  const canvasY = (clientY - board.top) / scaleY;

  const sIdx = Math.round((canvasX - 45) / 76);
  const fretAreaY = canvasY - 80;
  const fIdx = fretAreaY > 0 ? Math.floor(fretAreaY / 120) + 1 : 0;

  if (sIdx >= 0 && sIdx <= 5 && fIdx >= 1 && fIdx <= chordLabStore.fretCount) {
    const currentPos = `${sIdx}-${fIdx}`;

    if (isMoveEvent && chordLabStore.lastPos === currentPos) return;

    const isSameFret = chordLabStore.selectedFrets[sIdx] === fIdx;

    if (isSameFret) {
      chordLabStore.selectedFrets[sIdx] = -1;
      chordLabStore.lastPos = '';

      if (chordLabStore.rootMark === sIdx) {
        chordLabStore.rootMark = -1;
      }

      lastCancelTime = Date.now();
    } else {
      if (isMoveEvent && Date.now() - lastCancelTime < MUTING_COOL_DOWN) {
        chordLabStore.lastPos = '';
        return;
      }

      chordLabStore.selectedFrets[sIdx] = fIdx;
      chordLabStore.lastPos = currentPos;
    }
  }
};

const handlePointerDown = (e: PointerEvent) => {
  if (e.button !== 0) return;
  chordLabStore.isDraggingFinger = true;
  chordLabStore.lastPos = '';
  isMoved = false;

  handleFingerClickLogic(e.clientX, e.clientY, false);
};

const handlePointerMove = (e: PointerEvent) => {
  if (!chordLabStore.isDraggingFinger) return;
  isMoved = true;
  handleFingerClickLogic(e.clientX, e.clientY, true);
};

const handlePointerUp = () => {
  chordLabStore.isDraggingFinger = false;
  chordLabStore.lastPos = '';
  isMoved = false;
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
