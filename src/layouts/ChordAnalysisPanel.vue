<template>
  <Transition name="panel-fade">
    <div class="chord-analysis-panel" v-if="!uiStore.isMobile || analysis.notes.length > 0">
      <!-- 面板头部 -->
      <div class="panel-header">
        <div class="header-icon-wrapper">
          <Sparkles class="header-icon" :size="13" stroke-width="2.5" />
        </div>
        <span class="header-title">和弦实时分析</span>
      </div>

      <template v-if="analysis.notes.length > 0">
        <!-- 左右两栏包裹容器 (Flex 布局) -->
        <div class="analysis-flex-container">
          <!-- 1. 候选和弦胶囊标签组 (左侧：高度动态绑定右侧) -->
          <div class="section-block candidates-section">
            <div class="section-label">推荐候选</div>
            <div
              class="candidate-tags no-scrollbar"
              :style="uiStore.isMobile ? { height: `${rightListHeight}px` } : {}"
            >
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

          <div class="panel-divider desktop-divider" />

          <!-- 2. 构成音明细列表 (右侧：作为高度源头) -->
          <div class="section-block is-grow notes-section">
            <div class="section-label">构成音 (低音 ➔ 高音)</div>
            <div class="notes-list" ref="rightSectionRef">
              <div
                v-for="(note, idx) in analysis.notes"
                :key="idx"
                class="note-row"
                :class="{ 'is-root': note.isRoot }"
              >
                <div class="note-left-group">
                  <span class="string-indicator">{{ 6 - note.stringIndex }}弦</span>
                  <span class="note-name-text">{{ note.label }}</span>
                </div>
                <span class="interval-tag">{{ note.interval }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 空状态 (仅在 PC 端且无按音时显示) -->
      <div v-else class="empty-analysis-state">
        <Music :size="24" stroke-width="1.5" class="empty-icon" />
        <span class="empty-text">在指板上按音以分析</span>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { useEditorStore } from '@/stores/editorStore';
import { useUiStore } from '@/stores/uiStore';
import { analyzeChordGraph, type CandidateResult, type NoteInput } from '@/utils/chordEngine';
import { calcNoteLabel, calcPitchIndex } from '@/utils/musicTheory';
import { Music, Sparkles } from '@lucide/vue';
import { useElementSize } from '@vueuse/core';
import { computed, ref } from 'vue';

const editorStore = useEditorStore();
const uiStore = useUiStore();

// 🌟 获取右侧构成音区域的 DOM 引用和实时高度
const rightSectionRef = ref<HTMLElement | null>(null);
const { height: rightListHeight } = useElementSize(rightSectionRef);

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
  const isSelected = editorStore.currentChordName === candidate.chordName;

  if (isSelected) {
    editorStore.currentChordName = '';
    editorStore.strings.forEach(str => {
      str.isRoot = false;
    });
  } else {
    editorStore.currentChordName = candidate.chordName;
    editorStore.strings.forEach((str, sIdx) => {
      if (str.fret >= 0) {
        const pitch = calcPitchIndex(sIdx, str.fret, editorStore.capo, editorStore.activeBaseStrings);
        str.isRoot = pitch === candidate.rootPitch;
      }
    });
  }
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
  height: auto;
  max-height: calc(100vh - 5rem);
  padding: 0.85rem;

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
  overflow-y: auto;
  overflow: hidden;
}

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

.analysis-flex-container {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  width: 100%;
}

.section-block {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;

  &.is-grow {
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

.candidate-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.28rem;
  max-height: 3.8rem;
  overflow-y: auto;
  flex-shrink: 0;
  padding: 0.1rem;
  align-content: flex-start;
  align-items: flex-start;
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

  &:active,
  &:hover {
    background-color: var(--bg-panel-hover);
    border-color: var(--border-base);
    color: var(--text-title);
  }

  &:active {
    transform: scale(0.92);
  }

  &.is-active {
    background-color: var(--color-primary);
    color: #ffffff;
    border-color: transparent;
    transform: scale(1.04);
    box-shadow: 0 3px 10px color-mix(in srgb, var(--color-primary), transparent 50%);
  }
}

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

/* 渐入渐出过渡动画 */
.panel-fade-enter-active,
.panel-fade-leave-active {
  transition: all @duration-base @bezier-standard;
}

.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.96);
}

/* 📱 移动端自适应 */
@media (max-width: 768px) {
  .chord-analysis-panel {
    position: relative;
    right: auto;
    top: auto;
    width: 100%;
    margin-top: 0;
    max-height: none;
    box-shadow: var(--shadow-md);
  }

  /* 左右两列水平排布 */
  .analysis-flex-container {
    flex-direction: row;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .candidates-section {
    flex: 1.2;
    display: flex;
    flex-direction: column;
  }

  .notes-section {
    flex: 0.8;
    display: flex;
    flex-direction: column;
  }

  /* 🌟 左侧标签区域高度直接受右侧动态像素高度控制并支持独立滚动 */
  .candidate-tags {
    max-height: none !important;
    overflow-y: auto;
    box-sizing: border-box;
    gap: 0.35rem; /* 稍微加大间距防拥挤 */
  }

  /* 🌟 移动端放大候选和弦胶囊标签 */
  .candidate-badge {
    font-size: 0.78rem; /* 从 0.68rem 放大 */
    padding: 0.32rem 0.7rem; /* 增加内边距，扩大触控热区 */
  }

  .desktop-divider {
    display: none;
  }
}
</style>
