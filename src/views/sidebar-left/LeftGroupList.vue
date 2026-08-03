<template>
  <div class="left-group-list-container left-group-list">
    <div class="scroll-body no-scrollbar">
      <!-- 🌟 1. 工作台模式 (/)：渲染和弦分组与拖拽排序 -->
      <LeftChordGroupSection
        v-if="route.path === '/'"
        :search-query="searchQuery"
        @open-rename="group => $emit('open-rename', group)"
        @open-delete="group => $emit('open-delete', group)"
        @open-move="chord => $emit('open-move', chord)"
        @open-sort="group => $emit('open-sort', group)"
      />

      <!-- 🌟 2. 乐谱库模式 (/score)：渲染乐谱列表 -->
      <LeftSongListSection
        v-else-if="route.path === '/score'"
        @open-config="song => $emit('open-config-song', song)"
        @open-clear="song => $emit('open-clear-song', song)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Chord, Group, Song } from '@/types';
import { useRoute } from 'vue-router';
import LeftChordGroupSection from './LeftChordGroupSection.vue';
import LeftSongListSection from './LeftSongListSection.vue';

defineProps<{
  searchQuery: string;
}>();

defineEmits<{
  (e: 'open-rename', group: Group): void;
  (e: 'open-delete', group: Group): void;
  (e: 'open-move', chord: Chord): void;
  (e: 'open-sort', group: Group): void;
  (e: 'open-rename-song', song: Song): void;
  (e: 'open-config-song', song: Song): void;
  (e: 'open-clear-song', song: Song): void;
}>();

const route = useRoute();
</script>

<style scoped lang="less">
.left-group-list-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  box-sizing: border-box;
  width: 100%;
}

.scroll-body {
  flex: 1;
  overflow-y: auto;
  padding: 0.8rem 0.8rem;
  box-sizing: border-box;
}
</style>
