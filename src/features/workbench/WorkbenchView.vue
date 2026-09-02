<template>
  <div class="z-content pointer-events-auto absolute inset-0 box-border overflow-hidden">
    <div
      class="no-scrollbar pt-2xl pb-3xl px-2xl relative box-border flex h-full w-full items-start justify-center overflow-y-auto"
    >
      <div class="shrink-0">
        <WorkbenchCard />
      </div>

      <div
        class="no-scrollbar z-panel gap-lg pointer-events-auto absolute top-8 right-8 bottom-8 flex flex-col items-end overflow-y-auto *:shrink-0"
      >
        <ChordAnalysisPanel />
        <BarrePanel />
      </div>
    </div>

    <WorkbenchFloatingBar />
  </div>
</template>

<script lang="ts" setup>
import BarrePanel from './BarrePanel.vue';
import ChordAnalysisPanel from './ChordAnalysisPanel.vue';
import WorkbenchCard from './WorkbenchCard.vue';
import WorkbenchFloatingBar from './WorkbenchFloatingBar.vue';
</script>
