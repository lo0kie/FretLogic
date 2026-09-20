<template>
  <div class="flex flex-col gap-md">
    <!-- 预览区 -->
    <div class="flex justify-center">
      <!-- 背景分两层做过渡：底色走 background-color，棋盘格走独立图层的 opacity。
           原先两者共用一个 background 属性是过渡不了的——棋盘格是 background-image、
           白/暗是 background-color，二者之间无法插值，只能硬切。
           另外透明的底色刻意写成「白但 alpha 为 0」（bg-white/0）而不是默认 transparent：
           后者等于 rgba(0,0,0,0)，从白或暗渐变过去中途会发灰。 -->
      <div
        :class="previewBg === 'white' ? 'bg-white' : previewBg === 'dark' ? 'bg-[#18181a]' : 'bg-white/0'"
        class="relative inline-block overflow-hidden rounded-md p-2 shadow-inner transition-colors duration-base"
      >
        <!-- 棋盘格（表示透明）：刻意用真实图层而不是 ::before + 负 z-index。
             负层级不会留在卡片内，而是逃逸到最近的层叠上下文（本卡片之上还有 z-panel 那层），
             正常态被卡片的不透明底色挡住；而拖拽换位的 FLIP 会给卡片写上 transform，
             卡片自己成了层叠上下文，它又跳到底色之上 —— 同一份样式两种表现，全看祖先有没有 transform。
             改成独立图层 + 指板图 relative 抬升后，绘制顺序只由 DOM 顺序决定，与祖先 transform 无关 -->
        <div
          :class="previewBg === 'transparent' ? 'opacity-100' : 'opacity-0'"
          class="pointer-events-none absolute inset-0 bg-[repeating-conic-gradient(#ccc_0%_25%,#fff_0%_50%)] bg-size-[12px_12px] transition-opacity duration-base"
        />
        <FretboardCanvas
          v-bind="fretBoardConfig"
          :chord="editorStore.draftChord"
          :chord-name-scale="0.7"
          :is-dark-mode="previewIsDark"
          :scale="1.8"
          :shorthand="settingsStore.workbenchChordShorthand"
          :theme="previewTheme"
          mutable-chord
          class="relative"
        />
      </div>
    </div>

    <!-- 背景选项 -->
    <BaseFormRow label="背景">
      <BaseSegmentedControl v-model="previewBg" :options="BG_OPTIONS" compacted size="sm" />
    </BaseFormRow>

    <!-- 操作按钮 -->
    <div class="flex gap-lg">
      <ActionButton
        :disabled="isActing"
        @click="handleCopy()"
        class="flex-1"
        color="default"
        icon="copy"
        label="复制"
        variant="subtle"
      />
      <ActionButton
        :disabled="isActing"
        @click="handleDownload()"
        class="flex-1"
        color="primary"
        icon="download"
        label="下载"
        variant="subtle"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, toRef } from 'vue';

import FretboardCanvas from '@/domains/fretboard/components/FretboardCanvas.vue';
import ActionButton from '@/platform/ui/button/ActionButton.vue';
import BaseFormRow from '@/platform/ui/form/BaseFormRow.vue';
import BaseSegmentedControl from '@/platform/ui/segmented/BaseSegmentedControl.vue';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { getChordName } from '@/domains/chord/theory/theory';
import { renderFretboardToCanvas } from '@/domains/fretboard/components/renderFretboardCanvas';
import { resolveFretboardCanvasPalette } from '@/domains/fretboard/fretboardCanvasPalette';
import { runBusyAction } from '@/platform/composables/runBusyAction';
import { writeBlobToClipboard } from '@/platform/services/clipboard/clipboard';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { useUiStore } from '@/platform/store/uiStore';
import { buildExportFileName, canvasToBlob, triggerBlobDownload } from '@/platform/utils/canvas';

import type { ExportBgMode } from '@/platform/types';
import type { SegmentOption } from '@/platform/ui/segmented/segmentOption';

const editorStore = useChordEditorStore();
const settingsStore = useSettingsStore();
const uiStore = useUiStore();

const fretBoardConfig = { showChordName: true, showOpenStringNotes: true, showFretNumbers: true, showBoldNut: true };

// ---- 背景选项（偏好持久化于 settingsStore，设备级不随偏好备份同步） ----
const BG_OPTIONS: SegmentOption<ExportBgMode>[] = [
  { label: '透明', value: 'transparent' },
  { label: '白底', value: 'white' },
  { label: '暗底', value: 'dark' },
];
const previewBg = toRef(settingsStore, 'workbenchExportBg');

// 指板配色只由背景决定，不跟随应用主题：透明底实际呈现的是浅灰白棋盘格，指板必须用
// light 配色（暗色线条）才看得清 —— 若跟随应用主题，暗色主题下会被画成亮色线条，
// 正好与浅色网格反色，几乎看不见。白底固定 light、暗底固定 dark，匹配各自底色。
const previewTheme = computed<'light' | 'dark'>(() => (previewBg.value === 'dark' ? 'dark' : 'light'));
const previewIsDark = computed(() => previewBg.value === 'dark');

// ---- 导出辅助 ----
const isActing = ref(false);

function buildCanvas(): HTMLCanvasElement {
  // 与预览完全一致：配色只由背景决定（见 previewTheme），透明底导出的是透明 PNG、用 light 配色
  const palette = resolveFretboardCanvasPalette(previewTheme.value);
  const bgColor = previewBg.value === 'white' ? '#ffffff' : previewBg.value === 'dark' ? palette.BG : undefined;
  return renderFretboardToCanvas(editorStore.draftChord, {
    scale: 4,
    colors: palette,
    shorthand: settingsStore.workbenchChordShorthand,
    bgColor,
    ...fretBoardConfig,
  });
}

/** 下载文件名：必须经 buildExportFileName 剔非法字符。
 *  转位和弦名自带斜杠（如 C/E，见 theory 的斜杠低音），直接拼进 link.download 会被浏览器
 *  改写/丢弃该段，导致「提示语说已下载 C/E.png、实际存成 C 或 C_E.png」的名实不符。
 *  回落名 'chord' 由调用方在清洗前兜住（buildExportFileName 空串时回落的是乐谱域的 'score'，
 *  不适用工作台）；清洗后不可能为空，故结果必然非空。 */
function buildFilename(): string {
  return `${buildExportFileName(getChordName(editorStore.draftChord).trim() || 'chord')}.png`;
}

/** 复制为 PNG 到剪贴板（复用 score-export 的降级与环境检测能力） */
const handleCopy = () =>
  runBusyAction({
    busy: isActing,
    run: async () => {
      const blob = await canvasToBlob(buildCanvas());
      await writeBlobToClipboard(blob);
      return '图片已复制到剪贴板';
    },
    successText: message => message,
    onError: () => uiStore.message.error('复制失败，请尝试下载'),
  });

/** 下载为 PNG */
const handleDownload = () =>
  runBusyAction({
    busy: isActing,
    run: async () => {
      const blob = await canvasToBlob(buildCanvas());
      const filename = buildFilename();
      triggerBlobDownload(blob, filename);
      return `已下载 ${filename}`;
    },
    successText: message => message,
    onError: () => uiStore.message.error('下载失败'),
  });
</script>
