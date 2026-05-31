<template>
  <div class="flex flex-col gap-2">
    <label class="text-xs font-black uppercase tracking-widest" style="color: var(--text-disabled)">显示范围</label>

    <GlobalTooltip content="点击或左右拖拽滑块切换显示品数" placement="top">
      <div
        ref="fretSliderRef"
        class="fret-slider-track flex p-1 h-10 relative items-center cursor-pointer touch-none select-none"
      >
        <div
          class="fret-slider-thumb absolute top-1 bottom-1 left-1 transition-transform duration-300 z-10"
          style="width: calc(33.33% - 2.66px)"
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
          class="flex-1 text-center text-[16px] font-black z-20 h-full flex items-center justify-center transition-colors"
          :class="chordLabStore.fretCount === f ? 'opacity-100' : 'opacity-50'"
          :style="{ color: chordLabStore.fretCount === f ? 'var(--color-primary)' : 'var(--text-disabled)' }"
        >
          {{ f }} 品
        </div>
      </div>
    </GlobalTooltip>
  </div>
</template>

<script setup lang="ts">
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { useChordLabStore } from '@/stores/chordLabStore';
import { useEventListener } from '@vueuse/core';
import { onMounted, ref } from 'vue';

const chordLabStore = useChordLabStore();
const fretSliderRef = ref<HTMLDivElement | null>(null);
let isFretDragging = false;
let cachedSliderRect: DOMRect | null = null;

const handleFretSliderPointerDown = (e: PointerEvent) => {
  if (!fretSliderRef.value) return;
  isFretDragging = true;
  fretSliderRef.value.setPointerCapture(e.pointerId);
  cachedSliderRect = fretSliderRef.value.getBoundingClientRect();
  updateFretCountFromX(e.clientX);
};

const handleFretSliderPointerMove = (e: PointerEvent) => {
  if (isFretDragging) updateFretCountFromX(e.clientX);
};

const handleFretSliderPointerUp = (e: PointerEvent) => {
  isFretDragging = false;
  if (fretSliderRef.value && fretSliderRef.value.hasPointerCapture(e.pointerId)) {
    fretSliderRef.value.releasePointerCapture(e.pointerId);
  }
  cachedSliderRect = null;
};

const updateFretCountFromX = (clientX: number) => {
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
  background-color: var(--bg-body);
  border: @border-solid-base;
  border-radius: @radius-lg;
}

.fret-slider-thumb {
  background-color: var(--bg-panel);
  border: @border-solid-base;
  border-radius: @radius-md;
  box-shadow: @shadow-sm;
  :global(.dark) & {
    box-shadow: @shadow-md;
  }
}
</style>
