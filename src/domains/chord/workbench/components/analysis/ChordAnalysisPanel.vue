<template>
  <WorkbenchPanel
    :has-content
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
            @select-candidate="handleSelectCandidate($event)"
          />
        </div>
        <p v-else-if="effectiveExpanded" class="form-hint pt-2" key="empty">
          在指板上按出音符后，这里会显示和弦名称与候选分析。
        </p>
      </Transition>
    </template>
  </WorkbenchPanel>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import WorkbenchPanel from '@/domains/chord/workbench/components/WorkbenchPanel.vue';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { analyzeChordGraph } from '@/domains/chord/theory/chordEngine';
import {
  areChordsEnharmonicallyEquivalent,
  calcPitchIndex,
  canTogglePitchAccidental,
  collectChordNotes,
  computeStringLabelAccidental,
  getChordName,
  nameToSegments,
  parsePitchSegment,
  ROOT_PITCH_MAP,
} from '@/domains/chord/theory/theory';
import { toStringIndex } from '@/domains/fretboard/model/coordinates';
import { STORAGE_KEYS } from '@/platform/utils/constants';

import ChordAnalysisContent from './ChordAnalysisContent.vue';

import type { RenderNoteItem } from './ChordAnalysisContent.vue';
import type { AccidentalType, CandidateResult, NaturalPitchLetter } from '@/domains/chord/types';

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
  const selectedCandidate = candidates.find(c =>
    areChordsEnharmonicallyEquivalent(currentDraftName, c.segments ?? c.chordName)
  );
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

/** 候选和弦是否已被选中（与当前草稿名一致，支持乐理等音异名等价判定） */
const isCandidateSelected = (candidate: CandidateResult): boolean => {
  const currentDraftName = getChordName(editorStore.draftChord).trim();
  if (!currentDraftName) return false;
  return areChordsEnharmonicallyEquivalent(currentDraftName, candidate.segments ?? candidate.chordName);
};

/** 用户点击候选：已选中则清除和弦名与根音标记，否则应用候选名并把根音指到对应琴弦 */
const handleSelectCandidate = (candidate: CandidateResult) => {
  const isSelected = isCandidateSelected(candidate);

  if (isSelected) {
    editorStore.draftChord.nameSegments = null;
    editorStore.draftChord.rootStringIndex = null;
  } else {
    let rootAssigned = false;
    let parsedSegs = candidate.segments ?? nameToSegments(candidate.chordName);
    if (!parsedSegs) {
      const parsedRoot = parsePitchSegment(candidate.rootLabel);
      if (parsedRoot) {
        const rawSuffix = candidate.chordName.slice(candidate.rootLabel.length);
        const cleanSuffix = rawSuffix.startsWith('/') ? rawSuffix.slice(1) : rawSuffix;
        parsedSegs = {
          root: parsedRoot,
          unknownQuality: cleanSuffix || undefined,
        };
      }
    }

    // 提取候选和弦根音与斜杠低音的升降号偏好（-1 为降号）
    let assignedRootStringIdx: number | null = null;
    editorStore.draftChord.strings.forEach((str, sIdx) => {
      if (str[0] >= 0 && !rootAssigned) {
        const pitch = calcPitchIndex(sIdx, str[0], editorStore.draftChord.fretOffset, editorStore.activeBaseStrings);
        if (pitch === candidate.rootPitch) {
          editorStore.draftChord.rootStringIndex = toStringIndex(sIdx);
          assignedRootStringIdx = sIdx;
          rootAssigned = true;
        }
      }
    });
    if (!rootAssigned) editorStore.draftChord.rootStringIndex = null;

    // 核心尊重用户：若根音琴弦当前已被用户明确指定变音记号（如手动切成了 A#），和弦名自动与琴弦保持一致，绝不强行将用户的 A# 改回降 B
    if (parsedSegs && assignedRootStringIdx !== null) {
      const rootStr = editorStore.draftChord.strings[assignedRootStringIdx];
      if (rootStr) {
        const { label: curNatural, isAccidental } = computeStringLabelAccidental(
          assignedRootStringIdx,
          rootStr[0],
          editorStore.draftChord.fretOffset,
          rootStr[1],
          editorStore.activeBaseStrings
        );
        if (isAccidental) {
          const curAcc: AccidentalType = rootStr[1] ? -1 : 1;
          parsedSegs = {
            ...parsedSegs,
            root: [curNatural as NaturalPitchLetter, curAcc],
          };
        }
      }
    }

    editorStore.draftChord.nameSegments = parsedSegs;

    // 若为斜杠和弦且指定了低音（bass），同步物理最低音弦的升降号偏好
    if (parsedSegs?.bass) {
      const bassIsFlat = parsedSegs.bass[1] === -1;
      const bassNatural = parsedSegs.bass[0];
      const bassAcc = parsedSegs.bass[1];
      const bassPitch = ((ROOT_PITCH_MAP[bassNatural] ?? 0) + bassAcc + 12) % 12;
      for (let s = 0; s < editorStore.draftChord.strings.length; s++) {
        const str = editorStore.draftChord.strings[s];
        if (str && str[0] >= 0) {
          const p = calcPitchIndex(s, str[0], editorStore.draftChord.fretOffset, editorStore.activeBaseStrings);
          if (p % 12 === bassPitch) {
            str[1] = bassIsFlat;
          }
          break;
        }
      }
    }
  }
};
</script>
