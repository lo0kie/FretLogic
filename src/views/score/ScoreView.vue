<template>
  <div class="score-view-wrapper">
    <div class="score-main-content">
      <template v-if="scoreEditor.activeSong">
        <!-- 模式 1：文本编辑 -->
        <ScoreLyricsEditor v-if="scoreEditor.activeTab === 'edit'" />

        <!-- 模式 2：交互式和弦标注 -->
        <ScoreInteractiveArea v-else @open-picker="openChordPicker" />
      </template>

      <!-- 未选择乐谱空状态 -->
      <div v-else class="no-active-song">
        <div class="empty-icon-circle">
          <Music :size="32" stroke-width="2" />
        </div>
        <p class="empty-title">未选择乐谱</p>
        <p class="empty-subtext">请在左侧侧边栏选择或新建一份乐谱</p>
      </div>
    </div>
  </div>

  <ChordPickerModal v-model:visible="isPickerOpen" :selected-slot-key="scoreEditor.selectedSlotKey" />
</template>

<script setup lang="ts">
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { Music } from '@lucide/vue';
import { ref } from 'vue';

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

.no-active-song {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
  padding: 2rem;
  box-sizing: border-box;
  user-select: none;
}

.empty-icon-circle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4rem;
  height: 4rem;
  border-radius: 50%;
  background-color: var(--bg-panel-hover);
  color: var(--text-disabled);
  margin-bottom: 1rem;
}

.empty-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-title);
  margin: 0 0 0.4rem 0;
}

.empty-subtext {
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--text-disabled);
  margin: 0;
}
</style>
