<template>
  <div class="box-border flex min-h-0 w-full flex-row items-stretch gap-2 overflow-hidden">
    <div class="flex min-w-0 flex-[0_0_58%] flex-col gap-1">
      <div v-grid-nav v-wheel-scroll.smooth class="no-scrollbar flex min-h-0 flex-wrap gap-1 overflow-y-auto p-1">
        <template v-if="candidates.length > 0">
          <BaseBadge
            v-wave
            v-for="candidate in candidates"
            :appearance="isCandidateActive(candidate) ? 'filled' : 'subtle'"
            :key="candidate.chordName"
            :variant="isCandidateActive(candidate) ? 'primary' : 'neutral'"
            @click="emit('select-candidate', candidate)"
            interactive
          >
            <span v-chord-name="{ segments: candidate.segments, name: candidate.chordName }" />
          </BaseBadge>
        </template>
        <EmptyState v-else bordered description="暂无匹配和弦" size="sm" />
      </div>
    </div>

    <div class="my-0 h-auto w-px shrink-0 self-stretch bg-border-light" />

    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <div v-wheel-scroll.smooth class="no-scrollbar flex min-h-0 flex-col gap-1 overflow-y-auto p-0.5">
        <div
          v-wave
          v-for="note in notes"
          :class="[
            note.isRoot
              ? 'border-tint-warning-65 bg-tint-warning-90 hover:border-tint-warning-78 hover:bg-tint-warning-88'
              : 'border-border-light bg-surface-body hover:border-border-base hover:bg-surface-panel-hover',
          ]"
          :key="note.stringIndex"
          class="box-border flex min-w-0 shrink-0 items-center justify-between gap-1.5 rounded-md border px-2 py-1 transition-colors select-none"
        >
          <div class="flex min-w-0 shrink-0 items-center gap-1.5">
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
          <span
            :class="[
              note.isRoot
                ? 'border-transparent bg-warning text-fg-on-accent shadow-[0_1px_4px_rgba(255,149,0,0.5)]'
                : 'border-border-light bg-surface-panel text-fg-body',
            ]"
            class="inline-flex h-5 min-w-[1.35rem] shrink-0 items-center justify-center rounded-full border px-1.5 font-mono text-2xs leading-none font-bold whitespace-nowrap tabular-nums select-none"
          >
            <span v-chord-name="{ degrees: noteDegrees(note) }" />
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import BaseBadge from '@/platform/ui/badge/BaseBadge.vue';
import EmptyState from '@/platform/ui/feedback/EmptyState.vue';
import { areChordsEnharmonicallyEquivalent } from '@/domains/chord/theory/theory';

import type { CandidateResult, ExtensionSegment, NoteInput } from '@/domains/chord/types';

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

/** 候选和弦是否为当前激活项（与草稿名相同，或音名段序列/等音异名一致均视为匹配） */
const isCandidateActive = (candidate: CandidateResult): boolean => {
  const active = props.activeChordName?.trim();
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
</script>
