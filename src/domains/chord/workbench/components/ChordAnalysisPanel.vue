<template>
  <template v-if="hasNotes">
    <div class="flex min-h-0 w-full flex-row items-stretch gap-2 overflow-hidden">
      <div v-grid-nav class="flex min-h-0 min-w-0 flex-[0_0_56%] flex-wrap content-start gap-1 overflow-y-auto p-1">
        <template v-if="candidates.length > 0">
          <BaseBadge
            v-wave
            v-for="candidate in candidates"
            :appearance="isCandidateActive(candidate) ? 'filled' : 'subtle'"
            :key="candidate.chordName"
            :variant="isCandidateActive(candidate) ? 'primary' : 'neutral'"
            @click="handleSelectCandidate(candidate)"
            interactive
          >
            <span v-chord-name="{ segments: candidate.segments, name: candidate.chordName }" />
          </BaseBadge>
        </template>

        <Feedback v-else bordered description="暂无匹配和弦" icon="search-x" size="sm" />
      </div>

      <div class="my-0 h-auto w-px shrink-0 self-stretch bg-border-light" />

      <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-1 p-0.5">
        <div
          v-wave
          v-for="note in notes"
          :class="[
            note.isRoot
              ? 'border-tint-warning-65 bg-tint-warning-90 hover:border-tint-warning-78 hover:bg-tint-warning-88'
              : 'border-border-light bg-surface-body hover:border-border-base hover:bg-surface-panel-hover',
          ]"
          :key="note.stringIndex"
          class="flex min-w-0 shrink-0 items-center justify-between gap-1.5 rounded-md border px-1.5 py-1 transition-colors select-none"
        >
          <div class="flex min-w-0 shrink-0 items-center gap-1">
            <span
              :class="note.isRoot ? 'font-bold text-warning' : 'text-fg-disabled'"
              class="shrink-0 text-2xs font-semibold whitespace-nowrap"
            >
              {{ 6 - note.stringIndex }}弦
            </span>
            <span
              :class="note.isRoot ? 'font-extrabold text-warning' : 'font-bold text-fg-title'"
              class="shrink-0 text-xs whitespace-nowrap"
            >
              <span v-chord-name="note.label" />
            </span>
          </div>

          <BaseBadge
            :appearance="note.isRoot ? 'filled' : 'subtle'"
            :class="note.isRoot ? 'shadow-[0_1px_4px_rgba(255,149,0,0.5)]' : undefined"
            :variant="note.isRoot ? 'warning' : 'neutral'"
            class="font-mono tabular-nums"
            size="xs"
          >
            <span v-chord-name="{ degrees: noteDegrees(note) }" class="font-bold" />
          </BaseBadge>
        </div>
      </div>
    </div>
  </template>

  <Feedback v-else description="在指板上按出音符后，这里会显示和弦名称与候选分析'" size="sm" />
</template>

<script setup lang="ts">
import { computed } from 'vue';

import BaseBadge from '@/platform/ui/badge/BaseBadge.vue';
import Feedback from '@/platform/ui/feedback/Feedback.vue';
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

import type {
  AccidentalType,
  CandidateResult,
  ExtensionSegment,
  NaturalPitchLetter,
  NoteInput,
} from '@/domains/chord/types';

/** 单个按音的分析展示项：原始输入音 + 与当前根音的音程 / 是否为根音弦 / 是否可切换变音 */
interface RenderNoteItem extends NoteInput {
  isRoot: boolean;
  intervalDegree: string;
  intervalAccidental: '' | 'b' | '#';
  canAccidentalToggle: boolean;
}

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

/** 当前草稿的和弦名文本（供候选匹配判定） */
const activeNameText = computed(() => getChordName(editorStore.draftChord));

/** 候选标签列表 */
const candidates = computed(() => analysis.value.candidates);
/** 按音分析展示项列表 */
const notes = computed(() => analysis.value.notes);
/** 有按音（分析图存在即代表至少一个按音，决定内容/空态分支） */
const hasNotes = computed(() => analysis.value.notes.length > 0);

/** 候选和弦是否为当前激活项（与草稿名相同，或音名段序列/等音异名一致均视为匹配） */
const isCandidateActive = (candidate: CandidateResult): boolean => {
  const active = activeNameText.value.trim();
  if (!active) return false;
  return areChordsEnharmonicallyEquivalent(active, candidate.segments ?? candidate.chordName);
};

/** 把 "2·9" 这类度数串拆分为度数列表 */
const parseIntervalDegrees = (degreeStr: string): string[] => {
  if (!degreeStr) return [];
  return degreeStr
    .split('·')
    .map(s => s.trim())
    .filter(Boolean);
};

/** 度数 + 共享升降号 → 指令的 ExtensionSegment[]（每个度数各带上标升降号，如 b2/b9） */
const noteDegrees = (note: RenderNoteItem): ExtensionSegment[] => {
  const acc = note.intervalAccidental === '#' ? 1 : note.intervalAccidental === 'b' ? -1 : undefined;
  return parseIntervalDegrees(note.intervalDegree).map(deg => [deg, acc] as ExtensionSegment);
};

/** 候选和弦是否已被选中（与当前草稿名一致，支持乐理等音异名等价判定） */
const isCandidateSelected = (candidate: CandidateResult): boolean => {
  const currentDraftName = getChordName(editorStore.draftChord).trim();
  if (!currentDraftName) return false;
  return areChordsEnharmonicallyEquivalent(currentDraftName, candidate.segments ?? candidate.chordName);
};

/** 解析候选和弦名为统一的音名段结构：优先用候选自带 segments，否则按名段拆分，再回退逐字解析根音标签 */
const parseCandidateSegments = (candidate: CandidateResult) => {
  let parsed = candidate.segments ?? nameToSegments(candidate.chordName);
  if (!parsed) {
    const parsedRoot = parsePitchSegment(candidate.rootLabel);
    if (parsedRoot) {
      // 兜底：仅能解析出根音，把剩余文字作为未知性质后缀保留（去斜杠低音分隔）
      const rawSuffix = candidate.chordName.slice(candidate.rootLabel.length);
      const cleanSuffix = rawSuffix.startsWith('/') ? rawSuffix.slice(1) : rawSuffix;
      parsed = {
        root: parsedRoot,
        unknownQuality: cleanSuffix || undefined,
      };
    }
  }
  return parsed;
};

/** 定位候选根音对应的琴弦并把 rootStringIndex 指到该弦；无匹配弦则清空根音标记，返回匹配的物理弦号（无则 null） */
const assignRootString = (candidate: CandidateResult): number | null => {
  const strs = editorStore.draftChord.strings;
  let rootAssigned = false;
  let assignedIdx: number | null = null;
  strs.forEach((str, sIdx) => {
    if (str[0] >= 0 && !rootAssigned) {
      const pitch = calcPitchIndex(sIdx, str[0], editorStore.draftChord.fretOffset, editorStore.activeBaseStrings);
      if (pitch === candidate.rootPitch) {
        editorStore.draftChord.rootStringIndex = toStringIndex(sIdx);
        assignedIdx = sIdx;
        rootAssigned = true;
      }
    }
  });
  if (!rootAssigned) editorStore.draftChord.rootStringIndex = null;
  return assignedIdx;
};

/** 尊重用户的弦上变音记号偏好：根音弦用户已明确变音时，和弦名自动与琴弦一致（绝不强行改回同名异音）；
 *  斜杠和弦低音同理同步到物理最低音弦 */
const syncUserPitchPreferences = (
  parsedSegs: NonNullable<ReturnType<typeof parseCandidateSegments>>,
  rootStringIdx: number | null
) => {
  // 根音弦当前已被用户指定变音（如手动切成 A#），名称根音随琴弦保持一致
  if (rootStringIdx !== null) {
    const str = editorStore.draftChord.strings[rootStringIdx];
    if (str) {
      const { label: curNatural, isAccidental } = computeStringLabelAccidental(
        rootStringIdx,
        str[0],
        editorStore.draftChord.fretOffset,
        str[1],
        editorStore.activeBaseStrings
      );
      if (isAccidental) {
        const curAcc: AccidentalType = str[1] ? -1 : 1;
        parsedSegs.root = [curNatural as NaturalPitchLetter, curAcc];
      }
    }
  }

  // 斜杠和弦低音：同步物理最低音弦的升降号偏好
  if (parsedSegs.bass) {
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
};

/** 清除当前选中的和弦名与根音标记（应用于再点已选中候选） */
const clearDraftSelection = () => {
  editorStore.draftChord.nameSegments = null;
  editorStore.draftChord.rootStringIndex = null;
};

/** 用户点击候选：已选中则清除和弦名与根音标记，否则应用候选名并把根音指到对应琴弦 */
const handleSelectCandidate = (candidate: CandidateResult) => {
  if (isCandidateSelected(candidate)) {
    clearDraftSelection();
    return;
  }

  const parsedSegs = parseCandidateSegments(candidate);
  const assignedRootStringIdx = assignRootString(candidate);
  if (parsedSegs) {
    syncUserPitchPreferences(parsedSegs, assignedRootStringIdx);
  }
  editorStore.draftChord.nameSegments = parsedSegs;
};
</script>
