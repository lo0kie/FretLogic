<template>
  <div class="panel-right-plate flex flex-col gap-2">
    <label class="plate-label text-xs font-black tracking-widest uppercase text-subtitle">系统辅助</label>
    <div class="flex flex-col gap-4">
      <ToggleSwitch v-model="chordLabStore.isDarkMode" label="深色暗黑模式" class="bg-slate-100 dark:bg-slate-800" />
    </div>
  </div>
</template>

<script setup lang="ts">
import ToggleSwitch from '@/components/ToggleSwitch.vue';
import { useChordLabStore } from '@/stores/chordLabStore';

const chordLabStore = useChordLabStore();
</script>
