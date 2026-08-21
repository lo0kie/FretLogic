<template>
  <div class="section-block is-grow notes-section">
    <div class="section-label">构成音</div>
    <div class="notes-list no-scrollbar" ref="containerRef">
      <div
        v-wave
        v-for="note in notes"
        :key="note.stringIndex"
        class="note-row"
        :class="{
          'is-root': note.isRoot,
          'is-mobile-clickable': isMobile,
        }"
        @click="handleRowClick(note)"
        v-on-long-press="[() => handleLongPress(note), { delay: 350 }]"
      >
        <div class="note-left-group">
          <span class="string-indicator">{{ 6 - note.stringIndex }}弦</span>
          <span class="note-name-text">{{ note.label }}</span>
        </div>
        <span class="interval-tag">{{ note.interval }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { NoteInput } from '@/types';
import { vOnLongPress } from '@vueuse/components';
import { useElementSize } from '@vueuse/core';
import { useTemplateRef } from 'vue';

export interface RenderNoteItem extends NoteInput {
  isRoot: boolean;
  interval: string;
  canAccidentalToggle: boolean;
}

const props = defineProps<{
  notes: RenderNoteItem[];
  isMobile: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle-root-string', stringIndex: number): void;
  (e: 'toggle-pitch-accidental', stringIndex: number): void;
}>();

const containerRef = useTemplateRef<HTMLElement>('containerRef');
const { height } = useElementSize(containerRef);

const handleRowClick = (note: RenderNoteItem) => {
  if (!props.isMobile) return;

  emit('toggle-root-string', note.stringIndex);
};

const handleLongPress = (note: RenderNoteItem) => {
  if (!props.isMobile || !note.canAccidentalToggle) return;
  emit('toggle-pitch-accidental', note.stringIndex);
};

defineExpose({ height });
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.section-block {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;

  &.is-grow {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
}

.section-label {
  font-size: 0.58rem;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.02em;
  padding-left: 0.2rem;
  flex-shrink: 0;
}

.notes-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem; // 适度缩小间距（原 0.5rem 偏大）
  overflow-y: auto; // 允许内部滚动
  flex: 1;
  min-height: 0;
}

.note-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0.75rem;
  border-radius: @radius-md;
  background-color: var(--bg-body);
  border: 1px solid var(--border-light);
  transition: @transition-fast;
  box-sizing: border-box;
  cursor: default;
  user-select: none;
  min-height: 1.85rem; // 将固定 height 改为 min-height
  height: auto;
  padding: 0.25rem 0.65rem;
  flex-shrink: 0;

  &:hover {
    border-color: var(--border-base);
    background-color: var(--bg-panel-hover);
  }

  &.is-mobile-clickable {
    cursor: pointer;

    &:active {
      transform: scale(0.98);
    }
  }

  &.is-root {
    background-color: color-mix(in srgb, var(--color-warning), transparent 90%);
    border-color: color-mix(in srgb, var(--color-warning), transparent 65%);

    .string-indicator {
      color: var(--color-warning);
    }

    .note-name-text {
      color: var(--color-warning);
      font-weight: 800;
    }

    .interval-tag {
      background-color: var(--color-warning);
      color: #ffffff;
      border-color: transparent;
      box-shadow: 0 1px 4px color-mix(in srgb, var(--color-warning), transparent 50%);
    }
  }
}

.note-left-group {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.string-indicator {
  font-size: 0.58rem;
  font-weight: 700;
  color: var(--text-disabled);
  letter-spacing: -0.01em;
}

.note-name-text {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-title);
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
}

.interval-tag {
  min-width: 1.25rem;
  height: 1rem;
  padding: 0 0.35rem;
  border-radius: 9999px;
  background-color: var(--bg-panel-hover);
  color: var(--text-body);
  border: 1px solid var(--border-light);
  font-size: 0.58rem;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  line-height: 1;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Rounded', sans-serif;
}

@media (max-width: 768px) {
  .notes-section {
    flex: 0.2;
  }
}
</style>
