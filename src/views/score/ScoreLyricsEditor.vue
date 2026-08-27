<template>
  <div class="flex-1 p-xl px-2xl box-border relative">
    <textarea
      v-model="localLyrics"
      :readonly="!isGlobalEditable"
      class="no-scrollbar w-full h-full bg-bg-panel border border-glass-border rounded-lg p-xl text-base leading-relaxed text-text-title outline-none resize-none box-border font-inherit transition-all duration-base focus:not-read-only:border-primary focus:not-read-only:ring-2 focus:not-read-only:ring-primary/70 read-only:cursor-default read-only:select-none read-only:bg-bg-main"
      placeholder="在此处输入或粘贴歌词文本..."
    />
    <div
      class="absolute right-9 bottom-9 text-sm text-text-muted py-0.5 px-2 rounded-sm pointer-events-none opacity-80"
    >
      {{ localLyrics.length }} 字
    </div>
  </div>
</template>

<script setup lang="ts">
import { isGlobalEditable } from '@/stores/globalState';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useDebounceFn } from '@vueuse/core';
import { onBeforeUnmount, onDeactivated, ref, watch } from 'vue';

defineOptions({ name: 'ScoreLyricsEditor' });

const MAX_LINE_LENGTH = 100;

const scoreEditor = useScoreEditorStore();
const localLyrics = ref(scoreEditor.activeSong?.lyrics ?? '');

const clampLinesLength = (text: string): string =>
  text
    .split('\n')
    .map(line => (line.length > MAX_LINE_LENGTH ? line.slice(0, MAX_LINE_LENGTH) : line))
    .join('\n');

watch(
  () => [scoreEditor.activeSongId, scoreEditor.activeSong?.lyrics] as const,
  ([, lyrics]) => {
    const next = lyrics ?? '';
    if (next !== localLyrics.value) {
      localLyrics.value = next;
    }
  }
);

const commitLyrics = useDebounceFn((value: string) => {
  if (value === (scoreEditor.activeSong?.lyrics ?? '')) return;
  scoreEditor.updateLyrics(value);
}, 300);

watch(localLyrics, value => {
  const clamped = clampLinesLength(value);
  if (clamped !== value) {
    localLyrics.value = clamped;
    return;
  }
  commitLyrics(value);
});

const flushLyrics = () => {
  const value = localLyrics.value;
  if (value !== (scoreEditor.activeSong?.lyrics ?? '')) {
    scoreEditor.updateLyrics(value);
  }
};

onDeactivated(flushLyrics);
onBeforeUnmount(flushLyrics);
</script>
