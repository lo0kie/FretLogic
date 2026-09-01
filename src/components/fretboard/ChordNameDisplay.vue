<template>
  <span
    v-if="resolvedSegments"
    class="chord-name-display inline-flex items-baseline align-middle leading-none max-w-full overflow-hidden text-ellipsis select-none whitespace-nowrap tabular-nums"
    :class="sizeClass"
  >
    <span class="chord-root-group inline align-baseline whitespace-nowrap">
      <span class="chord-root-letter">{{ resolvedSegments.root[0] }}</span>
      <span
        v-if="resolvedSegments.root[1] !== 0"
        class="chord-accidental inline-block text-[0.72em] font-bold leading-none relative -top-[0.32em] align-baseline ml-[0.06em] mr-[0.04em] font-[inherit]"
      >
        {{ formatAccidental(resolvedSegments.root[1]) }}
      </span>
    </span>

    <span v-if="formattedData.quality" class="chord-quality font-[inherit]">{{ formattedData.quality }}</span>

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
import { computed, getCurrentInstance } from 'vue';
import { useRoute } from 'vue-router';

interface Props {
  chord?: Chord | null;
  segments?: ChordNameSegments | null;
  name?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'inherit';
  useUnicode?: boolean;
  shorthand?: boolean;
  isScoreMode?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  chord: null,
  segments: null,
  name: null,
  size: 'inherit',
  useUnicode: true,
  shorthand: undefined,
  isScoreMode: undefined,
});

let routeInstance: ReturnType<typeof useRoute> | null = null;
try {
  const instance = getCurrentInstance();
  if (instance?.appContext.config.globalProperties.$route) {
    routeInstance = useRoute();
  }
} catch {
  routeInstance = null;
}

const isScoreMode = computed(() => {
  if (props.isScoreMode !== undefined) return props.isScoreMode;
  return routeInstance?.path === '/score';
});
const settingsStore = useSettingsStore();

const effectiveShorthand = computed(() => {
  if (props.shorthand !== undefined) return props.shorthand;
  return isScoreMode.value ? settingsStore.scoreChordShorthand : settingsStore.workbenchChordShorthand;
});

const SIZE_CLASS_MAP: Record<string, string> = {
  xs: 'text-[11px]',
  sm: 'text-[13px]',
  md: 'text-[15px]',
  lg: 'text-[18px]',
};

const sizeClass = computed(() => (props.size ? (SIZE_CLASS_MAP[props.size] ?? '') : ''));

const resolvedSegments = computed<ChordNameSegments | null>(() => {
  if (props.segments) return props.segments;
  if (props.chord?.nameSegments) return props.chord.nameSegments;
  if (props.name) return nameToSegments(props.name);
  if (props.chord) {
    const rawName = getChordName(props.chord);
    if (rawName) return nameToSegments(rawName);
  }
  return null;
});

const formattedData = computed<{ quality: string; extensions: ExtensionSegment[] }>(() => {
  let quality = resolvedSegments.value?.quality ?? resolvedSegments.value?.unknownQuality ?? '';
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
  return props.name || (props.chord ? getChordName(props.chord, { shorthand: effectiveShorthand.value }) : '');
});

const formatAccidental = (acc: AccidentalType) => formatAccidentalTheory(acc, props.useUnicode);
</script>
