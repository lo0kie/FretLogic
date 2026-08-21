<template>
  <div
    class="chord-analysis-wrapper"
    :class="{
      'is-empty-hidden': uiStore.isMobile && analysis.notes.length === 0,
    }"
  >
    <Transition name="panel-fade">
      <div class="chord-analysis-panel" v-if="!uiStore.isMobile || analysis.notes.length > 0">
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
              @toggle-root-string="handleSetRootString"
              @toggle-pitch-accidental="handleTogglePitchName"
            />
          </div>
        </template>

        <!-- PC端空状态 -->
        <EmptyState v-else :icon="Music" description="在指板上按音以分析" size="md" />
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import EmptyState from '@/components/EmptyState.vue';
import { useEditorStore } from '@/stores/chordEditorStore';
import { useUiStore } from '@/stores/uiStore';
import { CandidateResult, NoteInput } from '@/types/engine.ts';
import { analyzeChordGraph } from '@/utils/chordEngine.ts';
import {
  calcPitchIndex,
  canTogglePitchAccidental,
  composeNoteLabel,
  computeStringLabelAccidental,
} from '@/utils/musicTheory';
import { Music, Sparkles } from '@lucide/vue';
import { computed, useTemplateRef } from 'vue';
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
      const canToggle = canTogglePitchAccidental(n.stringIndex, stringObj[0], capo, baseStrings);

      return {
        ...n,
        interval: EXACT_INTERVAL_MAP[semitones] || `${semitones}半音`,
        // 只强调被标记为主音的弦（rootStringIndex），而非所有根音音高的弦
        isRoot: n.stringIndex === editorStore.draftChord.rootStringIndex,
        canAccidentalToggle: canToggle,
      };
    })
    .reverse();

  return { notes, candidates };
});

const handleTogglePitchName = (sIdx: number) => {
  const str = editorStore.draftChord.strings[sIdx];
  if (canTogglePitchAccidental(sIdx, str[0], editorStore.draftChord.capo, editorStore.activeBaseStrings)) {
    str[1] = !str[1];
  }
};

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

const handleSetRootString = (stringIndex: number) => {
  editorStore.draftChord.rootStringIndex = editorStore.draftChord.rootStringIndex === stringIndex ? null : stringIndex;
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
  padding: 0.9rem;
  background-color: var(--bg-panel);
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
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
  gap: 0.75rem;
  width: 100%;
  min-height: 0; // 允许 flex item 正常收缩
  flex: 1;
  overflow-y: auto; // 视口不足时内部出现平滑滚动条，避免被砍脚

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

@media (max-width: 768px) {
  .chord-analysis-wrapper {
    width: 100%;
    margin-bottom: 0.5rem;
    max-height: none;
    overflow: visible;

    &.is-empty-hidden {
      max-height: 0;
      margin-bottom: 0;
      opacity: 0;
      pointer-events: none;
    }
  }

  .chord-analysis-panel {
    position: relative;
    right: auto;
    top: auto;
    width: 100%;
    margin-top: 0;
    max-height: none;
    overflow: visible;
    padding: 0.75rem;
    box-shadow: var(--shadow-md);
  }

  .analysis-flex-container {
    flex-direction: row;
    align-items: stretch;
    gap: 0.75rem;
    max-height: none;
    overflow: visible;

    > :deep(.candidates-section) {
      flex: 2;
    }

    > :deep(.notes-section) {
      flex: 0.2;
    }
  }

  .desktop-divider {
    display: none;
  }
}
</style>
