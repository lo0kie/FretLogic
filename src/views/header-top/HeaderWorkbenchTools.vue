<template>
  <div class="segmented-control-capsule">
    <ActionButton
      v-tooltip="'播放/试听当前和弦'"
      size="sm"
      variant="subtle"
      primary
      icon-only
      :disabled="editorStore.isFretBoardEmpty || isPlaying"
      @click="playCurrentChord"
    >
      <component :is="isPlaying ? Square : Play" :size="15" stroke-width="2.5" />
    </ActionButton>

    <div class="capsule-divider" data-hidden-mobile></div>

    <ActionButton
      v-tooltip="'导出透明背景图片'"
      size="sm"
      icon-only
      variant="ghost"
      :disabled="uiStore.isCopying"
      @click="handleExport(true)"
      data-hidden-mobile
    >
      <Image :size="16" stroke-width="2" />
    </ActionButton>

    <ActionButton
      v-tooltip="'导出带背景卡片切图'"
      size="sm"
      icon-only
      variant="ghost"
      :disabled="uiStore.isCopying"
      @click="handleExport(false)"
      data-hidden-mobile
    >
      <Copy :size="16" stroke-width="2" />
    </ActionButton>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import { useAudioPlayer } from '@/services/useAudioPlayer';
import { useEditorStore } from '@/stores/chordEditorStore';
import { useUiStore } from '@/stores/uiStore';
import { renderElementToBlob, writeBlobToClipboard } from '@/utils/domExporter';
import { Copy, Image, Play, Square } from '@lucide/vue';
import { unref } from 'vue';

const editorStore = useEditorStore();
const uiStore = useUiStore();
const { isPlaying, playCurrentChord } = useAudioPlayer();

const handleExport = async (isTransparent: boolean) => {
  if (uiStore.isCopying) return;

  const el = unref(uiStore.activeExportTarget);
  if (!el) {
    uiStore.toast.error('导出失败：目标 DOM 节点尚未渲染完成');
    return;
  }

  uiStore.isCopying = true;
  uiStore.toast.info(isTransparent ? '正在导出透明底色快照...' : '正在导出带卡片背景快照...');

  try {
    const blob = await renderElementToBlob(el, { isTransparent });
    await writeBlobToClipboard(blob);
    uiStore.toast.success('成功复制至系统剪贴板');
  } catch (err) {
    console.error('Fretboard Exporter Error:', err);
    uiStore.toast.error(err instanceof Error ? err.message : '导出失败');
  } finally {
    uiStore.isCopying = false;
  }
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.segmented-control-capsule {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.25rem;

  @media (max-width: 768px) {
    padding: 0.12rem;
    gap: 0.15rem;
  }
}

.capsule-divider {
  width: 1px;
  height: 0.8rem;
  background-color: var(--border-base);
  margin: 0 0.1rem;
  opacity: 0.5;
}
</style>
