<template>
  <WorkbenchPanel
    :has-content="hasFrettedNotes"
    :storage-key="STORAGE_KEYS.WORKBENCH_EXPORT_COLLAPSED"
    icon="image"
    mode-aria-label="导出面板行为"
    title="导出图片"
  >
    <div class="flex flex-col gap-md p-1 pt-3">
      <!-- 预览区 -->
      <div class="flex justify-center">
        <div
          :class="[
            previewBg === 'transparent'
              ? 'bg-[repeating-conic-gradient(#ccc_0%_25%,#fff_0%_50%)] bg-size-[12px_12px]'
              : previewBg === 'white'
                ? 'bg-white'
                : 'bg-[#18181a]',
          ]"
          class="inline-block overflow-hidden rounded-md p-2 shadow-inner"
        >
          <FretboardCanvas
            v-bind="fretBoardConfig"
            :chord="editorStore.draftChord"
            :chord-name-scale="0.7"
            :is-dark-mode="previewBg === 'dark'"
            :scale="1.8"
            :shorthand="settingsStore.workbenchChordShorthand"
          />
        </div>
      </div>

      <!-- 背景选项 -->
      <BaseFormRow label="背景">
        <BaseSegmentedControl v-model="previewBg" :options="BG_OPTIONS" compacted size="sm" />
      </BaseFormRow>

      <!-- 操作按钮 -->
      <div class="flex gap-4">
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
  </WorkbenchPanel>
</template>

<script setup lang="ts">
import { ref } from 'vue';

import { useStorage } from '@vueuse/core';

import FretboardCanvas from '@/domains/fretboard/components/FretboardCanvas.vue';
import ActionButton from '@/platform/ui/button/ActionButton.vue';
import BaseFormRow from '@/platform/ui/form/BaseFormRow.vue';
import BaseSegmentedControl from '@/platform/ui/segmented/BaseSegmentedControl.vue';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { getChordName } from '@/domains/chord/theory/theory';
import { renderFretboardToCanvas } from '@/domains/fretboard/components/renderFretboardCanvas';
import { resolveFretboardCanvasPalette } from '@/domains/fretboard/fretboardCanvasPalette';
import { writeBlobToClipboard } from '@/platform/services/clipboard/clipboard';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { useUiStore } from '@/platform/store/uiStore';
import { canvasToBlob, triggerBlobDownload } from '@/platform/utils/canvas';
import { STORAGE_KEYS } from '@/platform/utils/constants';

import WorkbenchPanel from './WorkbenchPanel.vue';

import type { SegmentOption } from '@/platform/ui/segmented/BaseSegmentedControl.vue';

const editorStore = useChordEditorStore();
const settingsStore = useSettingsStore();
const uiStore = useUiStore();

const fretBoardConfig = { showChordName: true, showOpenStringNotes: true, showFretNumbers: true, showBoldNut: true };

// ---- 面板行为：三态（自动跟随音符 / 始终展开 / 始终收起），由 WorkbenchPanel 外壳统一承载 ----
// auto 的展开依据：草稿和弦存在至少一根按音弦（有内容才值得导出）
const hasFrettedNotes = () => editorStore.draftChord.strings.some(str => str && str[0] > 0);

// ---- 背景选项 ----
type BgMode = 'transparent' | 'white' | 'dark';
const BG_OPTIONS: SegmentOption<BgMode>[] = [
  { label: '透明', value: 'transparent' },
  { label: '白底', value: 'white' },
  { label: '暗底', value: 'dark' },
];
const previewBg = useStorage<BgMode>(STORAGE_KEYS.WORKBENCH_EXPORT_BG, 'transparent');

// ---- 导出辅助 ----
const isActing = ref(false);

function buildCanvas(): HTMLCanvasElement {
  // 导出配色与背景联动：透明/白底固定亮色，暗底固定暗色（与导出图用途匹配，独立于应用主题）
  const theme = previewBg.value === 'dark' ? 'dark' : 'light';
  const palette = resolveFretboardCanvasPalette(theme);
  const bgColor = previewBg.value === 'white' ? '#ffffff' : previewBg.value === 'dark' ? palette.BG : undefined;
  return renderFretboardToCanvas(editorStore.draftChord, {
    scale: 4,
    colors: palette,
    shorthand: settingsStore.workbenchChordShorthand,
    bgColor,
    ...fretBoardConfig,
  });
}

function buildFilename(): string {
  const name = getChordName(editorStore.draftChord).trim() || 'chord';
  return `${name}.png`;
}

/** 复制为 PNG 到剪贴板（复用 score-export 的降级与环境检测能力） */
async function handleCopy() {
  if (isActing.value) return;
  isActing.value = true;
  try {
    const blob = await canvasToBlob(buildCanvas());
    await writeBlobToClipboard(blob);
    uiStore.toast.success('图片已复制到剪贴板');
  } catch {
    uiStore.toast.error('复制失败，请尝试下载');
  } finally {
    isActing.value = false;
  }
}

/** 下载为 PNG */
async function handleDownload() {
  if (isActing.value) return;
  isActing.value = true;
  try {
    const blob = await canvasToBlob(buildCanvas());
    triggerBlobDownload(blob, buildFilename());
    uiStore.toast.success(`已下载 ${buildFilename()}`);
  } catch {
    uiStore.toast.error('下载失败');
  } finally {
    isActing.value = false;
  }
}
</script>
