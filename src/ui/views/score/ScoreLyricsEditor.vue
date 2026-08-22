<template>
  <div class="lyrics-editor-zone">
    <textarea
      v-model="localLyrics"
      :readonly="!isGlobalEditable"
      class="lyrics-textarea no-scrollbar"
      placeholder="在此处输入或粘贴歌词文本..."
    />
  </div>
</template>

<script setup lang="ts">
import { isGlobalEditable } from '@/stores/globalState';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useDebounceFn } from '@vueuse/core';
import { onDeactivated, ref, watch } from 'vue';

defineOptions({ name: 'ScoreLyricsEditor' });

const scoreEditor = useScoreEditorStore();
const localLyrics = ref(scoreEditor.activeSong?.lyrics ?? '');

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
  padding: @space-xl;
  box-sizing: border-box;
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

  &:focus:not(:read-only) {
    border-color: var(--color-primary);
  }

  &:read-only {
    cursor: default;
    user-select: none;
  }
}
</style>
