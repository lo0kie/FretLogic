<template>
  <span
    v-if="resolvedSegments"
    class="chord-name-display inline-flex items-baseline align-middle leading-none max-w-full overflow-hidden text-ellipsis select-none whitespace-nowrap tabular-nums"
    :class="sizeClass"
  >
    <!-- 根音 -->
    <span class="chord-root-group inline align-baseline whitespace-nowrap">
      <span class="chord-root-letter">{{ resolvedSegments.root[0] }}</span>
      <span
        v-if="resolvedSegments.root[1] !== 0"
        class="chord-accidental inline-block text-[0.72em] font-bold leading-none relative -top-[0.32em] align-baseline ml-[0.06em] mr-[0.04em] font-[inherit]"
      >
        {{ formatAccidental(resolvedSegments.root[1]) }}
      </span>
    </span>

    <!-- 和弦性质/后缀 (m, maj7, sus4, dim 等 / 简写 Δ7, °, +) -->
    <span v-if="formattedData.quality" class="chord-quality font-[inherit]">{{ formattedData.quality }}</span>

    <!-- 扩展/变化音分片 (#9, b5 等) -->
    <template v-if="formattedData.extensions.length > 0">
      <span
        v-for="(ext, idx) in formattedData.extensions"
        :key="idx"
        class="chord-ext-item inline align-baseline whitespace-nowrap"
      >
        <span
          v-if="ext[1]"
          class="chord-accidental inline-block text-[0.72em] font-bold leading-none relative -top-[0.32em] align-baseline ml-[0.06em] mr-[0.04em] font-[inherit]"
        >
          {{ formatAccidental(ext[1]) }}
        </span>
        <span class="chord-ext-degree">{{ ext[0] }}</span>
      </span>
    </template>

    <!-- 斜杠低音 (/G, /C# 等) -->
    <template v-if="resolvedSegments.bass">
      <span class="chord-slash mx-px opacity-85">/</span>
      <span class="chord-bass-group inline align-baseline whitespace-nowrap">
        <span class="chord-bass-letter">{{ resolvedSegments.bass[0] }}</span>
        <span
          v-if="resolvedSegments.bass[1] !== 0"
          class="chord-accidental inline-block text-[0.72em] font-bold leading-none relative -top-[0.32em] align-baseline ml-[0.06em] mr-[0.04em] font-[inherit]"
        >
          {{ formatAccidental(resolvedSegments.bass[1]) }}
        </span>
      </span>
    </template>
  </span>
  <span v-else class="chord-name-display-fallback inline leading-[inherit]" :class="sizeClass">
    {{ fallbackText }}
  </span>
</template>

<script setup lang="ts">
import { useSettingsStore } from '@/stores/settingsStore';
import type { AccidentalType, Chord, ChordNameSegments, ExtensionSegment } from '@/types';
import {
  formatAccidental as formatAccidentalTheory,
  formatChordQuality,
  getChordName,
  nameToSegments,
} from '@/utils/music/musicTheory';
import { computed } from 'vue';

interface Props {
  chord?: Chord | null;
  segments?: ChordNameSegments | null;
  name?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'inherit';
  useUnicode?: boolean;
  shorthand?: boolean;
}

const {
  chord = null,
  segments = null,
  name = null,
  size = 'inherit',
  useUnicode = true,
  shorthand,
} = defineProps<Props>();

const settingsStore = useSettingsStore();

const effectiveShorthand = computed(() => {
  if (shorthand !== undefined) return shorthand;
  return settingsStore.useChordShorthand;
});

const sizeClass = computed(() => {
  switch (size) {
    case 'xs':
      return 'text-[11px]';
    case 'sm':
      return 'text-[13px]';
    case 'md':
      return 'text-[15px]';
    case 'lg':
      return 'text-[18px]';
    default:
      return '';
  }
});

const resolvedSegments = computed<ChordNameSegments | null>(() => {
  if (segments) return segments;
  if (chord?.nameSegments) return chord.nameSegments;
  if (name) return nameToSegments(name);
  return null;
});

const formattedData = computed<{ quality: string; extensions: ExtensionSegment[] }>(() => {
  let quality = resolvedSegments.value?.quality ?? '';
  let extensions = resolvedSegments.value?.extensions ?? [];

  if (effectiveShorthand.value) {
    const b5Idx = extensions.findIndex(([deg, acc]) => (deg === 5 || deg === '5') && acc === -1);
    if ((quality === 'm7' || quality === 'm') && b5Idx >= 0) {
      quality = 'ø7';
      extensions = extensions.filter((_, idx) => idx !== b5Idx);
    } else {
      quality = formatChordQuality(quality, true);
    }
  }

  return { quality, extensions };
});

const fallbackText = computed(() => {
  return name || (chord ? getChordName(chord) : '');
});

const formatAccidental = (acc: AccidentalType) => formatAccidentalTheory(acc, useUnicode);
</script>
