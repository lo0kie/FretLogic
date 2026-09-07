<template>
  <div class="score-view-wrapper relative box-border flex size-full overflow-hidden">
    <div
      class="score-main-content relative box-border flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-main"
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
            @open-picker="openChordPicker($event)"
            key="interactive-area"
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
import { ref, useTemplateRef } from 'vue';

import ScorePreviewPane from '@/domains/score/preview/components/ScorePreviewPane.vue';
import EmptyState from '@/platform/ui/feedback/EmptyState.vue';
import { useScoreRouteSync } from '@/domains/score/editor/composables/useScoreRouteSync';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useKeybinding } from '@/platform/composables/useKeybinding';

import ChordPickerModal from './ChordPickerModal.vue';
import ScoreInteractiveArea from './ScoreInteractiveArea.vue';
import ScoreLyricsEditor from './ScoreLyricsEditor.vue';

import type { SlotKey } from '@/domains/score/types';

const scoreEditor = useScoreEditorStore();
// URL ↔ Store 状态同构（#/score?id=xxx&tab=xxx）：本组件注册路由 watcher 与 KeepAlive 重激活回放
useScoreRouteSync();
const isPickerOpen = ref(false);
const interactiveAreaRef = useTemplateRef<InstanceType<typeof ScoreInteractiveArea>>('interactiveAreaRef');

/** 用户点击歌词槽位：记录选中槽位并打开和弦选择弹窗 */
const openChordPicker = (slotKey: SlotKey) => {
  scoreEditor.selectedSlotKey = slotKey;
  isPickerOpen.value = true;
};

// 乐谱撤销/重做全局快捷键：仅在本页（KeepAlive 缓存）激活且有 activeSong 时拦截。
// 焦点在输入类元素内放行原生输入由 useKeybinding 默认的 ignoreEditable 承担，业务无需手动判焦点。
useKeybinding('Mod+z', () => scoreEditor.undo(), { enabled: () => !!scoreEditor.activeSong });
useKeybinding(['Mod+Shift+z', 'Mod+y'], () => scoreEditor.redo(), { enabled: () => !!scoreEditor.activeSong });
</script>
