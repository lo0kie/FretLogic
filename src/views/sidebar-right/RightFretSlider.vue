<template>
  <div class="panel-right-plate flex flex-col gap-2">
    <label class="plate-label text-xs font-black uppercase text-subtitle">显示范围</label>
    <div
      ref="fretSliderRef"
      class="fret-slider-track flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl h-10 relative items-center cursor-pointer touch-none select-none"
    >
      <div
        class="slider-btn"
        :style="{
          transform:
            chordLabStore.fretCount === 3
              ? 'translateX(0)'
              : chordLabStore.fretCount === 4
                ? 'translateX(100%)'
                : 'translateX(200%)',
        }"
      ></div>

      <div
        v-for="f in [3, 4, 5]"
        :key="f"
        @click="chordLabStore.fretCount = f"
        class="fret-option-text flex-1 text-center text-[16px] font-black z-10 h-full flex items-center justify-center transition-colors"
        :class="{ 'is-active': chordLabStore.fretCount === f }"
      >
        {{ f }} 品
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useChordLabStore } from '@/stores/chordLabStore';
import { useEventListener } from '@vueuse/core';
import { onMounted, ref } from 'vue';

const chordLabStore = useChordLabStore();
const fretSliderRef = ref<HTMLDivElement | null>(null);
let isFretDragging = false;

// 🌟 核心优化：固化滑轨物理卡片边界，彻底驱逐 Move 期间的 getBoundingClientRect 刺客
let cachedSliderRect: DOMRect | null = null;

const handleFretSliderPointerDown = (e: PointerEvent) => {
  if (!fretSliderRef.value) return;
  isFretDragging = true;
  fretSliderRef.value.setPointerCapture(e.pointerId);

  // 🌟 状态捕获：在按下的刹那锁定物理盒子大小
  cachedSliderRect = fretSliderRef.value.getBoundingClientRect();
  updateFretCountFromX(e.clientX);
};

const handleFretSliderPointerMove = (e: PointerEvent) => {
  if (isFretDragging) updateFretCountFromX(e.clientX);
};

const handleFretSliderPointerUp = (e: PointerEvent) => {
  isFretDragging = false;
  if (fretSliderRef.value) fretSliderRef.value.releasePointerCapture(e.pointerId);
  cachedSliderRect = null; // 🌟 顺手释放防内存泄漏
};

const updateFretCountFromX = (clientX: number) => {
  // 🌟 极速命中：Move 拖拽期间 100% 消费缓存快照
  const rect = cachedSliderRect || (fretSliderRef.value ? fretSliderRef.value.getBoundingClientRect() : null);
  if (!rect) return;

  const relativeX = clientX - rect.left;
  const percent = relativeX / rect.width;
  if (percent < 0.33) chordLabStore.fretCount = 3;
  else if (percent < 0.66) chordLabStore.fretCount = 4;
  else chordLabStore.fretCount = 5;
};

onMounted(() => {
  if (fretSliderRef.value) {
    useEventListener(fretSliderRef, 'pointerdown', handleFretSliderPointerDown);
    useEventListener(fretSliderRef, 'pointermove', handleFretSliderPointerMove);
    useEventListener(fretSliderRef, 'pointerup', handleFretSliderPointerUp);
  }
});
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

.fret-slider-track {
  border: 1px solid var(--control-border);

  .slider-btn {
    position: absolute;
    top: 4px;
    bottom: 4px;
    left: 4px;
    width: calc(33.33% - 2.66px);
    background: var(--bg-panel);
    border-radius: 0.75rem;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
    border: 1px solid var(--control-border);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 1;
  }

  .fret-option-text {
    color: @text-body;
    opacity: 0.5;

    &.is-active {
      color: @brand-primary;
      opacity: 1;
    }
  }
}

.dark {
  .fret-slider-track {
    .slider-btn {
      background: #334155;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    }
    .fret-option-text.is-active {
      color: #3b82f6 !important;
    }
  }
}
</style>
