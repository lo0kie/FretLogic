<template>
  <div class="flex flex-row items-stretch gap-2 overflow-hidden box-border w-full min-h-0">
    <div class="flex flex-col gap-1 min-w-0 flex-[0_0_55%]">
      <div class="text-2xs font-bold text-text-disabled tracking-wider select-none px-0.5 whitespace-nowrap">
        推荐候选
      </div>
      <div v-wheel-scroll.smooth v-grid-nav class="no-scrollbar flex flex-wrap gap-1 p-1 min-h-0 overflow-y-auto">
        <template v-if="candidates.length > 0">
          <BaseBadge
            v-for="candidate in candidates"
            :key="candidate.chordName"
            v-wave="{ disabled: !isGlobalEditable }"
            :variant="isCandidateActive(candidate) ? 'primary' : 'neutral'"
            :appearance="isCandidateActive(candidate) ? 'filled' : 'subtle'"
            :interactive="isGlobalEditable"
            size="md"
            @click="emit('select-candidate', candidate)"
          >
            <ChordNameDisplay :segments="candidate.segments" :name="candidate.chordName" size="inherit" />
          </BaseBadge>
        </template>
        <EmptyState v-else description="暂无匹配和弦" size="sm" bordered />
      </div>
    </div>

    <div class="shrink-0 bg-border-light w-px h-auto self-stretch my-0" />

    <div class="flex flex-col gap-1 min-w-0 flex-1">
      <div class="text-2xs font-bold text-text-disabled tracking-wider select-none px-0.5 whitespace-nowrap">
        构成音
      </div>
      <div v-wheel-scroll.smooth class="no-scrollbar flex flex-col gap-1 p-0.5 min-h-0 overflow-y-auto">
        <div
          v-for="note in notes"
          :key="note.stringIndex"
          v-wave
          class="flex items-center justify-between gap-1.5 py-1 px-2 rounded-md border box-border shrink-0 select-none min-w-0 transition-colors"
          :class="[
            note.isRoot
              ? 'bg-tint-warning-90 border-tint-warning-65 hover:bg-tint-warning-88 hover:border-tint-warning-78'
              : 'bg-bg-body border-border-light hover:border-border-base hover:bg-bg-panel-hover',
          ]"
        >
          <div class="flex items-center gap-1.5 shrink-0 min-w-0">
            <span
              class="text-2xs font-semibold shrink-0 whitespace-nowrap"
              :class="note.isRoot ? 'text-warning font-bold' : 'text-text-disabled'"
            >
              {{ 6 - note.stringIndex }}弦
            </span>
            <span
              class="text-xs inline-flex items-baseline shrink-0 whitespace-nowrap"
              :class="note.isRoot ? 'text-warning font-extrabold' : 'text-text-title font-bold'"
            >
              <span class="leading-none">{{ parseNote(note.label).letter }}</span>
              <span
                v-if="parseNote(note.label).accidental"
                class="inline-block text-[0.75em] font-extrabold leading-none relative -top-[0.3em] align-baseline ml-[0.05em]"
              >
                {{ parseNote(note.label).accidental }}
              </span>
            </span>
          </div>
          <span
            class="inline-flex items-center justify-center min-w-[1.35rem] h-5 px-1.5 rounded-full border text-2xs font-bold font-mono whitespace-nowrap shrink-0 select-none leading-none tabular-nums"
            :class="[
              note.isRoot
                ? 'bg-warning text-text-on-accent border-transparent shadow-[0_1px_4px_rgba(255,149,0,0.5)]'
                : 'bg-bg-panel border-border-light text-text-body',
            ]"
          >
            <template v-for="(deg, idx) in parseIntervalDegrees(note.intervalDegree)" :key="idx">
              <span v-if="idx > 0" class="mx-0.5 opacity-40 font-normal text-xs scale-90">/</span>
              <span class="inline-flex items-baseline leading-none">
                <span class="tabular-nums">{{ deg }}</span>
                <span
                  v-if="note.intervalAccidental"
                  class="inline-block text-[0.75em] font-extrabold leading-none relative -top-[0.3em] align-baseline ml-[0.04em]"
                >
                  {{ formatAccidental(note.intervalAccidental) }}
                </span>
              </span>
            </template>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import BaseBadge from '@/components/base/BaseBadge.vue';
import EmptyState from '@/components/base/EmptyState.vue';
import ChordNameDisplay from '@/components/fretboard/ChordNameDisplay.vue';
import { isGlobalEditable } from '@/stores/globalState';
import type { CandidateResult, NoteInput } from '@/types';
import { formatAccidental, parseNoteLabel, segmentsToString } from '@/utils/music/musicTheory';

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
</script>
