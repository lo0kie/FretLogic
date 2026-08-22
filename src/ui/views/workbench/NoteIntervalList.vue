<template>
  <div class="section-block is-grow notes-section">
    <div class="section-label">构成音</div>
    <div ref="containerRef" class="notes-list no-scrollbar">
      <div
        v-for="note in notes"
        :key="note.stringIndex"
        v-wave
        class="note-row"
        :class="{
          'is-root': note.isRoot,
        }"
      >
        <div class="note-left-group">
          <span class="string-indicator">{{ 6 - note.stringIndex }}弦</span>
          <span class="note-name-text">{{ note.label }}</span>
        </div>
        <span class="interval-tag">
          <span> {{ note.intervalDegree }} </span>
          <sup v-if="note.intervalAccidental" class="interval-acc">{{ note.intervalAccidental }}</sup>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { NoteInput } from '@/types';
import { useElementSize } from '@vueuse/core';
import { useTemplateRef } from 'vue';

export interface RenderNoteItem extends NoteInput {
  isRoot: boolean;
  intervalDegree: string;
  intervalAccidental: '' | 'b' | '#';
  canAccidentalToggle: boolean;
}

defineProps<{
  notes: RenderNoteItem[];
}>();

const containerRef = useTemplateRef<HTMLElement>('containerRef');
const { height } = useElementSize(containerRef);

defineExpose({ height });
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.section-block {
  display: flex;
  flex-direction: column;
  gap: @space-sm;

  &.is-grow {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
}

.section-label {
  font-size: @fs-2xs;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.02em;
  padding-left: 0.2rem;
  flex-shrink: 0;
}

.notes-list {
  display: flex;
  flex-direction: column;
  gap: @space-sm; // 适度缩小间距（原 0.5rem 偏大）
  overflow-y: auto; // 允许内部滚动
  flex: 1;
  min-height: 0;
}

.note-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 @space-md;
  border-radius: @radius-md;
  background-color: var(--bg-body);
  border: 1px solid var(--border-light);
  transition: @transition-fast;
  box-sizing: border-box;
  cursor: default;
  user-select: none;
  min-height: 1.85rem; // 将固定 height 改为 min-height
  height: auto;
  padding: @space-xs @space-md;
  flex-shrink: 0;

  &:hover {
    border-color: var(--border-base);
    background-color: var(--bg-panel-hover);
  }

  &.is-root {
    background-color: var(--tint-warning-90);
    border-color: var(--tint-warning-65);

    .string-indicator {
      color: var(--color-warning);
    }

    .note-name-text {
      color: var(--color-warning);
      font-weight: 800;
    }

    .interval-tag {
      background-color: var(--color-warning);
      color: var(--text-on-accent);
      border-color: transparent;
      box-shadow: 0 1px 4px color-mix(in srgb, var(--color-warning), transparent 50%);
    }
  }
}

.note-left-group {
  display: flex;
  align-items: center;
  gap: @space-sm;
}

.string-indicator {
  font-size: @fs-2xs;
  font-weight: 700;
  color: var(--text-disabled);
  letter-spacing: -0.01em;
}

.note-name-text {
  font-size: @fs-xs;
  font-weight: 700;
  color: var(--text-title);
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
}

.interval-tag {
  min-width: 1.25rem;
  height: 1rem;
  padding: 0 @space-sm;
  border-radius: @radius-pill;
  background-color: var(--bg-panel-hover);
  color: var(--text-body);
  border: 1px solid var(--border-light);
  font-size: @fs-2xs;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  line-height: 1;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Rounded', sans-serif;
}

.interval-acc {
  font-size: @fs-sup; // 上角标：比主数字小，右侧对齐
  font-weight: 700;
  line-height: 0;
  vertical-align: super;
  margin-left: 0.04rem;
  letter-spacing: -0.01em;
}
</style>
