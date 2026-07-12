<template>
  <div class="fret-slider-container">
    <label class="fret-label">显示范围</label>

    <GlobalTooltip content="点击或左右拖拽滑块切换显示品数" placement="top">
      <div ref="fretSliderRef" class="fret-slider-track">
        <div
          class="fret-slider-thumb"
          :style="{
            transform: `translateX(calc(${(editorStore.fretCount - 3) * 100}% + ${0}rem))`,
          }"
        ></div>

        <div
          v-for="f in FRET_COUNTS"
          :key="f"
          @click="editorStore.fretCount = f"
          class="fret-slider-item"
          :class="{ 'is-active': editorStore.fretCount === f }"
        >
          {{ f }} 品
        </div>
      </div>
    </GlobalTooltip>
  </div>
</template>

<script setup lang="ts">
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { FRET_COUNTS } from '@/constants';
import { useEditorStore } from '@/stores/editorStore';
import { useEventListener } from '@vueuse/core';
import { onMounted, ref } from 'vue';

const editorStore = useEditorStore();
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
  if (percent < 0.33) editorStore.fretCount = 3;
  else if (percent < 0.66) editorStore.fretCount = 4;
  else editorStore.fretCount = 5;
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
@import '@/assets/tokens.less';

.fret-slider-container {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  box-sizing: border-box;
}

.fret-label {
  font-size: 0.7rem;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-disabled);
}

.fret-slider-track {
  display: flex;
  padding: 0.2rem;
  height: 2.5rem;
  position: relative;
  align-items: center;
  cursor: pointer;
  touch-action: none;
  user-select: none;
  background-color: var(--bg-body);
  border: @border-solid-base;
  border-radius: @radius-lg;
  box-sizing: border-box;
}

.fret-slider-thumb {
  position: absolute;
  top: 0.2rem;
  bottom: 0.2rem;
  left: 0.2rem;
  width: calc(33.33% - 2.66px);
  z-index: 10;
  background-color: var(--bg-panel);
  border: @border-solid-base;
  border-radius: @radius-md;
  box-shadow: @shadow-sm;
  transition: transform 0.3s @bezier-standard;
  box-sizing: border-box;

  :global(.dark) & {
    box-shadow: @shadow-md;
  }
}

.fret-slider-item {
  flex: 1;
  text-align: center;
  font-size: 16px;
  font-weight: 900;
  z-index: 20;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.5;
  color: var(--text-disabled);
  box-sizing: border-box;
  transition:
    color @duration-fast,
    opacity @duration-fast;

  &.is-active {
    opacity: 1;
    color: var(--color-primary);
  }
}
</style>
