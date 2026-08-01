<template>
  <div class="section-block is-grow notes-section">
    <div class="section-label">构成音 (低音 ➔ 高音)</div>
    <div class="notes-list" ref="containerRef">
      <div
        v-for="note in notes"
        :key="note.stringIndex"
        class="note-row"
        :class="{
          'is-root': note.isRoot,
          'is-mobile-clickable': isMobile,
        }"
        @click="handleRowClick(note)"
        @touchstart="e => handleTouchStartWithNote(e, note)"
        @touchend="handleTouchEnd"
        @touchcancel="handleTouchCancel"
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
import { useLongPress } from '@/services/useLongPress';
import { NoteInput } from '@/types';
import { ref } from 'vue';

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
  (e: 'set-root-string', stringIndex: number): void;
  (e: 'toggle-pitch-accidental', stringIndex: number): void;
}>();

const containerRef = ref<HTMLElement | null>(null);
const activeTouchNote = ref<RenderNoteItem | null>(null);

// 使用通用长按手势 Composable
const { isLongPressHandled, handleTouchStart, handleTouchEnd, handleTouchCancel } = useLongPress(
  () => {
    if (activeTouchNote.value) {
      emit('toggle-pitch-accidental', activeTouchNote.value.stringIndex);
    }
  },
  { delay: 350 }
);

const handleTouchStartWithNote = (e: TouchEvent, note: RenderNoteItem) => {
  if (!props.isMobile || !note.canAccidentalToggle) return;
  activeTouchNote.value = note;
  handleTouchStart(e);
};

const handleRowClick = (note: RenderNoteItem) => {
  if (!props.isMobile) return;
  if (isLongPressHandled.value) return;

  emit('set-root-string', note.stringIndex);
};

defineExpose({ containerRef });
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
  }
}

.section-label {
  font-size: 0.58rem;
  font-weight: 600;
  color: var(--text-disabled);
  letter-spacing: 0.02em;
  padding-left: 0.2rem;
  flex-shrink: 0;
}

.notes-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  overflow: visible;
  flex: 1;
}

.note-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 1.8rem;
  padding: 0 0.65rem;
  border-radius: @radius-md;
  background-color: var(--bg-body);
  border: 1px solid var(--border-light);
  transition: @transition-fast;
  box-sizing: border-box;
  cursor: default;
  user-select: none;

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
