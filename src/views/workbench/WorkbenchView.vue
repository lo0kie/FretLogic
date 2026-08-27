<template>
  <div class="absolute inset-0 z-content overflow-hidden box-border pointer-events-auto">
    <div
      class="no-scrollbar relative w-full h-full flex justify-center items-start py-3xl px-2xl box-border overflow-y-auto"
    >
      <div class="shrink-0">
        <WorkbenchCard />
      </div>

      <div
        class="no-scrollbar absolute top-14 right-8 pointer-events-auto z-panel overflow-y-auto transition-[width,min-width] duration-slow ease-sidebar"
        :class="
          hasNotes
            ? 'w-[21rem] min-w-[21rem] [@media(max-width:1400px)]:w-[21.5rem] [@media(max-width:1400px)]:min-w-[21.5rem] [@media(max-width:1250px)]:w-[20.5rem] [@media(max-width:1250px)]:min-w-[20.5rem] [@media(max-width:1100px)]:w-[13rem] [@media(max-width:1100px)]:min-w-[13rem]'
            : 'w-[13rem] min-w-[13rem] [@media(max-width:1400px)]:w-[12rem] [@media(max-width:1400px)]:min-w-[12rem] [@media(max-width:1250px)]:w-[11rem] [@media(max-width:1250px)]:min-w-[11rem] [@media(max-width:1100px)]:w-[9rem] [@media(max-width:1100px)]:min-w-[9rem]'
        "
      >
        <ChordAnalysisPanel />
      </div>
    </div>

    <WorkbenchFloatingBar />
  </div>
</template>

<script setup lang="ts">
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { collectChordNotes } from '@/utils/music/musicTheory';
import { computed } from 'vue';
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
