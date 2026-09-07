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
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { getChordName } from '@/domains/chord/theory/theory';
import { computeFretboardLayout, renderFretboard } from '@/domains/fretboard/components/renderFretboardCanvas';
import { DEFAULT_FRET_COUNT, MIN_FRET_COUNT } from '@/domains/fretboard/constants';
import { resolveFretboardCanvasPalette } from '@/domains/fretboard/fretboardCanvasPalette';
import { observeVisibility } from '@/platform/utils/common';
import { createLruCache } from '@/platform/utils/lruCache';

import type { Chord } from '@/domains/chord/types';
import type { CSSProperties } from 'vue';

interface Props {
  chord: Chord;
  scale?: number;
  isDarkMode?: boolean;
  /** 显式指板配色主题（缺省读取当前应用主题；导出面板传此值以固定匹配其背景，独立于应用明暗） */
  theme?: 'light' | 'dark' | 'high-contrast';
  shorthand?: boolean;
  chordNameScale?: number;
  /** 是否显示和弦名（默认 true） */
  showChordName?: boolean;
  /** 是否显示空弦○与静音×标记（默认 true） */
  showOpenStringNotes?: boolean;
  /** 是否显示左侧品号数字（默认 true） */
  showFretNumbers?: boolean;
  /** 是否显示加粗弦枕（默认 true；false 时为普通品丝线条粗细） */
  showBoldNut?: boolean;
  /** 是否绘制大横按（默认 true；false 时隐藏横按梁，仅保留按弦圆点） */
  showBarre?: boolean;
  /** 懒绘制：挂载后不立即绘制，等元素滚入视口才首绘一次；后续参数变化正常重绘。
   *  DOM 尺寸始终由本组件按 scale/fretCount 计算确定，无需外部占位与测量 */
  lazy?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  scale: 1.0,
  isDarkMode: false,
  shorthand: false,
  chordNameScale: 1.0,
  showChordName: true,
  showOpenStringNotes: true,
  showFretNumbers: true,
  showBoldNut: true,
  showBarre: true,
  lazy: false,
});

const canvasRef = ref<HTMLCanvasElement | null>(null);

const fretCount = computed(() => Math.max(MIN_FRET_COUNT, props.chord.fretCount || DEFAULT_FRET_COUNT));

const layout = computed(() =>
  computeFretboardLayout({
    stringCount: props.chord.strings?.length || 6,
    fretCount: fretCount.value,
    fretOffset: props.chord.fretOffset ?? 0,
    showChordName: props.showChordName,
    showOpenStringNotes: props.showOpenStringNotes,
    showFretNumbers: props.showFretNumbers,
    showBoldNut: props.showBoldNut,
  })
);
const baseWidth = computed(() => layout.value.width);
const baseHeight = computed(() => layout.value.height);

const cssWidth = computed(() => Math.round(baseWidth.value * props.scale));
const cssHeight = computed(() => Math.round(baseHeight.value * props.scale));

const canvasStyle = computed<CSSProperties>(() => ({
  width: `${cssWidth.value}px`,
  height: `${cssHeight.value}px`,
}));

const displayChordName = computed(() => getChordName(props.chord, { shorthand: props.shorthand }));
const ariaLabel = computed(() => `吉他和弦 ${displayChordName.value}`);

// 画布配色：从 tokens.scss 的 --fbc-* 变量运行时解析（canvas 2D 无法直接消费 var()）；
// 传了显式 theme 则按其解析（导出面板固定背景配色），否则读取当前应用主题（含 high-contrast）
const resolveThemeColors = () =>
  props.theme ? resolveFretboardCanvasPalette(props.theme) : resolveFretboardCanvasPalette();
const themeColors = ref(resolveThemeColors());

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
  return `${displayChordName.value}_${c.fretOffset}_${fretCount.value}_${strSig}_${barreSig}_${props.isDarkMode ? 1 : 0}_th${props.theme ?? ''}_${props.chordNameScale}_${props.showChordName ? 1 : 0}_${props.showOpenStringNotes ? 1 : 0}_${props.showFretNumbers ? 1 : 0}_${props.showBoldNut ? 1 : 0}_${props.showBarre ? 1 : 0}_${cssWidth.value}x${cssHeight.value}`;
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
    showChordName: props.showChordName,
    showOpenStringNotes: props.showOpenStringNotes,
    showFretNumbers: props.showFretNumbers,
    showBoldNut: props.showBoldNut,
    showBarre: props.showBarre,
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

// 主题切换时重新解析配色再重绘（应用主题变化经 isDarkMode 联动；显式 theme 由导出面板传入）
watch([() => props.isDarkMode, () => props.theme], () => {
  themeColors.value = resolveThemeColors();
  if (hasDrawn.value) draw();
});

watch(
  [
    () => props.chord,
    () => props.scale,
    () => props.shorthand,
    () => props.chordNameScale,
    () => props.showChordName,
    () => props.showOpenStringNotes,
    () => props.showFretNumbers,
    () => props.showBoldNut,
    () => props.showBarre,
  ],
  () => {
    if (!hasDrawn.value) return;
    draw();
  },
  { deep: true }
);
</script>
