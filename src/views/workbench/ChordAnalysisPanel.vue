<template>
  <div
    class="transition-[width,min-width] duration-slow ease-sidebar"
    :class="effectiveExpanded ? 'w-[19rem] min-w-[19rem]' : 'w-[14rem] min-w-[14rem]'"
  >
    <div
      class="@container relative w-full h-auto p-3 bg-bg-panel border border-glass-border rounded-lg flex flex-col z-panel pointer-events-auto box-border overflow-hidden [container-type:inline-size]"
    >
      <div
        class="flex items-center justify-between gap-2 shrink-0 border-b transition-[border-color,padding-bottom] duration-slow ease-sidebar"
        :class="effectiveExpanded ? 'pb-1.5 border-border-light' : 'pb-0 border-transparent'"
      >
        <div
          class="group flex items-center gap-1.5 -ml-1 pl-1 pr-1.5 py-0.5 rounded-md cursor-pointer hover:bg-bg-panel-hover/50 transition-colors"
          role="button"
          :tabindex="0"
          :aria-expanded="effectiveExpanded"
          :aria-label="effectiveExpanded ? '收起和弦分析面板' : '展开和弦分析面板'"
          @click="toggleCollapse"
          @keydown.enter.prevent="toggleCollapse"
          @keydown.space.prevent="toggleCollapse"
        >
          <div class="flex items-center justify-center w-5 h-5 rounded-md bg-tint-primary-88 text-primary">
            <Sparkles class="group-hover:hidden" :size="13" :stroke-width="2.5" />
            <Minimize2 v-if="effectiveExpanded" class="hidden group-hover:block" :size="13" :stroke-width="2.5" />
            <Maximize2 v-else class="hidden group-hover:block" :size="13" :stroke-width="2.5" />
          </div>
          <span class="text-xs font-extrabold text-text-title tracking-tight">和弦分析</span>
        </div>
      </div>

      <!-- 内容区高度动画：测量内容真实高度写入 height 并过渡。
           覆盖展开/收起以及内容自身尺寸变化（音符增减、候选徽标换行等）——
           grid-template-rows 0fr↔1fr 只能处理显示/隐藏，内容尺寸变化时行高恒为 1fr 不会触发过渡 -->
      <div class="overflow-hidden transition-[height] duration-base ease-sidebar" :style="{ height: bodyHeight }">
        <!-- 被测量内容宽度始终锁定为展开态内容区宽度（19rem - 卡片左右内边距 p-3 共 1.5rem），
             宽度动画期间不随面板伸缩而重排/压窄 → useAutoHeight 测得高度稳定、不抖动；
             分析面板内容为流体布局，若按收起态 12.5rem 渲染会被挤压变形，故始终按展开宽度渲染、
             靠外层 overflow-hidden 裁切。横按面板则额外用 flex justify-center 让指板居中、不漂移 -->
        <div ref="bodyContentRef" class="w-[calc(19rem-1.5rem)]">
          <Transition mode="out-in">
            <div v-if="isExpanded" key="content" class="pt-2">
              <ChordAnalysisContent
                :candidates="analysis.candidates"
                :active-chord-name="getChordName(editorStore.draftChord)"
                :notes="analysis.notes"
                @select-candidate="handleSelectCandidate"
              />
            </div>
            <p v-else-if="effectiveExpanded" key="empty" class="form-hint pt-2">
              在指板上按出音符后，这里会显示和弦名称与候选分析。
            </p>
          </Transition>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAutoHeight } from '@/composables/ui/useAutoHeight';
import { analyzeChordGraph } from '@/services/music/chordEngine';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import type { CandidateResult } from '@/types/engine.ts';
import { STORAGE_KEYS } from '@/utils/core/constants';
import { toStringIndex } from '@/utils/music/chord-fretboard';
import {
  calcPitchIndex,
  canTogglePitchAccidental,
  collectChordNotes,
  getChordName,
  nameToSegments,
  segmentsToString,
} from '@/utils/music/musicTheory';
import { Maximize2, Minimize2, Sparkles } from '@lucide/vue';
import { useStorage } from '@vueuse/core';
import { computed, useTemplateRef } from 'vue';
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

/** 有按音时面板有内容；但无论有无内容，用户都可手动收起/展开
 * （即使无音符也允许展开，空白态给出占位提示）。
 * 持久化记录用户折叠收起偏好（默认 false 即展开） */
const isExpanded = computed(() => analysis.value.notes.length > 0);

const collapsed = useStorage(STORAGE_KEYS.WORKBENCH_CHORD_ANALYSIS_COLLAPSED, false);
const effectiveExpanded = computed(() => !collapsed.value);
const toggleCollapse = () => {
  collapsed.value = !collapsed.value;
};

const bodyContentRef = useTemplateRef<HTMLElement>('bodyContentRef');
const { height: bodyHeight } = useAutoHeight(bodyContentRef, effectiveExpanded);

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
          editorStore.draftChord.rootStringIndex = toStringIndex(sIdx);
          rootAssigned = true;
        }
      }
    });
    if (!rootAssigned) editorStore.draftChord.rootStringIndex = null;
  }
};
</script>
