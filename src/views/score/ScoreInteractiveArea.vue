<template>
  <div class="interactive-score-zone no-scrollbar">
    <div v-if="!songStore.activeSong?.lyrics.trim()" class="empty-lyrics-tip">请先在“编辑歌词”模式下输入文本内容</div>

    <div v-else class="lyrics-lines-container">
      <div v-for="(line, lIdx) in lyricsLines" :key="lIdx" class="lyrics-line">
        <!-- 行首插槽 -->
        <div class="edge-chords-group">
          <div
            v-for="sIndex in getEdgeSlotsCount(lIdx, 'start')"
            :key="`start_${sIndex}`"
            class="char-box edge-slot"
            @click="emit('open-picker', `line_${lIdx}_start_${sIndex - 1}`)"
          >
            <div class="chord-display-slot">
              <template v-if="songStore.activeSong?.chordMap[`line_${lIdx}_start_${sIndex - 1}`]">
                <div class="inline-fretboard-card">
                  <span class="inline-chord-name">
                    {{ songStore.activeSong.chordMap[`line_${lIdx}_start_${sIndex - 1}`].chordName }}
                  </span>
                  <Fretboard
                    :interactive="false"
                    :scale="0.28"
                    :strings="songStore.activeSong.chordMap[`line_${lIdx}_start_${sIndex - 1}`].strings"
                    :capo="songStore.activeSong.chordMap[`line_${lIdx}_start_${sIndex - 1}`].capo"
                    :fret-count="songStore.activeSong.chordMap[`line_${lIdx}_start_${sIndex - 1}`].fretCount"
                    :is-dark-mode="settingsStore.isDarkMode"
                  />
                </div>
              </template>
              <span v-else class="add-edge-placeholder">+和弦</span>
            </div>
            <div class="char-baseline-shim"></div>
          </div>
        </div>

        <!-- 中间字符区 -->
        <div
          v-for="item in line"
          :key="item.globalIndex"
          class="char-box"
          @click="emit('open-picker', item.globalIndex)"
        >
          <div class="chord-display-slot">
            <template v-if="songStore.activeSong?.chordMap[item.globalIndex]">
              <div class="inline-fretboard-card">
                <span class="inline-chord-name">
                  {{ songStore.activeSong.chordMap[item.globalIndex].chordName }}
                </span>
                <Fretboard
                  :interactive="false"
                  :scale="0.28"
                  :strings="songStore.activeSong.chordMap[item.globalIndex].strings"
                  :capo="songStore.activeSong.chordMap[item.globalIndex].capo"
                  :fret-count="songStore.activeSong.chordMap[item.globalIndex].fretCount"
                  :is-dark-mode="settingsStore.isDarkMode"
                />
              </div>
            </template>
          </div>
          <span class="char-text">{{ item.char }}</span>
        </div>

        <!-- 行尾插槽 -->
        <div class="edge-chords-group">
          <div
            v-for="eIndex in getEdgeSlotsCount(lIdx, 'end')"
            :key="`end_${eIndex}`"
            class="char-box edge-slot"
            @click="emit('open-picker', `line_${lIdx}_end_${eIndex - 1}`)"
          >
            <div class="chord-display-slot">
              <template v-if="songStore.activeSong?.chordMap[`line_${lIdx}_end_${eIndex - 1}`]">
                <div class="inline-fretboard-card">
                  <span class="inline-chord-name">
                    {{ songStore.activeSong.chordMap[`line_${lIdx}_end_${eIndex - 1}`].chordName }}
                  </span>
                  <Fretboard
                    :interactive="false"
                    :scale="0.28"
                    :strings="songStore.activeSong.chordMap[`line_${lIdx}_end_${eIndex - 1}`].strings"
                    :capo="songStore.activeSong.chordMap[`line_${lIdx}_end_${eIndex - 1}`].capo"
                    :fret-count="songStore.activeSong.chordMap[`line_${lIdx}_end_${eIndex - 1}`].fretCount"
                    :is-dark-mode="settingsStore.isDarkMode"
                  />
                </div>
              </template>
              <span v-else class="add-edge-placeholder">+和弦</span>
            </div>
            <div class="char-baseline-shim"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Fretboard from '@/components/Fretboard.vue';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSongStore } from '@/stores/songStore';
import { computed } from 'vue';

const emit = defineEmits<{
  (e: 'open-picker', slotKey: string | number): void;
}>();

const songStore = useSongStore();
const settingsStore = useSettingsStore();

const getEdgeSlotsCount = (lineIdx: number, type: 'start' | 'end') => {
  if (!songStore.activeSong) return 1;
  const prefix = `line_${lineIdx}_${type}_`;
  let count = 0;
  while (songStore.activeSong.chordMap[`${prefix}${count}`]) {
    count++;
  }
  return count + 1;
};

interface CharItem {
  char: string;
  globalIndex: number;
}

const lyricsLines = computed(() => {
  if (!songStore.activeSong) return [];
  const text = songStore.activeSong.lyrics;
  const lines: CharItem[][] = [];
  let currentLine: CharItem[] = [];

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '\n') {
      lines.push(currentLine);
      currentLine = [];
    } else {
      currentLine.push({ char, globalIndex: i });
    }
  }
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }
  return lines;
});
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.interactive-score-zone {
  flex: 1;
  padding: 1.2rem 2rem;
  overflow-y: auto;
  overflow-x: auto;
  box-sizing: border-box;
}

.empty-lyrics-tip {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  color: var(--text-disabled);
  font-size: 0.85rem;
}

.lyrics-lines-container {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-width: 900px;
  margin: 0 auto;
  width: max-content;
  min-width: 100%;
}

.lyrics-line {
  display: flex;
  flex-wrap: nowrap !important;
  gap: 0.3rem 0.05rem;
  align-items: flex-end;
  width: max-content;
  min-width: 100%;
}

.edge-chords-group {
  display: flex;
  align-items: flex-end;
  gap: 0.2rem;
}

.char-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  cursor: pointer;
  padding: 0;
  border-radius: @radius-sm;

  &.edge-slot {
    opacity: 0.85;

    .add-edge-placeholder {
      opacity: 0;
      pointer-events: none;
    }

    &:hover .add-edge-placeholder {
      opacity: 1;
      pointer-events: auto;
    }
  }
}

.char-baseline-shim {
  font-size: 0.95rem;
  line-height: 1.1;
  height: 1.25rem;
  width: 0;
  visibility: hidden;
  user-select: none;
}

.add-edge-placeholder {
  font-size: 0.58rem;
  font-weight: 700;
  color: var(--color-primary);
  opacity: 0;
  transition:
    opacity @duration-fast ease,
    border-color @duration-fast ease;
  border: 1px dashed var(--color-primary);
  background-color: color-mix(in srgb, var(--color-primary), transparent 92%);
  padding: 0.1rem 0.25rem;
  border-radius: @radius-sm;
  white-space: nowrap;
}

.chord-display-slot {
  min-height: 3.4rem;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.inline-fretboard-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.15rem 0.2rem;
  border-radius: @radius-sm;
  background-color: transparent;
  border: 1px solid transparent;
  transition: @transition-fast;

  &:hover {
    background-color: var(--bg-panel-hover);
    border-color: var(--border-light);

    .inline-chord-name {
      color: var(--color-primary);
    }
  }
}

.inline-chord-name {
  font-size: 0.62rem;
  font-weight: 800;
  color: var(--text-title);
  line-height: 1;
  margin-bottom: 0.1rem;
  transition: @transition-fast;
}

.char-text {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-title);
  line-height: 1.1;
  padding: 0.1rem 0.12rem;
  border-radius: @radius-sm;
  transition: @transition-fast;

  &:hover {
    background-color: var(--bg-panel-hover);
    color: var(--color-primary);
  }
}
</style>
