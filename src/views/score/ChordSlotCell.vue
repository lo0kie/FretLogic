<template>
  <div
    class="char-box"
    :class="{
      'edge-slot': variant !== 'char',
      'add-btn-slot': variant === 'add',
      'is-drop-target': isDropTarget,
      'has-chord': variant === 'char' && Boolean(chord),
      'has-edge-chord': variant === 'edge' && Boolean(chord),
    }"
    :title="variant === 'char' ? (chord ? '点击更换或清除和弦' : '点击添加和弦') : undefined"
    @click="emit('click')"
    @dragover.prevent="emit('dragover', $event)"
    @dragleave="emit('dragleave', $event)"
    @drop="emit('drop')"
  >
    <div class="chord-display-slot">
      <div
        v-if="chord"
        class="inline-fretboard-card"
        draggable="true"
        title="点击更换/移除和弦，按住可拖拽换位"
        @dragstart.stop="emit('dragstart')"
        @dragend="emit('dragend')"
      >
        <span class="inline-chord-name">{{ chord.chordName }}</span>
        <Fretboard
          :interactive="false"
          :scale="0.28"
          :strings="chord.strings"
          :capo="chord.capo"
          :fret-count="chord.fretCount"
          :is-dark-mode="isDarkMode"
        />
      </div>

      <span v-else-if="variant === 'add'" class="add-edge-placeholder" :title="addPlaceholderTitle">+和弦</span>
    </div>

    <!-- 🌟 只有字符插槽才渲染底部字符 -->
    <template v-if="variant === 'char'">
      <span class="char-text">{{ char }}</span>
    </template>
  </div>
</template>

<script setup lang="ts">
import Fretboard from '@/components/Fretboard.vue';
import type { Chord } from '@/types';

defineProps<{
  slotKey: string | number;
  chord?: Chord;
  char?: string;
  variant: 'char' | 'edge' | 'add';
  addPlaceholderTitle?: string;
  isDropTarget: boolean;
  isDarkMode: boolean;
}>();

const emit = defineEmits<{
  (e: 'click'): void;
  (e: 'dragstart'): void;
  (e: 'dragend'): void;
  (e: 'dragover', ev: DragEvent): void;
  (e: 'dragleave', ev: DragEvent): void;
  (e: 'drop'): void;
}>();
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.char-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding: 0.15rem 0.12rem;
  align-self: stretch;
  border-radius: @radius-sm;
  box-sizing: border-box;
  transition:
    background-color @duration-fast ease,
    box-shadow @duration-fast ease;
  position: relative;
  cursor: pointer;

  &:hover {
    background-color: color-mix(in srgb, var(--color-primary), transparent 88%);

    .char-text {
      color: var(--color-primary);
    }
  }

  &.char-box.is-drop-target {
    background-color: color-mix(in srgb, var(--color-primary), transparent 85%);
    box-shadow: inset 0 0 0 2px var(--color-primary);

    .add-edge-placeholder {
      opacity: 1;
      pointer-events: auto;
    }
  }

  /* 🌟 行首行尾插槽样式控制 */
  &.edge-slot {
    opacity: 0.85;

    /* 1. 存在和弦时：顶部对齐 */
    &.has-edge-chord {
      justify-content: flex-start;

      .chord-display-slot {
        align-items: flex-start;
      }
    }

    /* 2. "+和弦" 按钮插槽：垂直居中对齐 */
    &.add-btn-slot {
      opacity: 1;
      padding-left: 0.4rem;
      padding-right: 0.4rem;
      justify-content: center;

      .chord-display-slot {
        align-items: center;
      }

      &:hover {
        background-color: transparent;
      }
    }
  }
}

.add-edge-placeholder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 1.25rem;
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--color-primary);
  opacity: 0;
  pointer-events: none;
  transition:
    opacity @duration-fast ease,
    background-color @duration-fast ease;
  border: 1px dashed var(--color-primary);
  background-color: color-mix(in srgb, var(--color-primary), transparent 92%);
  padding: 0 0.35rem;
  border-radius: @radius-sm;
  white-space: nowrap;
  cursor: pointer;
  box-sizing: border-box;

  &:hover {
    background-color: color-mix(in srgb, var(--color-primary), transparent 80%);
  }
}

.chord-display-slot {
  flex: 1;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  width: 100%;
}

.inline-fretboard-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.12rem 0.15rem;
  border-radius: @radius-sm;
  background-color: transparent;
  border: 1px solid transparent;
  transition: @transition-fast;
  cursor: pointer;

  & * {
    cursor: pointer;
  }

  &[draggable='true'] {
    cursor: grab;

    &:active {
      cursor: grabbing;
      opacity: 0.8;
    }
  }

  &:hover {
    background-color: color-mix(in srgb, var(--text-title), transparent 90%);
    border-color: var(--border-light);
  }
}

.inline-chord-name {
  font-size: 0.62rem;
  font-weight: 800;
  color: var(--text-title);
  line-height: 1;
  margin-bottom: 0.1rem;
}

.char-text {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-title);
  line-height: 1.15rem;
  padding: 0 0.08rem;
  border-radius: 0;
  transition:
    color @duration-fast ease,
    border-color @duration-fast ease;
  border-bottom: 1.5px solid transparent;
  box-sizing: border-box;

  .has-chord & {
    border-bottom: 1.5px dashed var(--text-disabled);
  }
}
</style>
