<template>
  <div class="score-view-wrapper relative flex size-full overflow-hidden">
    <!-- 页面标题：视图以面板切换为主体、无标题位，sr-only 供读屏按标题导航（h1） -->
    <h1 class="sr-only">乐谱</h1>
    <div
      class="score-main-content relative grid h-full min-h-0 min-w-0 flex-1 grid-rows-1 overflow-hidden bg-surface-main"
    >
      <!-- 面板切换**只淡入、不淡出**（`v-transition-fade-in`，见 assets/transitions.scss 的 1.2）：
           旧面板在切换那一帧即被隐去（离场侧只有一条 `opacity: 0`、不带任何 transition），
           新面板自己从背景色里浮出来 —— 两者从不同时可见，中间也没有「旧页还看得见」的那一两帧。
           不用交叉淡入淡出：新旧同时在场时，旧面板会在自己那 100ms 淡出里**从新面板的透明空隙中
           透出来**（两者叠在同一格）—— 排列区是逐行 canvas、大片像素透明，旧页面正好从卡片与
           文字之间的空隙里显形，观感就是「切过去之后上一页的画面还残留了一下」。
           也不用 out-in：那要等旧面板淡完才挂新的，整段串行等待正是当初要省掉的。

           容器是「单行网格」，四个面板各自无条件带 `stack-slot`（grid-area:1/1）：
           ① 空闲态只有一个子元素时落在 1/1 格、按网格默认 stretch 铺满整行，与原 flex-1 等效；
           ② 日后若有面板补上离场动画，两个子元素仍叠在同一格 —— 否则两个 flex-1 面板会各占一半
              高度、内容被压扁并跳动。叠层类必须挂在子元素自身、**不能**用 enter/leave-active-class：
           enter 与 leave 的类生命周期不保证同时结束，先摘类的那一个会立刻掉到下一行（实测尾部会抖）。 -->
      <Transition name="v-transition-fade-in">
        <KeepAlive :max="12">
          <Feedback
            v-if="!scoreEditor.activeSong"
            @action="pasteSongFromClipboardHandler()"
            action-text="从剪切板粘贴"
            class="stack-slot"
            description="请在左侧侧边栏选择或新建乐谱，或按 Ctrl/⌘+V 粘贴复制的乐谱"
            icon="music"
            key="empty"
            size="lg"
            title="未选择乐谱"
          />

          <ScoreLyricsEditor
            v-else-if="scoreEditor.activeTab === 'edit'"
            :key="`lyrics-editor-${scoreEditor.activeSong.id}`"
            class="stack-slot"
          />

          <ScoreInteractiveArea
            v-else-if="scoreEditor.activeTab === 'interactive'"
            class="stack-slot"
            key="interactive-area"
            ref="interactiveAreaRef"
          />

          <ScorePreviewPane v-else-if="scoreEditor.activeTab === 'preview'" class="stack-slot" key="score-preview" />
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
import { runBusyAction } from '@/platform/composables/runBusyAction';
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
//
// 重入守卫与失败提示走 runBusyAction：本处理器护的是「粘贴 + 可能的确认导入」这整段，
// 而 pasteSongFromClipboard 内部那条守卫（busy: isCopying）只管它自己那一段，两者不是一回事。
const isPasting = ref(false);
// 空态面板的按钮与 Ctrl/⌘+V 走同一个处理器：两条入口的重入守卫必须是同一个 `isPasting`
const pasteSongFromClipboardHandler = () =>
  void runBusyAction({
    busy: isPasting,
    errorFallback: '粘贴失败',
    run: async () => {
      const outcome = await pasteSongFromClipboard();
      if (outcome.status === 'needsConfirm') importPortableSong(outcome.portable);
    },
  });

useKeybinding('Mod+v', pasteSongFromClipboardHandler, { enabled: () => !scoreEditor.activeSong });
</script>
