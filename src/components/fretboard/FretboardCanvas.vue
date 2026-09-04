<template>
  <canvas
    :aria-label="ariaLabel"
    :style="canvasStyle"
    class="pointer-events-none box-border block select-none"
    ref="canvasRef"
    role="img"
  />
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch, type CSSProperties } from 'vue';

import { getChordName } from '@/services/music/theory';
import type { Chord } from '@/types';
import { SCORE_EXPORT_CONFIG } from '@/utils/core/constants';
import { createLruCache } from '@/utils/core/lruCache';
import { renderFretboard } from '@/utils/music/fretboard-canvas-renderer';

interface Props {
  chord: Chord;
  scale?: number;
  isDarkMode?: boolean;
  shorthand?: boolean;
  chordNameScale?: number;
}

const props = withDefaults(defineProps<Props>(), {
  scale: 1.0,
  isDarkMode: false,
  shorthand: false,
  chordNameScale: 1.0,
});

const canvasRef = ref<HTMLCanvasElement | null>(null);

const fretCount = computed(() => Math.max(3, props.chord.fretCount || 4));

const BOTTOM_PAD = 6;
const baseWidth = computed(() => SCORE_EXPORT_CONFIG.getExportFretboardWidth(props.chord.strings?.length || 6));
const baseHeight = computed(
  () => SCORE_EXPORT_CONFIG.FRETBOARD_GRID_TOP + fretCount.value * SCORE_EXPORT_CONFIG.FRET_HEIGHT + BOTTOM_PAD
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
  props.isDarkMode ? SCORE_EXPORT_CONFIG.THEME.DARK : SCORE_EXPORT_CONFIG.THEME.LIGHT
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

onMounted(() => {
  draw();
});

watch(
  [() => props.chord, () => props.scale, () => props.isDarkMode, () => props.shorthand, () => props.chordNameScale],
  () => {
    draw();
  },
  { deep: true }
);
</script>
