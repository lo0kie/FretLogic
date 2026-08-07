<template>
  <div class="chord-analysis-wrapper" :class="{ 'is-empty-hidden': uiStore.isMobile && analysis.notes.length === 0 }">
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
          <div class="analysis-flex-container">
            <!-- 1. 推荐候选标签子组件 -->
            <CandidateTags
              :candidates="analysis.candidates"
              :active-chord-name="editorStore.draftChord.chordName"
              :is-mobile="uiStore.isMobile"
              :custom-height="noteListRef?.height"
              @select-candidate="handleSelectCandidate"
            />

            <div class="panel-divider desktop-divider" />

            <!-- 2. 构成音列表子组件 -->
            <NoteIntervalList
              ref="noteListRef"
              :notes="analysis.notes"
              :is-mobile="uiStore.isMobile"
              @set-root-string="handleSetRootString"
              @toggle-pitch-accidental="handleTogglePitchName"
            />
          </div>
        </template>

        <!-- 空状态 -->
        <EmptyState v-else :icon="Music" description="在指板上按音以分析" size="md" />
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { useEditorStore } from '@/stores/chordEditorStore';
import { useUiStore } from '@/stores/uiStore';
import { calcNoteLabel, calcPitchIndex, canTogglePitchAccidental } from '@/utils/musicTheory';
import { Music, Sparkles } from '@lucide/vue';
import { computed, useTemplateRef } from 'vue';

import EmptyState from '@/components/EmptyState.vue';
import { CandidateResult, NoteInput } from '@/types/engine.ts';
import { analyzeChordGraph } from '@/utils/chordEngine.ts';
import CandidateTags from './CandidateTags.vue';
import NoteIntervalList, { type RenderNoteItem } from './NoteIntervalList.vue';

const editorStore = useEditorStore();
const uiStore = useUiStore();

const noteListRef = useTemplateRef<InstanceType<typeof NoteIntervalList>>('noteListRef');

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

const analysis = computed(() => {
  const strings = editorStore.draftChord.strings;
  const capo = editorStore.draftChord.capo;
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

      rawNotes.push({ stringIndex: sIdx, pitchIndex: pitch, label });
    }
  });

  if (rawNotes.length === 0) {
    return { notes: [], candidates: [] };
  }

  const { candidates, bestRootPitch } = analyzeChordGraph(rawNotes, explicitRootPitch);
  const selectedCandidate = candidates.find(c => c.chordName === editorStore.draftChord.chordName);
  const activeRootPitch = selectedCandidate ? selectedCandidate.rootPitch : bestRootPitch;

  const notes: RenderNoteItem[] = rawNotes.map(n => {
    const semitones = (n.pitchIndex - activeRootPitch + 12) % 12;
    const stringObj = strings[n.stringIndex];
    const canToggle = canTogglePitchAccidental(n.stringIndex, stringObj.fret, capo, baseStrings);

    return {
      ...n,
      interval: EXACT_INTERVAL_MAP[semitones] || `${semitones}半音`,
      isRoot: n.pitchIndex === activeRootPitch,
      canAccidentalToggle: canToggle,
    };
  });

  return { notes, candidates };
});

const handleTogglePitchName = (sIdx: number) => {
  const str = editorStore.draftChord.strings[sIdx];
  if (canTogglePitchAccidental(sIdx, str.fret, editorStore.draftChord.capo, editorStore.activeBaseStrings)) {
    str.preferFlat = !str.preferFlat;
  }
};

const handleSelectCandidate = (candidate: CandidateResult) => {
  const isSelected = editorStore.draftChord.chordName === candidate.chordName;

  if (isSelected) {
    editorStore.draftChord.chordName = '';
    editorStore.draftChord.strings.forEach(str => {
      str.isRoot = false;
    });
  } else {
    let rootAssigned = false;
    editorStore.draftChord.chordName = candidate.chordName;
    editorStore.draftChord.strings.forEach((str, sIdx) => {
      if (str.fret >= 0) {
        const pitch = calcPitchIndex(sIdx, str.fret, editorStore.draftChord.capo, editorStore.activeBaseStrings);
        const match = pitch === candidate.rootPitch && !rootAssigned;
        str.isRoot = match;
        if (match) rootAssigned = true;
      } else {
        str.isRoot = false;
      }
    });
  }
};

const handleSetRootString = (stringIndex: number) => {
  editorStore.draftChord.strings.forEach((str, sIdx) => {
    str.isRoot = sIdx === stringIndex;
  });
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.chord-analysis-wrapper {
  transition:
    max-height @duration-slow @bezier-sidebar,
    margin @duration-slow @bezier-sidebar,
    opacity @duration-fast ease;
  overflow: hidden;
  opacity: 1;
  width: 100%; /* 🌟 确保外层包裹器填满父容器 */
}

.chord-analysis-panel {
  /* 🌟 移除内部的绝对定位，由外层布局容器统一控制 */
  position: relative;
  right: auto;
  top: auto;

  width: 100%; /* 🌟 填满外层容器，不再固定 13.8rem */
  height: auto;
  max-height: calc(100vh - 5rem); /* 保留最大高度限制，防止溢出 */
  padding: 0.85rem;
  background-color: var(--bg-panel);
  backdrop-filter: blur(28px) saturate(190%);
  -webkit-backdrop-filter: blur(28px) saturate(190%);
  border: 1px solid var(--glass-border);
  border-radius: @radius-lg;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  z-index: 10;
  pointer-events: auto;
  box-sizing: border-box;
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

@media (max-width: 768px) {
  .chord-analysis-wrapper {
    width: 100%;
    margin-bottom: 0.5rem;

    &.is-empty-hidden {
      max-height: 0;
      margin-bottom: 0;
      opacity: 0;
      pointer-events: none;
    }
  }

  .chord-analysis-panel {
    /* 🌟 移动端同样移除绝对定位 */
    position: relative;
    right: auto;
    top: auto;
    width: 100%;
    margin-top: 0;
    max-height: none;
    box-shadow: var(--shadow-md);
  }

  .analysis-flex-container {
    flex-direction: row;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .desktop-divider {
    display: none;
  }
}
</style>
