<template>
  <canvas
    :aria-label
    :style="canvasStyle"
    class="pointer-events-none box-border block select-none"
    ref="canvasRef"
    role="img"
  />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue';

import { getChordName } from '@/domains/chord/theory/theory';
import type { Chord } from '@/domains/chord/types';
import { renderFretboard } from '@/domains/fretboard/components/renderFretboardCanvas';
import { FRETBOARD_CANVAS_CONFIG } from '@/domains/fretboard/constants';
import { observeVisibility } from '@/platform/utils/common';
import { createLruCache } from '@/platform/utils/lruCache';

interface Props {
  chord: Chord;
  scale?: number;
  isDarkMode?: boolean;
  shorthand?: boolean;
  chordNameScale?: number;
  /** 懒绘制：挂载后不立即绘制，等元素滚入视口才首绘一次；后续参数变化正常重绘。
   *  DOM 尺寸始终由本组件按 scale/fretCount 计算确定，无需外部占位与测量 */
  lazy?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  scale: 1.0,
  isDarkMode: false,
  shorthand: false,
  chordNameScale: 1.0,
  lazy: false,
});

const canvasRef = ref<HTMLCanvasElement | null>(null);

const fretCount = computed(() => Math.max(3, props.chord.fretCount || 4));

const BOTTOM_PAD = 6;
const baseWidth = computed(() => FRETBOARD_CANVAS_CONFIG.getExportFretboardWidth(props.chord.strings?.length || 6));
const baseHeight = computed(
  () => FRETBOARD_CANVAS_CONFIG.FRETBOARD_GRID_TOP + fretCount.value * FRETBOARD_CANVAS_CONFIG.FRET_HEIGHT + BOTTOM_PAD
);

const cssWidth = computed(() => Math.round(baseWidth.value * props.scale));
const cssHeight = computed(() => Math.round(baseHeight.value * props.scale));

const canvasStyle = computed<CSSProperties>(() => ({
  width: `${cssWidth.value}px`,
  height: `${cssHeight.value}px`,
}));

const displayChordName = computed(() => getChordName(props.chord, { shorthand: props.shorthand }));
const ariaLabel = computed(() => `吉他和弦 ${displayChordName.value}`);

const themeColors = computed(() =>
  props.isDarkMode ? FRETBOARD_CANVAS_CONFIG.THEME.DARK : FRETBOARD_CANVAS_CONFIG.THEME.LIGHT
);

const getDpr = () => {
  const userDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return Math.max(userDpr, 2.5);
};

const bitmapCache = createLruCache<ImageBitmap | HTMLCanvasElement>(64, {
  onEvict: (_key, item) => {
    if ('close' in item && typeof item.close === 'function') {
      item.close();
    }
  },
});

function getCacheKey(): string {
  const c = props.chord;
  const strSig = c.strings.map(s => s[0]).join(',');
  const barreSig = (c.barres ?? []).map(b => `${b.fret}:${b.fromString}-${b.toString}`).join('|');
  return `${displayChordName.value}_${c.fretOffset}_${fretCount.value}_${strSig}_${barreSig}_${props.isDarkMode ? 1 : 0}_${props.chordNameScale}_${cssWidth.value}x${cssHeight.value}`;
}

function draw() {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const dpr = getDpr();
  const w = cssWidth.value;
  const h = cssHeight.value;
  if (w <= 0 || h <= 0) return;

  const physicalWidth = Math.round(w * dpr);
  const physicalHeight = Math.round(h * dpr);

  if (canvas.width !== physicalWidth) canvas.width = physicalWidth;
  if (canvas.height !== physicalHeight) canvas.height = physicalHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, physicalWidth, physicalHeight);

  const cacheKey = getCacheKey();
  const cached = bitmapCache.get(cacheKey);
  if (cached) {
    ctx.drawImage(cached, 0, 0, physicalWidth, physicalHeight);
    return;
  }

  ctx.save();
  ctx.scale(dpr * props.scale, dpr * props.scale);
  renderFretboard(ctx, {
    chord: props.chord,
    colors: themeColors.value,
    chordNameScale: props.chordNameScale,
    shorthand: props.shorthand,
  });
  ctx.restore();

  try {
    if (typeof createImageBitmap === 'function') {
      createImageBitmap(canvas).then(bmp => {
        bitmapCache.set(cacheKey, bmp);
      });
    }
  } catch {
    // 忽略不支持环境
  }
}

// 懒绘制状态：lazy 模式下首绘前为 false，期间参数变化不触发绘制（画了也看不见）
const hasDrawn = ref(!props.lazy);
let stopLazyObserver: (() => void) | null = null;

onMounted(() => {
  if (!props.lazy) {
    draw();
    return;
  }
  // 滚入视口才首绘；IntersectionObserver 会考虑祖先滚动容器的裁剪，
  // 故无需向调用方索要滚动根。首绘后停止观察，后续重绘走 watch 与 LRU 缓存
  const el = canvasRef.value;
  if (!el) {
    hasDrawn.value = true;
    draw();
    return;
  }
  stopLazyObserver = observeVisibility(el, visible => {
    if (!visible) return;
    stopLazyObserver?.();
    stopLazyObserver = null;
    hasDrawn.value = true;
    draw();
  });
});

onBeforeUnmount(() => {
  stopLazyObserver?.();
  stopLazyObserver = null;
});

watch(
  [() => props.chord, () => props.scale, () => props.isDarkMode, () => props.shorthand, () => props.chordNameScale],
  () => {
    if (!hasDrawn.value) return;
    draw();
  },
  { deep: true }
);
</script>
