<template>
  <div class="segmented-control-capsule">
    <GlobalTooltip content="播放/试听当前和弦" placement="bottom">
      <ActionButton
        size="sm"
        variant="subtle"
        icon-only
        :disabled="editorStore.isFretBoardEmpty || isPlaying"
        @click="playCurrentChord"
      >
        <component :is="isPlaying ? Square : Play" :size="15" stroke-width="2.5" />
      </ActionButton>
    </GlobalTooltip>

    <div class="capsule-divider"></div>

    <GlobalTooltip content="导出透明背景图片" placement="bottom">
      <ActionButton size="sm" icon-only variant="ghost" :disabled="uiStore.isCopying" @click="handleExport(true)">
        <Image :size="16" stroke-width="2" />
      </ActionButton>
    </GlobalTooltip>

    <GlobalTooltip content="导出带背景卡片切图" placement="bottom" class="hidden-mobile">
      <ActionButton size="sm" icon-only variant="ghost" :disabled="uiStore.isCopying" @click="handleExport(false)">
        <Copy :size="16" stroke-width="2" />
      </ActionButton>
    </GlobalTooltip>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { useAudioPlayer } from '@/services/useAudioPlayer';
import { useEditorStore } from '@/stores/chordEditorStore';
import { useUiStore } from '@/stores/uiStore';
import { copyElementToClipboard } from '@/utils/domExporter';
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
    await copyElementToClipboard(el, { isTransparent });
    uiStore.toast.success('成功复制至系统剪贴板');
  } catch (err) {
    console.error('Fretboard Exporter Error:', err);
    uiStore.toast.error('导出失败：当前浏览器内核环境受限');
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
  border-radius: 9999px;
  border: 1px solid var(--glass-border);
  box-sizing: border-box;
}

.capsule-divider {
  width: 1px;
  height: 0.8rem;
  background-color: var(--border-base);
  margin: 0 0.1rem;
  opacity: 0.5;
}
</style>
