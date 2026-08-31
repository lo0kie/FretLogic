<template>
  <div class="absolute inset-0 z-content overflow-hidden box-border pointer-events-auto">
    <div
      class="no-scrollbar relative w-full h-full flex justify-center items-start pt-2xl pb-3xl px-2xl box-border overflow-y-auto"
    >
      <div class="shrink-0">
        <WorkbenchCard />
      </div>

      <div
        class="no-scrollbar absolute top-8 right-8 bottom-8 pointer-events-auto z-panel overflow-y-auto flex flex-col gap-lg [&>*]:shrink-0 duration-slow ease-sidebar transition-[width,min-width]"
        :class="hasNotes ? 'w-[19rem] min-w-[19rem]' : 'w-[14rem] min-w-[14rem]'"
      >
        <ChordAnalysisPanel />
        <BarrePanel />
      </div>
    </div>

    <WorkbenchFloatingBar />
  </div>
</template>

<script setup lang="ts">
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { collectChordNotes } from '@/utils/music/musicTheory';
import { computed } from 'vue';
import BarrePanel from './BarrePanel.vue';
import ChordAnalysisPanel from './ChordAnalysisPanel.vue';
import WorkbenchCard from './WorkbenchCard.vue';
import WorkbenchFloatingBar from './WorkbenchFloatingBar.vue';

const editorStore = useChordEditorStore();

const hasNotes = computed(() => {
  const { notes } = collectChordNotes(
    editorStore.draftChord.strings,
    editorStore.draftChord.capo,
    editorStore.activeBaseStrings
  );
  return notes.length > 0;
});
</script>
