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
        <div class="analysis-flex-container">
          <!-- 1. 推荐候选标签子组件 -->
          <CandidateTags
            :candidates="analysis.candidates"
            :active-chord-name="editorStore.draftChord.chordName"
            @select-candidate="handleSelectCandidate"
          />

          <div class="panel-divider" />

          <!-- 2. 构成音列表子组件 -->
          <NoteIntervalList :notes="analysis.notes" />
        </div>
      </template>

      <!-- PC端空状态 -->
      <EmptyState v-else :icon="Music" description="在指板上按音以分析" size="md" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useEditorStore } from '@/stores/chordEditorStore';
import type { CandidateResult, NoteInput } from '@/types/engine.ts';
import EmptyState from '@/ui/components/EmptyState.vue';
import { analyzeChordGraph } from '@/utils/chordEngine.ts';
import {
  calcPitchIndex,
  canTogglePitchAccidental,
  composeNoteLabel,
  computeStringLabelAccidental,
} from '@/utils/musicTheory';
import { Music, Sparkles } from '@lucide/vue';
import { computed } from 'vue';
import CandidateTags from './CandidateTags.vue';
import NoteIntervalList, { type RenderNoteItem } from './NoteIntervalList.vue';

const editorStore = useEditorStore();

// 音级显示：degree 为数字，acc 为右侧上角标的升降号（普通 b/#）。
// 翻八度的音程同时标注两个数字（不论是否越过八度）：
//   半音 1、2（二度）→ 2·9；半音 5（四度）→ 4·11；半音 9（六度）→ 6·13。
// 三音、五音、七音无常规翻八度扩展写法，保持原样；♭5/♯5/♭7 作变化音保留。
const INTERVAL_MAP: Record<number, { degree: string; acc: '' | 'b' | '#' }> = {
  0: { degree: '1', acc: '' },
  1: { degree: '2·9', acc: '' },
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

// 图分析只依赖指板音（strings/capo/调音），与和弦名无关——名字输入时不重算
const graphAnalysis = computed(() => {
  const strings = editorStore.draftChord.strings;
  const capo = editorStore.draftChord.capo;
  const baseStrings = editorStore.activeBaseStrings;

  const rawNotes: NoteInput[] = [];
  let explicitRootPitch: number | null = null;

  strings.forEach((str, sIdx) => {
    if (str[0] >= 0) {
      const pitch = calcPitchIndex(sIdx, str[0], capo, baseStrings);
      const { label: naturalLabel, isAccidental } = computeStringLabelAccidental(
        sIdx,
        str[0],
        capo,
        str[1],
        baseStrings
      );
      const label = composeNoteLabel(naturalLabel, isAccidental, str[1]);

      if (sIdx === editorStore.draftChord.rootStringIndex && explicitRootPitch === null) {
        explicitRootPitch = pitch;
      }

      rawNotes.push({ stringIndex: sIdx, pitchIndex: pitch, label });
    }
  });

  if (rawNotes.length === 0) {
    return null;
  }

  const { candidates, bestRootPitch } = analyzeChordGraph(rawNotes, explicitRootPitch);
  return { strings, capo, baseStrings, rawNotes, candidates, bestRootPitch };
});

// 仅依赖和弦名的轻链路：输入名字时只重算选中候选与音级映射
const analysis = computed(() => {
  const graph = graphAnalysis.value;
  if (!graph)
    return {
      notes: [] as RenderNoteItem[],
      candidates: [] as CandidateResult[],
    };

  const { strings, capo, baseStrings, rawNotes, candidates, bestRootPitch } = graph;
  const selectedCandidate = candidates.find(c => c.chordName === editorStore.draftChord.chordName);
  const activeRootPitch = selectedCandidate ? selectedCandidate.rootPitch : bestRootPitch;

  // rawNotes 按弦索引 0(六弦)→5(一弦) 收集，倒序后一弦在上、六弦在下（贴合指板视觉习惯）
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
        // 只强调被标记为主音的弦（rootStringIndex），而非所有根音音高的弦
        isRoot: n.stringIndex === editorStore.draftChord.rootStringIndex,
        canAccidentalToggle: canToggle,
      };
    })
    .reverse();

  return { notes, candidates };
});

const handleSelectCandidate = (candidate: CandidateResult) => {
  const isSelected = editorStore.draftChord.chordName === candidate.chordName;

  if (isSelected) {
    editorStore.draftChord.chordName = '';
    editorStore.draftChord.rootStringIndex = null;
  } else {
    let rootAssigned = false;
    editorStore.draftChord.chordName = candidate.chordName;
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

<style scoped lang="less">
@import '@/assets/tokens.module';

.chord-analysis-wrapper {
  transition:
    max-height @duration-slow @bezier-sidebar,
    margin @duration-slow @bezier-sidebar,
    opacity @duration-fast ease;
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
  max-height: calc(100vh - 5rem);
  padding: @space-md;
  background-color: var(--bg-panel);
  backdrop-filter: var(--blur-xl);
  -webkit-backdrop-filter: var(--blur-xl);
  border: 1px solid var(--glass-border);
  border-radius: @radius-lg;
  display: flex;
  flex-direction: column;
  gap: @space-sm;
  z-index: var(--z-panel);
  pointer-events: auto;
  box-sizing: border-box;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: @space-sm;
  flex-shrink: 0;
  padding: @space-xs 0 @space-sm 0;
  border-bottom: 1px solid color-mix(in srgb, var(--separator), transparent 45%);
}

.header-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: @radius-sm;
  background-color: var(--tint-primary-88);
  color: var(--color-primary);
}

.header-title {
  font-size: @fs-xs;
  font-weight: 700;
  color: var(--text-title);
  letter-spacing: -0.01em;
}

.panel-divider {
  width: 1px;
  height: auto;
  background-color: var(--border-light);
  opacity: 0.5;
  flex-shrink: 0;
  align-self: stretch;
  margin: 0;
}

.analysis-flex-container {
  display: flex;
  flex-direction: row; // 左右布局：候选标签 | 构成音
  align-items: stretch;
  gap: @space-md;
  width: 100%;
  min-height: 0; // 允许 flex item 正常收缩
  flex: 1;
  overflow-y: auto; // 视口不足时内部出现平滑滚动条，避免被砍脚
  scrollbar-gutter: stable;

  > :deep(.candidates-section) {
    flex: 0 0 45%;
    min-width: 0;
  }

  > :deep(.candidates-section .candidate-tags) {
    max-height: none;
    flex: 1;
    min-height: 0;
  }

  > :deep(.notes-section) {
    flex: 1;
    min-width: 0;
  }
}
</style>
