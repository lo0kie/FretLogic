<template>
  <div class="score-view-wrapper">
    <div class="score-main-content">
      <template v-if="songStore.activeSong">
        <!-- 模式 1：文本编辑 -->
        <ScoreLyricsEditor v-if="uiStore.scoreActiveTab === 'edit'" />

        <!-- 模式 2：交互式和弦标注 -->
        <ScoreInteractiveArea v-else @open-picker="openChordPicker" />
      </template>

      <!-- 未选择乐谱时的空状态 -->
      <div v-else class="no-active-song">
        <Music :size="32" />
        <p>在左侧选择或新建一份乐谱</p>
      </div>
    </div>
  </div>

  <!-- 和弦选择 Modal 组件 -->
  <ChordPickerModal v-model:visible="isPickerOpen" :selected-slot-key="selectedSlotKey" />
</template>

<script setup lang="ts">
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import { Music } from '@lucide/vue';
import { ref } from 'vue';

import ChordPickerModal from './ChordPickerModal.vue';
import ScoreInteractiveArea from './ScoreInteractiveArea.vue';
import ScoreLyricsEditor from './ScoreLyricsEditor.vue';

const uiStore = useUiStore();
const songStore = useSongStore();

const isPickerOpen = ref(false);
const selectedSlotKey = ref<string | number | null>(null);

const openChordPicker = (slotKey: string | number) => {
  selectedSlotKey.value = slotKey;
  isPickerOpen.value = true;
};
</script>

<style scoped lang="less">
.score-view-wrapper {
  display: flex;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

.score-main-content {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background-color: var(--bg-main);
  box-sizing: border-box;
}

.no-active-song {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 0.8rem;
  color: var(--text-disabled);
}
</style>
