<template>
  <div class="chord-analysis-wrapper">
    <div class="chord-analysis-panel">
      <!-- 面板头部 -->
      <div class="panel-header">
        <div class="header-icon-wrapper">
          <Sparkles class="header-icon" :size="13" stroke-width="2.5" />
        </div>
        <span class="header-title">和弦分析</span>
      </div>

      <template v-if="analysis.notes.length > 0">
        <ChordAnalysisContent
          :candidates="analysis.candidates"
          :active-chord-name="getChordName(editorStore.draftChord)"
          :notes="analysis.notes"
          @select-candidate="handleSelectCandidate"
        />
      </template>

      <!-- PC端空状态 -->
      <EmptyState v-else :icon="Music" description="在指板上按音以分析" size="md" />
    </div>
  </div>
</template>

<script setup lang="ts">
import EmptyState from '@/components/EmptyState.vue';
import { analyzeChordGraph } from '@/services/music/chordEngine';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import type { CandidateResult } from '@/types/engine.ts';
import {
  calcPitchIndex,
  canTogglePitchAccidental,
  collectChordNotes,
  getChordName,
  nameToSegments,
  segmentsToString,
} from '@/utils/musicTheory';
import { Music, Sparkles } from '@lucide/vue';
import { computed } from 'vue';
import ChordAnalysisContent, { type RenderNoteItem } from './ChordAnalysisContent.vue';

const editorStore = useChordEditorStore();

const INTERVAL_MAP: Record<number, { degree: string; acc: '' | 'b' | '#' }> = {
  0: { degree: '1', acc: '' },
  1: { degree: '2·9', acc: 'b' },
  2: { degree: '2·9', acc: '' },
  3: { degree: '3', acc: 'b' },
  4: { degree: '3', acc: '' },
  5: { degree: '4·11', acc: '' },
  6: { degree: '5', acc: 'b' },
  7: { degree: '5', acc: '' },
  8: { degree: '5', acc: '#' },
  9: { degree: '6·13', acc: '' },
  10: { degree: '7', acc: 'b' },
  11: { degree: '7', acc: '' },
};

const graphAnalysis = computed(() => {
  const strings = editorStore.draftChord.strings;
  const capo = editorStore.draftChord.capo;
  const baseStrings = editorStore.activeBaseStrings;

  const { notes: rawNotes } = collectChordNotes(strings, capo, baseStrings);
  if (rawNotes.length === 0) {
    return null;
  }

  let explicitRootPitch: number | null = null;
  const rootIdx = editorStore.draftChord.rootStringIndex;
  if (rootIdx !== null && strings[rootIdx]?.[0] !== undefined && strings[rootIdx]![0] >= 0) {
    explicitRootPitch = calcPitchIndex(rootIdx, strings[rootIdx]![0], capo, baseStrings);
  }

  const { candidates, bestRootPitch } = analyzeChordGraph(rawNotes, explicitRootPitch);
  return { strings, capo, baseStrings, rawNotes, candidates, bestRootPitch };
});

const analysis = computed(() => {
  const graph = graphAnalysis.value;
  if (!graph)
    return {
      notes: [] as RenderNoteItem[],
      candidates: [] as CandidateResult[],
    };

  const { strings, capo, baseStrings, rawNotes, candidates, bestRootPitch } = graph;
  const currentDraftName = getChordName(editorStore.draftChord);
  const selectedCandidate = candidates.find(c => c.chordName === currentDraftName);
  const activeRootPitch = selectedCandidate ? selectedCandidate.rootPitch : bestRootPitch;

  const notes: RenderNoteItem[] = rawNotes
    .map(n => {
      const semitones = (n.pitchIndex - activeRootPitch + 12) % 12;
      const stringObj = strings[n.stringIndex];
      const canToggle =
        stringObj !== undefined && canTogglePitchAccidental(n.stringIndex, stringObj[0], capo, baseStrings);
      const interval = INTERVAL_MAP[semitones] || { degree: `${semitones}半音`, acc: '' };

      return {
        ...n,
        intervalDegree: interval.degree,
        intervalAccidental: interval.acc,
        isRoot: n.stringIndex === editorStore.draftChord.rootStringIndex,
        canAccidentalToggle: canToggle,
      };
    })
    .reverse();

  return { notes, candidates };
});

const isCandidateSelected = (candidate: CandidateResult): boolean => {
  const currentDraftName = getChordName(editorStore.draftChord).trim();
  if (!currentDraftName) return false;
  if (currentDraftName === candidate.chordName.trim()) return true;
  const candidateFormatted = candidate.segments ? segmentsToString(candidate.segments).trim() : '';
  return candidateFormatted === currentDraftName;
};

const handleSelectCandidate = (candidate: CandidateResult) => {
  const isSelected = isCandidateSelected(candidate);

  if (isSelected) {
    editorStore.draftChord.nameSegments = null;
    editorStore.draftChord.rootStringIndex = null;
  } else {
    let rootAssigned = false;
    if (candidate.segments) {
      editorStore.draftChord.nameSegments = candidate.segments;
    } else {
      const segs = nameToSegments(candidate.chordName);
      editorStore.draftChord.nameSegments = segs;
    }
    editorStore.draftChord.strings.forEach((str, sIdx) => {
      if (str[0] >= 0 && !rootAssigned) {
        const pitch = calcPitchIndex(sIdx, str[0], editorStore.draftChord.capo, editorStore.activeBaseStrings);
        if (pitch === candidate.rootPitch) {
          editorStore.draftChord.rootStringIndex = sIdx;
          rootAssigned = true;
        }
      }
    });
    if (!rootAssigned) editorStore.draftChord.rootStringIndex = null;
  }
};
</script>

<style scoped lang="scss">
.chord-analysis-wrapper {
  transition:
    max-height $duration-slow $bezier-sidebar,
    margin $duration-slow $bezier-sidebar,
    opacity $duration-fast ease;
  overflow: hidden;
  opacity: 1;
  width: 100%;
}

.chord-analysis-panel {
  position: relative;
  right: auto;
  top: auto;
  width: 100%;
  height: auto;
  padding: $space-md;
  background-color: var(--bg-panel);
  backdrop-filter: var(--blur-xl);
  -webkit-backdrop-filter: var(--blur-xl);
  border: 1px solid var(--glass-border);
  border-radius: $radius-lg;
  display: flex;
  flex-direction: column;
  gap: $space-sm;
  z-index: var(--z-panel);
  pointer-events: auto;
  box-sizing: border-box;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: $space-sm;
  flex-shrink: 0;
  padding: $space-xs 0 $space-sm 0;
  border-bottom: 1px solid color-mix(in srgb, var(--separator), transparent 45%);
}

.header-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: $radius-sm;
  background-color: var(--tint-primary-88);
  color: var(--color-primary);
}

.header-title {
  font-size: $fs-xs;
  font-weight: 700;
  color: var(--text-title);
  letter-spacing: -0.01em;
}
</style>
