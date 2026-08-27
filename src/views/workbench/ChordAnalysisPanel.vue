<template>
  <div class="overflow-hidden opacity-100 w-full transition-[max-height,margin,opacity] duration-slow ease-sidebar">
    <div
      class="@container relative w-full h-auto p-3 bg-bg-panel border border-glass-border rounded-lg flex flex-col gap-2 z-panel pointer-events-auto box-border overflow-hidden [container-type:inline-size]"
    >
      <!-- 面板头部 -->
      <div class="flex items-center justify-between gap-2 shrink-0 pb-1.5 border-b border-border-light">
        <div class="flex items-center gap-1.5">
          <div class="flex items-center justify-center w-5 h-5 rounded-md bg-tint-primary-88 text-primary">
            <Sparkles :size="13" stroke-width="2.5" />
          </div>
          <span class="text-xs font-extrabold text-text-title tracking-tight">和弦分析</span>
        </div>
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
      <EmptyState v-else :icon="Music" description="在指板上按音以分析" size="sm" />
    </div>
  </div>
</template>

<script setup lang="ts">
import EmptyState from '@/components/base/EmptyState.vue';
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
} from '@/utils/music/musicTheory';
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
