<template>
  <div class="score-view-wrapper">
    <div class="score-main-content">
      <template v-if="scoreEditor.activeSong">
        <!-- 模式 1：文本编辑 -->
        <ScoreLyricsEditor v-if="scoreEditor.activeTab === 'edit'" />

        <!-- 模式 2：交互式和弦标注 -->
        <ScoreInteractiveArea v-else @open-picker="openChordPicker" />
      </template>

      <EmptyState v-else :icon="Music" title="未选择乐谱" description="请在左侧侧边栏选择或新建一份乐谱" size="lg" />
    </div>
  </div>

  <ChordPickerModal v-model:visible="isPickerOpen" />
</template>

<script setup lang="ts">
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { Music } from '@lucide/vue';
import { ref } from 'vue';

import EmptyState from '@/components/EmptyState.vue';
import ChordPickerModal from './ChordPickerModal.vue';
import ScoreInteractiveArea from './ScoreInteractiveArea.vue';
import ScoreLyricsEditor from './ScoreLyricsEditor.vue';

const scoreEditor = useScoreEditorStore();

const isPickerOpen = ref(false);

const openChordPicker = (slotKey: string | number) => {
  scoreEditor.selectedSlotKey = slotKey;
  isPickerOpen.value = true;
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.score-view-wrapper {
  display: flex;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
}

.score-main-content {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background-color: var(--bg-main);
  box-sizing: border-box;
  overflow-y: auto;
}
</style>
