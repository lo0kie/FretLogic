<script setup lang="ts">
import useChordGroupStore from '@/store/chordGroup';

const groupStore = useChordGroupStore();
const groupIndex = defineModel({ type: Number, default: 0 });
</script>

<template>
  <div class="flex flex-col gap-3 w-full max-w-[400px]">
    <div
      v-for="(group, index) in groupStore.groups"
      :key="index"
      @click="groupIndex = index"
      :class="[
        'relative py-2 px-4 rounded-xl font-bold text-base transition-all duration-200 cursor-pointer active:scale-[0.97]',
        groupIndex === index
          ? 'bg-blue-600 text-white shadow-[0_10px_25px_-5px_rgba(37,99,235,0.4)] z-10'
          : 'bg-slate-50 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300 hover:bg-slate-100',
      ]"
    >
      <span> {{ group.name }} </span>
      <span> ({{ group.chords.length }}) </span>

      <!-- 选中的小光晕效果（可选） -->
      <div
        v-if="groupIndex === index"
        class="absolute inset-0 rounded-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)]"
      ></div>
    </div>
  </div>
</template>

<style scoped>
/* 可以在这里添加一些针对特定系统的字体优化 */
div {
  -webkit-tap-highlight-color: transparent;
}
</style>
