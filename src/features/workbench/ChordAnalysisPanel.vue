<template>
  <WorkbenchPanel
    :has-content="hasContent"
    :storage-key="STORAGE_KEYS.WORKBENCH_CHORD_ANALYSIS_COLLAPSED"
    icon="sparkles"
    mode-aria-label="和弦分析面板行为"
    title="和弦分析"
  >
    <template #default="{ effectiveExpanded }">
      <Transition mode="out-in">
        <div v-if="hasNotes" class="pt-2" key="content">
          <ChordAnalysisContent
            :active-chord-name="getChordName(editorStore.draftChord)"
            :candidates="analysis.candidates"
            :notes="analysis.notes"
            @select-candidate="handleSelectCandidate"
          />
        </div>
        <p v-else-if="effectiveExpanded" class="form-hint pt-2" key="empty">
          在指板上按出音符后，这里会显示和弦名称与候选分析。
        </p>
      </Transition>
    </template>
  </WorkbenchPanel>
</template>

<script lang="ts" setup>
import { computed } from 'vue';

import { analyzeChordGraph } from '@/services/music/chordEngine';
import {
  calcPitchIndex,
  canTogglePitchAccidental,
  collectChordNotes,
  getChordName,
  nameToSegments,
  parsePitchSegment,
  segmentsToString,
} from '@/services/music/theory';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import type { CandidateResult } from '@/types/engine.ts';
import { STORAGE_KEYS } from '@/utils/core/constants';
import { toStringIndex } from '@/utils/music/chord-fretboard';

import ChordAnalysisContent, { type RenderNoteItem } from './ChordAnalysisContent.vue';
import WorkbenchPanel from './WorkbenchPanel.vue';

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
  const fretOffset = editorStore.draftChord.fretOffset;
  const baseStrings = editorStore.activeBaseStrings;

  const { notes: rawNotes } = collectChordNotes(strings, fretOffset, baseStrings);
  if (rawNotes.length === 0) {
    return null;
  }

  let explicitRootPitch: number | null = null;
  const rootIdx = editorStore.draftChord.rootStringIndex;
  if (rootIdx !== null && strings[rootIdx]?.[0] !== undefined && strings[rootIdx]![0] >= 0) {
    explicitRootPitch = calcPitchIndex(rootIdx, strings[rootIdx]![0], fretOffset, baseStrings);
  }

  const { candidates, bestRootPitch } = analyzeChordGraph(rawNotes, explicitRootPitch);
  return { strings, fretOffset, baseStrings, rawNotes, candidates, bestRootPitch };
});

const analysis = computed(() => {
  const graph = graphAnalysis.value;
  if (!graph)
    return {
      notes: [] as RenderNoteItem[],
      candidates: [] as CandidateResult[],
    };

  const { strings, fretOffset, baseStrings, rawNotes, candidates, bestRootPitch } = graph;
  const currentDraftName = getChordName(editorStore.draftChord);
  const selectedCandidate = candidates.find(c => c.chordName === currentDraftName);
  const activeRootPitch = selectedCandidate ? selectedCandidate.rootPitch : bestRootPitch;

  const notes: RenderNoteItem[] = rawNotes
    .map(n => {
      const semitones = (n.pitchIndex - activeRootPitch + 12) % 12;
      const stringObj = strings[n.stringIndex];
      const canToggle =
        stringObj !== undefined && canTogglePitchAccidental(n.stringIndex, stringObj[0], fretOffset, baseStrings);
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

/** 有按音（auto 模式的展开依据）：分析图存在即代表至少一个按音 */
const hasNotes = computed(() => analysis.value.notes.length > 0);

/** auto 模式的展开依据：有按音（分析图存在即代表至少一个按音） */
const hasContent = () => hasNotes.value;

/** 候选和弦是否已被选中（与当前草稿名一致，含音名段序列等价） */
const isCandidateSelected = (candidate: CandidateResult): boolean => {
  const currentDraftName = getChordName(editorStore.draftChord).trim();
  if (!currentDraftName) return false;
  if (currentDraftName === candidate.chordName.trim()) return true;
  const candidateFormatted = candidate.segments ? segmentsToString(candidate.segments).trim() : '';
  return candidateFormatted === currentDraftName;
};

/** 用户点击候选：已选中则清除和弦名与根音标记，否则应用候选名并把根音指到对应琴弦 */
const handleSelectCandidate = (candidate: CandidateResult) => {
  const isSelected = isCandidateSelected(candidate);

  if (isSelected) {
    editorStore.draftChord.nameSegments = null;
    editorStore.draftChord.rootStringIndex = null;
  } else {
    let rootAssigned = false;
    const parsedSegs = candidate.segments ?? nameToSegments(candidate.chordName);
    if (parsedSegs) {
      editorStore.draftChord.nameSegments = parsedSegs;
    } else {
      const parsedRoot = parsePitchSegment(candidate.rootLabel);
      if (parsedRoot) {
        const rawSuffix = candidate.chordName.slice(candidate.rootLabel.length);
        const cleanSuffix = rawSuffix.startsWith('/') ? rawSuffix.slice(1) : rawSuffix;
        editorStore.draftChord.nameSegments = {
          root: parsedRoot,
          unknownQuality: cleanSuffix || undefined,
        };
      }
    }
    editorStore.draftChord.strings.forEach((str, sIdx) => {
      if (str[0] >= 0 && !rootAssigned) {
        const pitch = calcPitchIndex(sIdx, str[0], editorStore.draftChord.fretOffset, editorStore.activeBaseStrings);
        if (pitch === candidate.rootPitch) {
          editorStore.draftChord.rootStringIndex = toStringIndex(sIdx);
          rootAssigned = true;
        }
      }
    });
    if (!rootAssigned) editorStore.draftChord.rootStringIndex = null;
  }
};
</script>
