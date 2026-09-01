<template>
  <div class="absolute inset-0 z-content overflow-hidden box-border pointer-events-auto">
    <div
      class="no-scrollbar relative w-full h-full flex justify-center items-start pt-2xl pb-3xl px-2xl box-border overflow-y-auto"
    >
      <div class="shrink-0">
        <WorkbenchCard />
      </div>

      <div
        class="no-scrollbar absolute top-8 right-8 bottom-8 pointer-events-auto z-panel overflow-y-auto flex flex-col items-end gap-lg [&>*]:shrink-0"
      >
        <ChordAnalysisPanel />
        <BarrePanel />
      </div>
    </div>

    <WorkbenchFloatingBar />
  </div>
</template>

<script setup lang="ts">
import BarrePanel from './BarrePanel.vue';
import ChordAnalysisPanel from './ChordAnalysisPanel.vue';
import WorkbenchCard from './WorkbenchCard.vue';
import WorkbenchFloatingBar from './WorkbenchFloatingBar.vue';
</script>
