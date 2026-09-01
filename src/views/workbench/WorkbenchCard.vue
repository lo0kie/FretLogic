<template>
  <div
    ref="cardRef"
    class="flex flex-col items-center justify-evenly pointer-events-auto bg-bg-panel/90 backdrop-blur-lg border border-glass-border rounded-md shadow-panel relative py-xl px-2xl shrink-0 transition-all duration-slow ease-sidebar hover:border-border-base hover:shadow-lg"
  >
    <div class="flex justify-center relative w-full z-base shrink-0">
      <Fretboard
        :chord="editorStore.draftChord"
        :is-dark-mode="globalDarkMode"
        :scale="1.0"
        :interactive="true"
        chord-name-editable
        chord-name-font-size="lg"
        @update:capo="handleCapoUpdate"
        @update:strings="handleStringsChange"
        @update:root-string-index="handleRootStringChange"
        @update:chord-name="handleChordNameChange"
        @update:name-segments="handleNameSegmentsChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import Fretboard from '@/components/fretboard/Fretboard.vue';
import { useActiveExportTarget } from '@/composables/app/useActiveExportTarget';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { globalDarkMode } from '@/stores/globalState';
import type { ChordNameSegments, GuitarStringsModel, StringIndex } from '@/types';
import { toCapo, toStringIndex } from '@/utils/music/chord-fretboard';
import { nameToSegments } from '@/utils/music/musicTheory';
import { useTemplateRef } from 'vue';

const editorStore = useChordEditorStore();
const cardRef = useTemplateRef<HTMLElement>('cardRef');

useActiveExportTarget(cardRef);

/** 任一编辑操作都会把草稿标记为「创建中」，仅当非编辑态时生效 */
const markCreating = () => {
  if (!editorStore.isEditing) editorStore.isCreating = true;
};

const handleCapoUpdate = (capo: number) => {
  editorStore.draftChord.capo = toCapo(capo);
  markCreating();
};

const handleStringsChange = (strings: GuitarStringsModel) => {
  strings.forEach((str, i) => {
    editorStore.draftChord.strings[i] = [str[0], str[1]];
  });
  markCreating();
};

const handleRootStringChange = (index: number | null) => {
  const validIndex: StringIndex | null =
    index !== null && (editorStore.draftChord.strings[index]?.[0] ?? -1) >= 0 ? toStringIndex(index) : null;
  editorStore.draftChord.rootStringIndex = validIndex;
  markCreating();
};

const handleChordNameChange = (name: string) => {
  const segs = name ? nameToSegments(name) : null;
  editorStore.draftChord.nameSegments = segs;
  markCreating();
};

const handleNameSegmentsChange = (segments: ChordNameSegments | null) => {
  editorStore.draftChord.nameSegments = segments;
  markCreating();
};
</script>
