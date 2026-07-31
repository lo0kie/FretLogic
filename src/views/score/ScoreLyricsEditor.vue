<template>
  <div class="lyrics-editor-zone">
    <textarea
      :value="songStore.activeSong?.lyrics"
      @input="handleInput"
      class="lyrics-textarea no-scrollbar"
      placeholder="在此处输入或粘贴歌词文本..."
    ></textarea>
  </div>
</template>

<script setup lang="ts">
import { useSongStore } from '@/stores/songStore';

const songStore = useSongStore();

const handleInput = (e: Event) => {
  if (songStore.activeSong) {
    const value = (e.target as HTMLTextAreaElement).value;
    songStore.updateSongLyrics(songStore.activeSong.id, value);
  }
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.lyrics-editor-zone {
  flex: 1;
  padding: 1.5rem;
  box-sizing: border-box;
}

.lyrics-textarea {
  width: 100%;
  height: 100%;
  background-color: var(--bg-panel);
  border: 1px solid var(--glass-border);
  border-radius: @radius-lg;
  padding: 1.2rem;
  font-size: 0.95rem;
  line-height: 1.8;
  color: var(--text-title);
  outline: none;
  resize: none;
  box-sizing: border-box;
  font-family: inherit;

  &:focus {
    border-color: var(--color-primary);
  }
}
</style>
