<template>
  <div
    class="w-full text-center transition-transform duration-300"
    :style="{ transform: `translateY(${headerOffset})` }"
  >
    <input
      v-model="chordLabStore.currentChordName"
      type="text"
      spellcheck="false"
      placeholder="CHORD"
      class="input-chord-name w-full text-center font-black bg-transparent border-none outline-none cursor-pointer select-none caret-blue-600 transition-all duration-300 placeholder-slate-300 dark:placeholder-slate-600 text-[3.5rem] leading-none"
      :class="
        chordLabStore.currentChordName
          ? 'text-slate-900 dark:text-slate-50 drop-shadow-sm'
          : 'text-slate-300 dark:text-slate-600'
      "
    />
  </div>
</template>

<script setup lang="ts">
import { useChordLabStore } from '@/stores/chordLabStore';
import { computed } from 'vue';

const chordLabStore = useChordLabStore();

// 🌟 优化：消除魔法数组，使用安全映射
const headerOffset = computed(() => {
  const offsetMap: Record<number, string> = { 3: '3%', 4: '5%', 5: '9%' };
  return offsetMap[chordLabStore.fretCount] || '3%';
});
</script>

<style scoped lang="less">
.input-chord-name {
  letter-spacing: -0.04em;
  &:focus {
    transform: scale(1.02);
  }
}
</style>
