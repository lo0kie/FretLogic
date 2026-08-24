<template>
  <div class="lyrics-editor-zone">
    <textarea
      v-model="localLyrics"
      :readonly="!isGlobalEditable"
      class="lyrics-textarea no-scrollbar"
      placeholder="在此处输入或粘贴歌词文本..."
    />
    <div class="lyrics-meta">{{ localLyrics.length }} 字</div>
  </div>
</template>

<script setup lang="ts">
import { isGlobalEditable } from '@/stores/globalState';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useDebounceFn } from '@vueuse/core';
import { onDeactivated, ref, watch } from 'vue';

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

onDeactivated(() => {
  const value = localLyrics.value;
  if (value !== (scoreEditor.activeSong?.lyrics ?? '')) {
    scoreEditor.updateLyrics(value);
  }
});
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.lyrics-editor-zone {
  flex: 1;
  padding: @space-xl @space-2xl;
  box-sizing: border-box;
}

.lyrics-meta {
  position: absolute;
  right: @space-xl * 1.5;
  bottom: @space-xl * 1.5;
  font-size: @fs-sm;
  color: var(--text-muted);
  padding: 2px 8px;
  border-radius: @radius-sm;
  pointer-events: none;
  opacity: 0.8;
}

.lyrics-textarea {
  width: 100%;
  height: 100%;
  background-color: var(--bg-panel);
  border: 1px solid var(--glass-border);
  border-radius: @radius-lg;
  padding: @space-xl;
  font-size: @fs-base;
  line-height: 1.8;
  color: var(--text-title);
  outline: none;
  resize: none;
  box-sizing: border-box;
  font-family: inherit;
  transition:
    border-color @duration-base,
    box-shadow @duration-base;

  &:focus:not(:read-only) {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px var(--tint-primary-90);
  }

  &:read-only {
    cursor: default;
    user-select: none;
    background-color: var(--bg-main);
  }
}
</style>
