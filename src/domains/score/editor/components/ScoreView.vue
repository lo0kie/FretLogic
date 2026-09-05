<template>
  <div class="score-view-wrapper relative box-border flex h-full w-full overflow-hidden">
    <div
      class="score-main-content bg-bg-main relative box-border flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    >
      <Transition mode="out-in" name="v-transition-fade">
        <KeepAlive :max="12">
          <EmptyState
            v-if="!scoreEditor.activeSong"
            description="请在左侧侧边栏选择或新建一份乐谱"
            icon="music"
            key="empty"
            size="lg"
            title="未选择乐谱"
          />

          <ScoreLyricsEditor
            v-else-if="scoreEditor.activeTab === 'edit'"
            :key="`lyrics-editor-${scoreEditor.activeSong.id}`"
          />

          <ScoreInteractiveArea
            v-else-if="scoreEditor.activeTab === 'interactive'"
            :key="`interactive-area-${scoreEditor.activeSong.id}`"
            @open-picker="openChordPicker"
            ref="interactiveAreaRef"
          />

          <ScorePreviewPane v-else-if="scoreEditor.activeTab === 'preview'" key="score-preview" />
        </KeepAlive>
      </Transition>
    </div>

    <ChordPickerModal v-model:visible="isPickerOpen" />
  </div>
</template>

<script setup lang="ts">
import { onActivated, onBeforeUnmount, onDeactivated, ref, useTemplateRef } from 'vue';

import { useEventListener } from '@vueuse/core';

import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import type { SlotKey } from '@/domains/score/types';
import EmptyState from '@/platform/ui/feedback/EmptyState.vue';

import ScorePreviewPane from '../../preview/components/ScorePreviewPane.vue';
import ChordPickerModal from './ChordPickerModal.vue';
import ScoreInteractiveArea from './ScoreInteractiveArea.vue';
import ScoreLyricsEditor from './ScoreLyricsEditor.vue';

const scoreEditor = useScoreEditorStore();
const isPickerOpen = ref(false);
const interactiveAreaRef = useTemplateRef<InstanceType<typeof ScoreInteractiveArea>>('interactiveAreaRef');

/** 用户点击歌词槽位：记录选中槽位并打开和弦选择弹窗 */
const openChordPicker = (slotKey: SlotKey) => {
  scoreEditor.selectedSlotKey = slotKey;
  isPickerOpen.value = true;
};

// KeepAlive 缓存页面：仅在本页激活时拦截 Ctrl+Z / Ctrl+Y，切走后移除监听
let stopUndoKeydown: (() => void) | null = null;
/** 拦截 Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y 触发乐谱撤销重做（焦点在输入类元素内时不拦截） */
const handleUndoKeydown = (e: KeyboardEvent) => {
  if (!scoreEditor.activeSong) return;
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) scoreEditor.redo();
    else scoreEditor.undo();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    scoreEditor.redo();
  }
};
onActivated(() => {
  if (!stopUndoKeydown) {
    stopUndoKeydown = useEventListener(window, 'keydown', handleUndoKeydown);
  }
});
onDeactivated(() => {
  stopUndoKeydown?.();
  stopUndoKeydown = null;
});
onBeforeUnmount(() => {
  stopUndoKeydown?.();
  stopUndoKeydown = null;
});
</script>
