<template>
  <div class="score-view-wrapper relative flex size-full overflow-hidden">
    <div
      class="score-main-content relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-main"
    >
      <Transition mode="out-in" name="v-transition-fade">
        <KeepAlive :max="12">
          <Feedback
            v-if="!scoreEditor.activeSong"
            @action="pasteSongFromClipboardHandler()"
            action-text="从剪切板粘贴"
            description="请在左侧侧边栏选择或新建乐谱，或按 Ctrl/⌘+V 粘贴复制的乐谱"
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
            key="interactive-area"
            ref="interactiveAreaRef"
          />

          <ScorePreviewPane v-else-if="scoreEditor.activeTab === 'preview'" key="score-preview" />
        </KeepAlive>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, useTemplateRef } from 'vue';

import ScorePreviewPane from '@/domains/score/preview/components/ScorePreviewPane.vue';
import Feedback from '@/platform/ui/feedback/Feedback.vue';
import { useScoreRouteSync } from '@/domains/score/editor/composables/useScoreRouteSync';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useTextTransfer } from '@/domains/score/transfer/useTextTransfer';
import { useKeybinding } from '@/platform/composables/useKeybinding';

import ScoreInteractiveArea from './ScoreInteractiveArea.vue';
import ScoreLyricsEditor from './ScoreLyricsEditor.vue';

const scoreEditor = useScoreEditorStore();
// URL ↔ Store 状态同构（#/score?id=xxx&tab=xxx）：本组件注册路由 watcher 与 KeepAlive 重激活回放
useScoreRouteSync();
const interactiveAreaRef = useTemplateRef<InstanceType<typeof ScoreInteractiveArea>>('interactiveAreaRef');

// 乐谱撤销/重做全局快捷键：仅在本页（KeepAlive 缓存）激活且有 activeSong 时拦截。
// 焦点在输入类元素内放行原生输入由 useKeybinding 默认的 ignoreEditable 承担，业务无需手动判焦点。
useKeybinding('Mod+z', () => scoreEditor.undo(), { enabled: () => Boolean(scoreEditor.activeSong) });
useKeybinding(['Mod+Shift+z', 'Mod+y'], () => scoreEditor.redo(), { enabled: () => Boolean(scoreEditor.activeSong) });

const { pasteSongFromClipboard, importPortableSong } = useTextTransfer();

// 空打开状态从剪贴板粘贴乐谱：复制来的乐谱含结构会直接建谱；纯歌词无结构时用户本就主动粘贴，
// 直接落地（无需顶栏「确认兜底」二次确认）。仅当无任何 activeSong 时拦截 Ctrl/⌘+V，
// 有乐谱时放行原生输入（歌词编辑器等可编辑区由 useKeybinding 的 ignoreEditable 保证）。
const isPasting = ref(false);
const pasteSongFromClipboardHandler = async () => {
  if (isPasting.value) return;
  isPasting.value = true;
  try {
    const outcome = await pasteSongFromClipboard();
    if (outcome.status === 'needsConfirm') importPortableSong(outcome.portable);
  } finally {
    isPasting.value = false;
  }
};
useKeybinding('Mod+v', () => void pasteSongFromClipboardHandler(), { enabled: () => !scoreEditor.activeSong });
</script>
