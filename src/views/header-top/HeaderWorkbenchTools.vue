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
      <ActionButton
        size="sm"
        icon-only
        variant="ghost"
        :disabled="uiStore.isCopying"
        @click="emit('export-image', true)"
      >
        <Image :size="16" stroke-width="2" />
      </ActionButton>
    </GlobalTooltip>

    <GlobalTooltip content="导出带背景卡片切图" placement="bottom" class="hidden-mobile">
      <ActionButton
        size="sm"
        icon-only
        variant="ghost"
        :disabled="uiStore.isCopying"
        @click="emit('export-image', false)"
      >
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
import { Copy, Image, Play, Square } from '@lucide/vue';

const emit = defineEmits<{
  (e: 'export-image', isTransparent: boolean): void;
}>();

const editorStore = useEditorStore();
const uiStore = useUiStore();
const { isPlaying, playCurrentChord } = useAudioPlayer();
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
