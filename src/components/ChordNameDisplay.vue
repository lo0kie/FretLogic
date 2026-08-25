<template>
  <span v-if="resolvedSegments" class="chord-name-display" :class="[`size-${size}`]">
    <!-- 根音 -->
    <span class="chord-root-group">
      <span class="chord-root-letter">{{ resolvedSegments.root[0] }}</span>
      <span v-if="resolvedSegments.root[1] !== 0" class="chord-accidental">
        {{ formatAccidental(resolvedSegments.root[1]) }}
      </span>
    </span>

    <!-- 和弦性质/后缀 (m, maj7, sus4, dim 等 / 简写 Δ7, °, +) -->
    <span v-if="formattedData.quality" class="chord-quality">{{ formattedData.quality }}</span>

    <!-- 扩展/变化音分片 (#9, b5 等) -->
    <template v-if="formattedData.extensions.length > 0">
      <span v-for="(ext, idx) in formattedData.extensions" :key="idx" class="chord-ext-item">
        <span v-if="ext[1]" class="chord-accidental">{{ formatAccidental(ext[1]) }}</span>
        <span class="chord-ext-degree">{{ ext[0] }}</span>
      </span>
    </template>

    <!-- 斜杠低音 (/G, /C# 等) -->
    <template v-if="resolvedSegments.bass">
      <span class="chord-slash">/</span>
      <span class="chord-bass-group">
        <span class="chord-bass-letter">{{ resolvedSegments.bass[0] }}</span>
        <span v-if="resolvedSegments.bass[1] !== 0" class="chord-accidental">
          {{ formatAccidental(resolvedSegments.bass[1]) }}
        </span>
      </span>
    </template>
  </span>
  <span v-else class="chord-name-display-fallback" :class="[`size-${size}`]">{{ fallbackText }}</span>
</template>

<script setup lang="ts">
import { useSettingsStore } from '@/stores/settingsStore';
import type { AccidentalType, Chord, ChordNameSegments, ExtensionSegment } from '@/types';
import {
  formatAccidental as formatAccidentalTheory,
  formatChordQuality,
  getChordName,
  nameToSegments,
} from '@/utils/musicTheory';
import { computed } from 'vue';

interface Props {
  chord?: Chord | null;
  segments?: ChordNameSegments | null;
  name?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'inherit';
  useUnicode?: boolean;
  shorthand?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  chord: null,
  segments: null,
  name: null,
  size: 'inherit',
  useUnicode: true,
  shorthand: undefined,
});

const settingsStore = useSettingsStore();

const effectiveShorthand = computed(() => {
  if (props.shorthand !== undefined) return props.shorthand;
  return settingsStore.useChordShorthand;
});

const resolvedSegments = computed<ChordNameSegments | null>(() => {
  if (props.segments) return props.segments;
  if (props.chord?.nameSegments) return props.chord.nameSegments;
  if (props.name) return nameToSegments(props.name);
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
  return props.name || (props.chord ? getChordName(props.chord) : '');
});

const formatAccidental = (acc: AccidentalType) => formatAccidentalTheory(acc, props.useUnicode);
</script>

<style scoped lang="scss">
.chord-name-display {
  display: inline-flex;
  align-items: baseline;
  vertical-align: middle;
  line-height: 1;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  font-feature-settings: 'tnum';
  user-select: none;
  white-space: nowrap;
}

.chord-root-group,
.chord-bass-group,
.chord-ext-item {
  display: inline;
  vertical-align: baseline;
  white-space: nowrap;
}

.chord-accidental {
  display: inline-block;
  font-size: 0.72em;
  font-weight: 700;
  line-height: 1;
  position: relative;
  top: -0.32em;
  vertical-align: baseline;
  margin: 0 0.04em 0 0.06em;
  font-family: inherit;
}

.chord-slash {
  margin: 0 1px;
  opacity: 0.85;
}

.chord-quality {
  font-weight: inherit;
}

.chord-name-display-fallback {
  display: inline;
  line-height: inherit;
}

/* 尺寸变体微调 */
.size-xs {
  font-size: 11px;
}

.size-sm {
  font-size: 13px;
}

.size-md {
  font-size: 15px;
}

.size-lg {
  font-size: 18px;
}
</style>
