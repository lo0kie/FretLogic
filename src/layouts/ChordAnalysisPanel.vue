<template>
  <div class="chord-analysis-panel">
    <!-- 面板头部 -->
    <div class="panel-header">
      <div class="header-icon-wrapper">
        <Sparkles class="header-icon" :size="13" stroke-width="2.5" />
      </div>
      <span class="header-title">和弦实时分析</span>
    </div>

    <template v-if="analysis.notes.length > 0">
      <!-- 1. 候选和弦胶囊标签组 -->
      <div class="section-block">
        <div class="candidate-tags no-scrollbar">
          <button
            v-for="(candidate, index) in analysis.candidates"
            :key="index"
            class="candidate-badge"
            :class="{ 'is-active': editorStore.currentChordName === candidate.chordName }"
            @click="handleSelectCandidate(candidate)"
          >
            {{ candidate.chordName }}
          </button>
        </div>
      </div>

      <div class="panel-divider" />

      <!-- 2. 构成音明细列表 (Apple List) -->
      <div class="section-block flex-1 min-h-0">
        <div class="section-label">构成音 (低音 ➔ 高音)</div>
        <div class="notes-list">
          <div v-for="(note, idx) in analysis.notes" :key="idx" class="note-row" :class="{ 'is-root': note.isRoot }">
            <div class="note-left-group">
              <span class="string-indicator">{{ 6 - note.stringIndex }}弦</span>
              <span class="note-name-text">{{ note.label }}</span>
            </div>
            <span class="interval-tag">{{ note.interval }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- 空状态 -->
    <div v-else class="empty-analysis-state">
      <Music :size="24" stroke-width="1.5" class="empty-icon" />
      <span class="empty-text">在指板上按音以分析</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useEditorStore } from '@/stores/editorStore';
import { analyzeChordGraph, type CandidateResult, type NoteInput } from '@/utils/chordEngine';
import { calcNoteLabel, calcPitchIndex } from '@/utils/musicTheory';
import { Music, Sparkles } from '@lucide/vue';
import { computed } from 'vue';

const editorStore = useEditorStore();

const EXACT_INTERVAL_MAP: Record<number, string> = {
  0: '1',
  1: '♭2',
  2: '2',
  3: '♭3',
  4: '3',
  5: '4',
  6: '♭5',
  7: '5',
  8: '♯5',
  9: '6',
  10: '♭7',
  11: '7',
};

interface RenderNoteItem extends NoteInput {
  isRoot: boolean;
  interval: string;
}

const analysis = computed(() => {
  const strings = editorStore.strings;
  const capo = editorStore.capo;
  const baseStrings = editorStore.activeBaseStrings;

  const rawNotes: NoteInput[] = [];
  let explicitRootPitch: number | null = null;

  strings.forEach((str, sIdx) => {
    if (str.fret >= 0) {
      const pitch = calcPitchIndex(sIdx, str.fret, capo, baseStrings);
      const label = calcNoteLabel(sIdx, str.fret, capo, str.preferFlat, baseStrings);

      if (str.isRoot && explicitRootPitch === null) {
        explicitRootPitch = pitch;
      }

      rawNotes.push({
        stringIndex: sIdx,
        pitchIndex: pitch,
        label,
      });
    }
  });

  if (rawNotes.length === 0) {
    return { notes: [], candidates: [] };
  }

  const { candidates, bestRootPitch } = analyzeChordGraph(rawNotes, explicitRootPitch);

  const selectedCandidate = candidates.find(c => c.chordName === editorStore.currentChordName);
  const activeRootPitch = selectedCandidate ? selectedCandidate.rootPitch : bestRootPitch;

  const notes: RenderNoteItem[] = rawNotes.map(n => {
    const semitones = (n.pitchIndex - activeRootPitch + 12) % 12;
    return {
      ...n,
      interval: EXACT_INTERVAL_MAP[semitones] || `${semitones}半音`,
      isRoot: n.pitchIndex === activeRootPitch,
    };
  });

  return {
    notes,
    candidates,
  };
});

const handleSelectCandidate = (candidate: CandidateResult) => {
  editorStore.currentChordName = candidate.chordName;

  editorStore.strings.forEach((str, sIdx) => {
    if (str.fret >= 0) {
      const pitch = calcPitchIndex(sIdx, str.fret, editorStore.capo, editorStore.activeBaseStrings);
      str.isRoot = pitch === candidate.rootPitch;
    }
  });
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.chord-analysis-panel {
  position: absolute;
  right: 2rem;
  top: 3.5rem;
  transform: none;

  width: 13.8rem;
  height: auto; /* 🌟 改为高度自适应，绝不溢出 */
  max-height: calc(100vh - 5rem);
  padding: 0.85rem;

  /* 🍏 Apple 经典超通透毛玻璃卡片 */
  background-color: var(--bg-panel);
  backdrop-filter: blur(28px) saturate(190%);
  -webkit-backdrop-filter: blur(28px) saturate(190%);
  border: 1px solid var(--glass-border);
  border-radius: @radius-lg;
  box-shadow: var(--shadow-floating);

  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  z-index: 10;
  pointer-events: auto;
  box-sizing: border-box;
  overflow-y: auto; /* 🌟 超出时内部整体滚动，防止破框 */
}

/* 顶栏图标及标题 */
.panel-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
  padding: 0.1rem 0.15rem;
}

.header-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 0.35rem;
  background-color: color-mix(in srgb, var(--color-primary), transparent 88%);
  color: var(--color-primary);
}

.header-title {
  font-size: 0.73rem;
  font-weight: 700;
  color: var(--text-title);
  letter-spacing: -0.01em;
}

.panel-divider {
  height: 1px;
  background-color: var(--border-light);
  opacity: 0.5;
  flex-shrink: 0;
  margin: 0.1rem 0;
}

.section-block {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;

  &.flex-1 {
    flex: 1;
    min-height: 0;
  }
}

.section-label {
  font-size: 0.58rem;
  font-weight: 600;
  color: var(--text-disabled);
  letter-spacing: 0.02em;
  padding-left: 0.2rem;
  flex-shrink: 0;
}

/* 🍎 候选和弦胶囊标签组 */
.candidate-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.28rem;
  max-height: 3.8rem;
  overflow-y: auto;
  flex-shrink: 0;
  padding: 0.1rem;
}

.candidate-badge {
  padding: 0.22rem 0.55rem;
  border-radius: 9999px;
  font-size: 0.68rem;
  font-weight: 600;
  background-color: var(--bg-body);
  border: 1px solid var(--border-light);
  color: var(--text-body);
  cursor: pointer;
  transition: @transition-fast;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);

  &:hover {
    background-color: var(--bg-panel-hover);
    border-color: var(--border-base);
    color: var(--text-title);
  }

  &.is-active {
    background-color: var(--color-primary);
    color: #ffffff;
    border-color: transparent;
    box-shadow: 0 2px 8px color-mix(in srgb, var(--color-primary), transparent 60%);
  }
}

/* 🍎 构成音列表 - Apple iOS 列表卡片流 */
.notes-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  overflow: visible;
  flex: 1;
}

.note-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 1.8rem;
  padding: 0 0.65rem;
  border-radius: @radius-md;
  background-color: var(--bg-body);
  border: 1px solid var(--border-light);
  transition: @transition-fast;
  box-sizing: border-box;

  &:hover {
    border-color: var(--border-base);
    background-color: var(--bg-panel-hover);
  }

  /* 根音的精细 iOS 亮色方案 */
  &.is-root {
    background-color: color-mix(in srgb, var(--color-warning), transparent 90%);
    border-color: color-mix(in srgb, var(--color-warning), transparent 65%);

    .string-indicator {
      color: var(--color-warning);
    }

    .note-name-text {
      color: var(--color-warning);
      font-weight: 800;
    }

    .interval-tag {
      background-color: var(--color-warning);
      color: #ffffff;
      border-color: transparent;
      box-shadow: 0 1px 4px color-mix(in srgb, var(--color-warning), transparent 50%);
    }
  }
}

.note-left-group {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.string-indicator {
  font-size: 0.58rem;
  font-weight: 700;
  color: var(--text-disabled);
  letter-spacing: -0.01em;
}

.note-name-text {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-title);
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
}

/* 🍎 SF 数字音程小胶囊 */
.interval-tag {
  min-width: 1.25rem;
  height: 1rem;
  padding: 0 0.35rem;
  border-radius: 9999px;
  background-color: var(--bg-panel-hover);
  color: var(--text-body);
  border: 1px solid var(--border-light);
  font-size: 0.58rem;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  line-height: 1;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Rounded', sans-serif;
}

/* 空状态 */
.empty-analysis-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  color: var(--text-disabled);
  opacity: 0.45;
  min-height: 10rem;
}

.empty-text {
  font-size: 0.68rem;
  font-weight: 500;
  letter-spacing: -0.01em;
}
</style>
