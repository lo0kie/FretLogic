<template>
  <div class="w-full text-center">
    <input
      v-model="editorStore.currentChordName"
      type="text"
      spellcheck="false"
      placeholder="CHORD"
      class="input-chord-name w-full text-center font-black bg-transparent border-none outline-none cursor-pointer select-none caret-blue-600 transition-all duration-300 placeholder-slate-300 dark:placeholder-slate-600 text-[4rem] leading-none"
      :class="
        editorStore.currentChordName
          ? 'text-slate-900 dark:text-slate-50 drop-shadow-sm'
          : 'text-slate-300 dark:text-slate-600'
      "
    />
  </div>
</template>

<script setup lang="ts">
import { useEditorStore } from '@/stores/editorStore';

const editorStore = useEditorStore();
</script>

<style scoped lang="less">
.input-chord-name {
  letter-spacing: -0.04em;
  &:focus {
    transform: scale(1.02);
  }
}
</style>
