<template>
  <div class="analysis-flex-container">
    <!-- 1. 推荐候选区域 -->
    <div class="section-block candidates-section">
      <div class="section-label">推荐候选</div>
      <div ref="tagsContainerRef" v-wheel-scroll.smooth class="candidate-tags no-scrollbar" @keydown="handleKeydown">
        <template v-if="candidates.length > 0">
          <BaseBadge
            v-for="candidate in candidates"
            :key="candidate.chordName"
            v-wave="{ disabled: !isGlobalEditable }"
            :variant="isCandidateActive(candidate) ? 'primary' : 'neutral'"
            :appearance="isCandidateActive(candidate) ? 'filled' : 'subtle'"
            :interactive="isGlobalEditable"
            class="candidate-badge-item"
            size="md"
            @click="emit('select-candidate', candidate)"
          >
            <ChordNameDisplay :segments="candidate.segments" :name="candidate.chordName" size="inherit" />
          </BaseBadge>
        </template>
        <EmptyState v-else description="暂无匹配和弦" size="sm" bordered />
      </div>
    </div>

    <div class="panel-divider" />

    <!-- 2. 构成音区域 -->
    <div class="section-block is-grow notes-section">
      <div class="section-label">构成音</div>
      <div v-wheel-scroll.smooth class="notes-list no-scrollbar">
        <div v-for="note in notes" :key="note.stringIndex" v-wave class="note-row" :class="{ 'is-root': note.isRoot }">
          <div class="note-left-group">
            <span class="string-indicator">{{ 6 - note.stringIndex }}弦</span>
            <span class="note-name-text">
              <span class="note-letter">{{ parseNote(note.label).letter }}</span>
              <span v-if="parseNote(note.label).accidental" class="note-accidental">{{
                parseNote(note.label).accidental
              }}</span>
            </span>
          </div>
          <span class="interval-tag">
            <template v-for="(deg, idx) in parseIntervalDegrees(note.intervalDegree)" :key="idx">
              <span v-if="idx > 0" class="interval-sep">/</span>
              <span class="interval-degree-item">
                <span class="degree-num">{{ deg }}</span>
                <span v-if="note.intervalAccidental" class="interval-acc">{{
                  formatAccidental(note.intervalAccidental)
                }}</span>
              </span>
            </template>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import BaseBadge from '@/components/BaseBadge.vue';
import ChordNameDisplay from '@/components/ChordNameDisplay.vue';
import EmptyState from '@/components/EmptyState.vue';
import { useGridNavigation } from '@/composables/useGridNavigation';
import { isGlobalEditable } from '@/stores/globalState';
import type { CandidateResult, NoteInput } from '@/types';
import { formatAccidental, parseNoteLabel, segmentsToString } from '@/utils/musicTheory';
import { useTemplateRef } from 'vue';

export interface RenderNoteItem extends NoteInput {
  isRoot: boolean;
  intervalDegree: string;
  intervalAccidental: '' | 'b' | '#';
  canAccidentalToggle: boolean;
}

const props = defineProps<{
  candidates: CandidateResult[];
  activeChordName: string;
  notes: RenderNoteItem[];
}>();

const emit = defineEmits<{
  (e: 'select-candidate', candidate: CandidateResult): void;
}>();

const isCandidateActive = (candidate: CandidateResult): boolean => {
  const active = props.activeChordName?.trim();
  if (!active) return false;
  if (active === candidate.chordName?.trim()) return true;
  if (candidate.segments && segmentsToString(candidate.segments).trim() === active) return true;
  return false;
};

const parseNote = parseNoteLabel;

const parseIntervalDegrees = (degreeStr: string): string[] => {
  if (!degreeStr) return [];
  return degreeStr
    .split('·')
    .map(s => s.trim())
    .filter(Boolean);
};

const tagsContainerRef = useTemplateRef<HTMLElement>('tagsContainerRef');
const { handleKeydown } = useGridNavigation(undefined, tagsContainerRef);
</script>

<style scoped lang="scss">
.analysis-flex-container {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: $space-md;
  width: 100%;
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  scrollbar-gutter: stable;
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

.section-block {
  display: flex;
  flex-direction: column;
  gap: $space-sm;
  min-width: 0;

  &.candidates-section {
    flex: 1;
    min-height: 0;
  }

  &.is-grow.notes-section {
    flex: 0 0 40%;
    min-height: 0;
  }
}

.section-label {
  font-size: $fs-2xs;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.02em;
  flex-shrink: 0;
  padding-left: 0.2rem;
}

.candidate-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  align-content: flex-start;
  gap: $space-xs;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  padding: $space-xs;
}

.candidate-badge-item {
  box-shadow: var(--shadow-xs);

  &.variant-primary {
    transform: scale(1.02);
  }
}

.notes-list {
  display: flex;
  flex-direction: column;
  gap: $space-sm;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.note-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-radius: $radius-md;
  background-color: var(--bg-body);
  border: 1px solid var(--border-light);
  transition: $transition-fast;
  box-sizing: border-box;
  cursor: default;
  user-select: none;
  min-height: 1.85rem;
  height: auto;
  padding: $space-xs $space-md;
  flex-shrink: 0;

  &:hover {
    border-color: var(--border-base);
    background-color: var(--bg-panel-hover);
  }

  &.is-root {
    background-color: var(--tint-warning-90);
    border-color: var(--tint-warning-65);

    .string-indicator {
      color: var(--color-warning);
    }

    .note-name-text {
      color: var(--color-warning);
      font-weight: 800;
    }

    .interval-tag {
      background-color: var(--color-warning);
      color: var(--text-on-accent);
      border-color: transparent;
      box-shadow: 0 1px 4px color-mix(in srgb, var(--color-warning), transparent 50%);
    }
  }
}

.note-left-group {
  display: flex;
  align-items: center;
  gap: $space-sm;
  height: 100%;
}

.string-indicator {
  font-size: $fs-2xs;
  font-weight: 700;
  color: var(--text-disabled);
  letter-spacing: -0.01em;
  line-height: 1;
}

.note-name-text {
  font-size: $fs-xs;
  font-weight: 700;
  color: var(--text-title);
  font-family: inherit;
  line-height: 1;
  display: inline-flex;
  align-items: baseline;
}

.note-accidental {
  display: inline-block;
  font-size: 0.72em;
  font-weight: 700;
  line-height: 1;
  position: relative;
  top: -0.32em;
  vertical-align: baseline;
  margin-left: 0.05em;
  font-family: inherit;
}

.interval-tag {
  min-width: 1.35rem;
  height: 1.25rem;
  padding: 0 0.42rem;
  border-radius: $radius-pill;
  background-color: var(--bg-panel-hover);
  color: var(--text-body);
  border: 1px solid var(--border-light);
  font-size: $fs-2xs;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  line-height: 1;
  font-family: inherit;
  font-feature-settings: 'tnum';
  user-select: none;
  white-space: nowrap;
}

.interval-degree-item {
  display: inline-flex;
  align-items: baseline;
  line-height: 1;
}

.degree-num {
  font-variant-numeric: tabular-nums;
}

.interval-sep {
  margin: 0 0.16rem;
  opacity: 0.4;
  font-weight: 400;
  font-size: 0.85em;
  transform: scale(0.9);
}

.interval-acc {
  display: inline-block;
  font-size: 0.72em;
  font-weight: 700;
  line-height: 1;
  position: relative;
  top: -0.32em;
  vertical-align: baseline;
  margin-left: 0.04em;
  font-family: inherit;
}

@media (max-width: 1150px) {
  .analysis-flex-container {
    flex-direction: column;
  }

  .section-block.candidates-section {
    flex: 0 0 auto;
  }

  .panel-divider {
    display: none;
  }
}
</style>
