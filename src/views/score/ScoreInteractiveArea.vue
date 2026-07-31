<template>
  <div class="interactive-score-zone no-scrollbar">
    <div v-if="!songStore.activeSong?.lyrics.trim()" class="empty-lyrics-tip">请先在“编辑歌词”模式下输入文本内容</div>

    <div v-else class="lyrics-lines-container">
      <div v-for="(line, lIdx) in lyricsLines" :key="lIdx" class="lyrics-line" @dragover.prevent="handleGlobalDragOver">
        <!-- 0. 行号索引 -->
        <div class="line-index-badge">{{ formatLineIndex(lIdx) }}</div>

        <!-- 1. 行首插槽区域 -->
        <div class="edge-chords-group" @dragover.prevent="handleGlobalDragOver">
          <!-- 行首添加按钮 -->
          <div
            class="char-box edge-slot add-btn-slot"
            :class="{ 'is-drop-target': dragOverSlotKey === getNextStartSlotKey(lIdx) }"
            @click="emit('open-picker', getNextStartSlotKey(lIdx))"
            @dragover.prevent="handleDragOver($event, getNextStartSlotKey(lIdx))"
            @dragleave="handleDragLeave"
            @drop="handleDrop(getNextStartSlotKey(lIdx))"
          >
            <div class="chord-display-slot"></div>
            <span class="add-edge-placeholder" title="点击添加行首和弦">+和弦</span>
          </div>

          <!-- 已绑定的行首和弦 -->
          <div
            v-for="item in getEdgeBoundChords(lIdx, 'start')"
            :key="item.slotKey"
            class="char-box edge-slot"
            :class="{ 'is-drop-target': dragOverSlotKey === item.slotKey }"
            @click="emit('open-picker', item.slotKey)"
            @dragover.prevent="handleDragOver($event, item.slotKey)"
            @dragleave="handleDragLeave"
            @drop="handleDrop(item.slotKey)"
          >
            <div class="chord-display-slot">
              <div
                class="inline-fretboard-card"
                draggable="true"
                title="点击更换/移除和弦，按住可拖拽换位"
                @dragstart.stop="handleDragStart(item.slotKey)"
                @dragend="handleDragEnd"
              >
                <span class="inline-chord-name">{{ item.chord.chordName }}</span>
                <Fretboard
                  :interactive="false"
                  :scale="0.28"
                  :strings="item.chord.strings"
                  :capo="item.chord.capo"
                  :fret-count="item.chord.fretCount"
                  :is-dark-mode="settingsStore.isDarkMode"
                />
              </div>
            </div>
            <div class="char-baseline-shim"></div>
          </div>
        </div>

        <!-- 2. 中间字符和弦区 -->
        <div
          v-for="item in line"
          :key="item.globalIndex"
          class="char-box"
          :class="{
            'is-drop-target': dragOverSlotKey === item.globalIndex,
            'has-chord': Boolean(songStore.activeSong?.chordMap[item.globalIndex]),
          }"
          @click="emit('open-picker', item.globalIndex)"
          @dragover.prevent="handleDragOver($event, item.globalIndex)"
          @dragleave="handleDragLeave"
          @drop="handleDrop(item.globalIndex)"
          :title="songStore.activeSong?.chordMap[item.globalIndex] ? '点击更换或清除和弦' : '点击添加和弦'"
        >
          <div class="chord-display-slot">
            <template v-if="songStore.activeSong?.chordMap[item.globalIndex]">
              <div
                class="inline-fretboard-card"
                draggable="true"
                title="点击更换/移除和弦，按住可拖拽换位"
                @dragstart.stop="handleDragStart(item.globalIndex)"
                @dragend="handleDragEnd"
              >
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
          <span class="char-text">
            {{ item.char }}
          </span>
        </div>

        <!-- 3. 行尾插槽区域 -->
        <div class="edge-chords-group" @dragover.prevent="handleGlobalDragOver">
          <!-- 已绑定的行尾和弦 -->
          <div
            v-for="item in getEdgeBoundChords(lIdx, 'end')"
            :key="item.slotKey"
            class="char-box edge-slot"
            :class="{ 'is-drop-target': dragOverSlotKey === item.slotKey }"
            @click="emit('open-picker', item.slotKey)"
            @dragover.prevent="handleDragOver($event, item.slotKey)"
            @dragleave="handleDragLeave"
            @drop="handleDrop(item.slotKey)"
          >
            <div class="chord-display-slot">
              <div
                class="inline-fretboard-card"
                draggable="true"
                title="点击更换/移除和弦，按住可拖拽换位"
                @dragstart.stop="handleDragStart(item.slotKey)"
                @dragend="handleDragEnd"
              >
                <span class="inline-chord-name">{{ item.chord.chordName }}</span>
                <Fretboard
                  :interactive="false"
                  :scale="0.28"
                  :strings="item.chord.strings"
                  :capo="item.chord.capo"
                  :fret-count="item.chord.fretCount"
                  :is-dark-mode="settingsStore.isDarkMode"
                />
              </div>
            </div>
            <div class="char-baseline-shim"></div>
          </div>

          <!-- 行尾添加按钮 -->
          <div
            class="char-box edge-slot add-btn-slot"
            :class="{ 'is-drop-target': dragOverSlotKey === getNextEndSlotKey(lIdx) }"
            @click="emit('open-picker', getNextEndSlotKey(lIdx))"
            @dragover.prevent="handleDragOver($event, getNextEndSlotKey(lIdx))"
            @dragleave="handleDragLeave"
            @drop="handleDrop(getNextEndSlotKey(lIdx))"
          >
            <div class="chord-display-slot"></div>
            <span class="add-edge-placeholder" title="点击添加行尾和弦">+和弦</span>
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
import type { Chord } from '@/types';
import { computed, onBeforeUnmount, ref } from 'vue';

const emit = defineEmits<{
  (e: 'open-picker', slotKey: string | number): void;
}>();

const songStore = useSongStore();
const settingsStore = useSettingsStore();

const draggingSlotKey = ref<string | number | null>(null);
const dragOverSlotKey = ref<string | number | null>(null);

const formatLineIndex = (index: number) => String(index + 1).padStart(2, '0');

const handleDragStart = (slotKey: string | number) => {
  draggingSlotKey.value = slotKey;
  document.body.classList.add('is-global-dragging');
};

const handleGlobalDragOver = (e: DragEvent) => {
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move';
  }
};

const handleDragOver = (e: DragEvent, slotKey: string | number) => {
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move';
  }
  if (dragOverSlotKey.value !== slotKey) {
    dragOverSlotKey.value = slotKey;
  }
};

const handleDragLeave = (e: DragEvent) => {
  const currentTarget = e.currentTarget as HTMLElement;
  const relatedTarget = e.relatedTarget as HTMLElement;
  if (!currentTarget || !relatedTarget || !currentTarget.contains(relatedTarget)) {
    dragOverSlotKey.value = null;
  }
};

const handleDragEnd = () => {
  draggingSlotKey.value = null;
  dragOverSlotKey.value = null;
  document.body.classList.remove('is-global-dragging');
};

onBeforeUnmount(() => {
  document.body.classList.remove('is-global-dragging');
});

const handleDrop = (targetSlotKey: string | number) => {
  if (!draggingSlotKey.value || !songStore.activeSong) {
    handleDragEnd();
    return;
  }

  const sourceKey = draggingSlotKey.value;
  if (sourceKey === targetSlotKey) {
    handleDragEnd();
    return;
  }

  const map = songStore.activeSong.chordMap || {};
  const sourceChord = map[sourceKey];
  const targetChord = map[targetSlotKey];

  if (sourceChord) {
    songStore.setCharChord(songStore.activeSong.id, targetSlotKey, sourceChord);
    if (targetChord) {
      songStore.setCharChord(songStore.activeSong.id, sourceKey, targetChord);
    } else {
      songStore.removeCharChord(songStore.activeSong.id, sourceKey);
    }
  }

  handleDragEnd();
};

interface EdgeChordItem {
  slotKey: string;
  chord: Chord;
}

const getNextStartSlotKey = (lineIdx: number): string => {
  const count = getEdgeBoundChords(lineIdx, 'start').length;
  return `line_${lineIdx}_start_${count}`;
};

const getNextEndSlotKey = (lineIdx: number): string => {
  const count = getEdgeBoundChords(lineIdx, 'end').length;
  return `line_${lineIdx}_end_${count}`;
};

const getEdgeBoundChords = (lineIdx: number, type: 'start' | 'end'): EdgeChordItem[] => {
  if (!songStore.activeSong || !songStore.activeSong.chordMap) return [];
  const prefix = `line_${lineIdx}_${type}_`;
  const result: EdgeChordItem[] = [];

  let count = 0;
  while (songStore.activeSong.chordMap[`${prefix}${count}`]) {
    result.push({
      slotKey: `${prefix}${count}`,
      chord: songStore.activeSong.chordMap[`${prefix}${count}`],
    });
    count++;
  }

  if (type === 'start') {
    return result.reverse();
  }
  return result;
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
  gap: 0 !important;
  align-items: stretch;
  width: max-content;
  min-width: 100%;
  padding: 0.3rem 0.4rem;
  border-radius: @radius-md;
  transition: background-color @duration-fast ease;

  &:hover {
    background-color: var(--bg-panel-hover);

    .line-index-badge {
      color: var(--color-primary);
    }

    .add-btn-slot .add-edge-placeholder {
      opacity: 1;
      pointer-events: auto;
    }
  }
}

.line-index-badge {
  font-size: 0.68rem;
  font-weight: 700;
  font-family: monospace;
  color: var(--text-disabled);
  margin-right: 0.5rem;
  display: flex;
  align-items: flex-end;
  padding-bottom: 0.1rem;
  user-select: none;
  flex-shrink: 0;
  transition: color @duration-fast ease;
}

.edge-chords-group {
  display: flex;
  align-items: stretch;
  gap: 0 !important;
}

.char-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding: 0.15rem 0.12rem;
  align-self: stretch;
  border-radius: @radius-sm;
  box-sizing: border-box;
  transition:
    background-color @duration-fast ease,
    box-shadow @duration-fast ease;
  position: relative;
  cursor: pointer;

  &:hover {
    background-color: color-mix(in srgb, var(--color-primary), transparent 88%);

    .char-text {
      color: var(--color-primary);
    }
  }

  &.is-drop-target {
    background-color: color-mix(in srgb, var(--color-primary), transparent 85%) !important;
    box-shadow: inset 0 0 0 2px var(--color-primary);

    .add-edge-placeholder {
      opacity: 1 !important;
      pointer-events: auto !important;
    }
  }

  &.edge-slot {
    opacity: 0.85;

    &.add-btn-slot {
      opacity: 1;
      padding-left: 0.2rem;
      padding-right: 0.2rem;

      /* 🌟 1. 移除添加和弦占位符的外层 char-box 悬停高亮 */
      &:hover {
        background-color: transparent !important;
      }
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 1.25rem;
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--color-primary);
  opacity: 0;
  pointer-events: none;
  transition:
    opacity @duration-fast ease,
    background-color @duration-fast ease;
  border: 1px dashed var(--color-primary);
  background-color: color-mix(in srgb, var(--color-primary), transparent 92%);
  padding: 0 0.35rem;
  border-radius: @radius-sm;
  white-space: nowrap;
  cursor: pointer;
  box-sizing: border-box;

  &:hover {
    background-color: color-mix(in srgb, var(--color-primary), transparent 80%);
  }
}

.chord-display-slot {
  flex: 1;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  width: 100%;
}

.inline-fretboard-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.12rem 0.15rem;
  border-radius: @radius-sm;
  background-color: transparent;
  border: 1px solid transparent;
  transition: @transition-fast;
  cursor: pointer !important;

  & * {
    cursor: pointer !important;
  }

  &[draggable='true'] {
    cursor: grab !important;

    /* 🌟 2. 和弦卡片按压/激活时设置 opacity: 0.8 */
    &:active {
      cursor: grabbing !important;
      opacity: 0.8 !important;
    }
  }

  &:hover {
    background-color: color-mix(in srgb, var(--text-title), transparent 90%);
    border-color: var(--border-light);
  }
}

.inline-chord-name {
  font-size: 0.62rem;
  font-weight: 800;
  color: var(--text-title);
  line-height: 1;
  margin-bottom: 0.1rem;
}

.char-text {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-title);
  line-height: 1.15rem;
  padding: 0 0.08rem;
  border-radius: 0 !important;
  transition:
    color @duration-fast ease,
    border-color @duration-fast ease;
  border-bottom: 1.5px solid transparent;
  box-sizing: border-box;

  .has-chord & {
    border-bottom: 1.5px dashed var(--text-disabled);
  }
}
</style>

<style lang="less">
body.is-global-dragging {
  cursor: grabbing !important;

  * {
    cursor: grabbing !important;
  }

  .interactive-score-zone {
    .char-text,
    .inline-chord-name,
    .fretboard-layout-scaler,
    .line-index-badge,
    svg {
      pointer-events: none !important;
    }

    .char-box {
      pointer-events: auto !important;
    }
  }
}
</style>
