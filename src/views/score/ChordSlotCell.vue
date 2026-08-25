<template>
  <div
    ref="charBoxRef"
    v-wave="{ disabled: !isGlobalEditable }"
    class="char-box"
    :data-slot-key="slotKey"
    :class="{
      'edge-slot': variant !== 'char',
      'add-btn-slot': variant === 'add',
      'is-drop-target': isDropTarget,
      'is-dragging-source': isDraggingSource,
      'is-readonly': !isGlobalEditable,
      'has-chord': variant === 'char' && Boolean(chord),
      'has-edge-chord': variant === 'edge' && Boolean(chord),
      'has-left-chord-gap': leftChordGap,
    }"
    :role="isGlobalEditable ? 'button' : undefined"
    :tabindex="isGlobalEditable ? 0 : -1"
    :aria-label="ariaLabelText"
    :title="isGlobalEditable && variant === 'char' ? (chord ? '点击更换或清除和弦' : '点击添加和弦') : undefined"
    :data-focusable-inline="isGlobalEditable || undefined"
    @click="handleClick"
    @keydown.enter="handleKeydown"
    @keydown.space="handleKeydown"
    @keydown.delete="handleDelete"
    @keydown.backspace="handleDelete"
  >
    <div class="chord-display-slot">
      <div
        v-if="chord"
        v-wave="{ disabled: !isGlobalEditable }"
        class="inline-fretboard-card"
        :class="{ 'is-draggable': isGlobalEditable }"
        :title="isGlobalEditable ? '点击更换和弦，按住可拖拽换位' : undefined"
        @pointerdown.stop="isGlobalEditable && emit('pointerdown', $event, slotKey, chord)"
      >
        <button
          v-if="isVisible && !isExporting && isGlobalEditable"
          v-wave
          type="button"
          class="remove-chord-btn"
          title="清除当前和弦"
          aria-label="清除当前和弦"
          data-focusable-inline
          @click.stop.prevent="emit('remove', slotKey)"
        >
          <X :size="12" :stroke-width="3" aria-hidden="true" />
        </button>
        <Fretboard
          v-if="isVisible"
          :ref="el => chord && setFretboardMeasureRef(el, chord.fretCount)"
          :chord-name-editable="false"
          :chord
          :interactive="false"
          :scale="0.25 * scoreEditor.effectiveFretboardScale"
          :is-dark-mode="globalDarkMode"
          fret-number-size="lg"
        />
        <div v-else :style="getCalculatedOrCachedSize(chord.fretCount)" />
      </div>
      <span
        v-else-if="variant === 'add' && isGlobalEditable"
        v-wave
        class="add-edge-placeholder"
        :title="addPlaceholderTitle"
      >
        <Plus :size="18" :stroke-width="3" />
      </span>
    </div>
    <template v-if="variant === 'char'">
      <span class="char-text" :class="{ 'is-space': char === ' ' }">
        {{ char === ' ' ? '\u00A0' : char }}
      </span>
    </template>
  </div>
</template>

<script lang="ts">
import { reactive } from 'vue';
const fretboardSizeCache = reactive<Record<string, { width: string; height: string }>>({});
</script>

<script setup lang="ts">
import Fretboard from '@/components/Fretboard.vue';
import { globalDarkMode, isGlobalEditable } from '@/stores/globalState';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import type { Chord } from '@/types';
import { getPlaceholderSize } from '@/utils/chord-fretboard';
import { observeVisibility } from '@/utils/common';
import { getChordName } from '@/utils/musicTheory';
import { Plus, X } from '@lucide/vue';
import { computed, ref, useTemplateRef, watch, watchEffect, type ComponentPublicInstance } from 'vue';

const props = defineProps<{
  slotKey: string;
  chord?: Chord;
  char?: string;
  variant: 'char' | 'edge' | 'add';
  addPlaceholderTitle?: string;
  /** 拖拽高亮已改为由 useLyricsDragDrop 直接切换 DOM class，此 prop 仅作预留 */
  isDropTarget?: boolean;
  isDraggingSource?: boolean;
  isExporting: boolean;
  scrollRoot?: HTMLElement | null;
  /** 左侧相邻字符也分配了和弦时，为靠右的和弦留出横向间距 */
  leftChordGap?: boolean;
}>();

const emit = defineEmits<{
  (e: 'click'): void;
  (e: 'remove', slotKey: string): void;
  (e: 'pointerdown', event: PointerEvent, slotKey: string, chord: Chord): void;
}>();

const isVisible = ref(false);
const scoreEditor = useScoreEditorStore();
const charBoxRef = useTemplateRef<HTMLElement>('charBoxRef');

// 所有字符槽共享同一个 IntersectionObserver（按 scrollRoot 复用），命中即停
watchEffect(onCleanup => {
  const el = charBoxRef.value;
  if (!el || isVisible.value) return;
  const stop = observeVisibility(
    el,
    visible => {
      if (visible) isVisible.value = true;
    },
    props.scrollRoot ?? null
  );
  onCleanup(stop);
});

const getEffectiveScale = () => 0.25 * scoreEditor.effectiveFretboardScale;
const getCacheKey = (fretCount: number) => `${fretCount}_${getEffectiveScale().toFixed(2)}`;

const setFretboardMeasureRef = (el: Element | ComponentPublicInstance | null, fretCount: number) => {
  if (!el) return;
  const cacheKey = getCacheKey(fretCount);
  if (fretboardSizeCache[cacheKey]) return;
  const domEl = (el as ComponentPublicInstance)?.$el ?? el;
  if (!(domEl instanceof HTMLElement)) return;
  const rect = domEl.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    fretboardSizeCache[cacheKey] = {
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    };
  }
};

const getCalculatedOrCachedSize = (fretCount: number) => {
  const cacheKey = getCacheKey(fretCount);
  if (fretboardSizeCache[cacheKey]) return fretboardSizeCache[cacheKey];
  else return getPlaceholderSize(fretCount, getEffectiveScale());
};

const handleClick = (e: MouseEvent) => {
  if (isGlobalEditable.value) {
    e.stopPropagation();
    e.preventDefault();
    emit('click');
  }
};

const handleKeydown = (e: KeyboardEvent) => {
  if (isGlobalEditable.value) {
    e.stopPropagation();
    e.preventDefault();
    emit('click');
  }
};

const handleDelete = (e: KeyboardEvent) => {
  if (isGlobalEditable.value && props.chord) {
    e.stopPropagation();
    e.preventDefault();
    emit('remove', props.slotKey);
  }
};

const ariaLabelText = computed(() => {
  if (props.variant === 'add') {
    return isGlobalEditable.value ? '添加边缘和弦槽位' : undefined;
  }
  const charDisplay = props.char === ' ' ? '空格' : props.char || '边缘槽位';
  if (props.chord) {
    const chordName = getChordName(props.chord);
    return isGlobalEditable.value
      ? `字符 ${charDisplay}，当前分配和弦 ${chordName}，按 Enter 更换，按 Delete 清除`
      : `字符 ${charDisplay}，和弦 ${chordName}`;
  }
  return isGlobalEditable.value ? `字符 ${charDisplay}，未分配和弦，按 Enter 添加` : undefined;
});

let unwatchExport: (() => void) | null = null;
unwatchExport = watch(
  () => props.isExporting,
  exporting => {
    if (exporting) {
      // isVisible 置 true 后上方 watchEffect 会自动停止观察
      isVisible.value = true;
      unwatchExport?.();
    }
  },
  { immediate: true }
);
</script>

<style scoped lang="scss">
.char-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: $space-2xs $space-2xs;
  align-self: stretch;
  border-radius: $radius-sm;
  box-sizing: border-box;
  transition:
    background-color $duration-fast ease,
    box-shadow $duration-fast ease,
    opacity $duration-fast ease;
  position: relative;
  cursor: pointer;
  outline: none;
  touch-action: pan-x pan-y;

  &:hover:not(.is-readonly) {
    background-color: var(--tint-primary-88);
    .char-text {
      color: var(--color-primary);
    }
  }

  &.is-readonly {
    cursor: unset;

    .inline-fretboard-card,
    .chord-display-slot,
    .char-text {
      pointer-events: none; // 让鼠标/触摸事件直接穿透至外层 .lyrics-line 触发 v-wave
    }
  }

  &.is-drop-target {
    background-color: var(--tint-primary-85);
    box-shadow: inset 0 0 0 2px var(--color-primary);
    .add-edge-placeholder {
      opacity: 1;
      pointer-events: auto;
    }
  }

  &.is-dragging-source {
    opacity: 0.35;
  }

  /* 连续字符都有和弦时，靠右的和弦与左侧和弦拉开间距 */
  &.has-left-chord-gap {
    margin-left: 0.42rem;
  }

  &.edge-slot {
    opacity: 0.85;
    &.has-edge-chord {
      opacity: 1;
      justify-content: flex-start;
      .chord-display-slot {
        align-items: flex-start;
      }
      &::after {
        content: '';
        display: block;
        width: 100%;
        height: 1.15rem;
        flex-shrink: 0;
      }
    }
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
      &.is-readonly {
        display: none !important;
      }
    }
  }
}

.add-edge-placeholder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 1.25rem;
  font-size: $fs-2xs;
  font-weight: 700;
  color: var(--color-primary);
  opacity: 0;
  pointer-events: none;
  transition:
    opacity $duration-fast ease,
    background-color $duration-fast ease;
  border: 1px dashed var(--color-primary);
  background-color: var(--tint-primary-92);
  padding: 0 $space-sm;
  border-radius: $radius-sm;
  white-space: nowrap;
  cursor: pointer;
  box-sizing: border-box;

  &:hover {
    background-color: var(--tint-primary-80);
  }

  :global(.lyrics-line:hover) & {
    opacity: 1;
    pointer-events: auto;
  }
}

.chord-display-slot {
  flex: 1;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  width: 100%;
}

.inline-fretboard-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: $space-xs;
  border-radius: $radius-sm;
  background-color: transparent;
  transition: $transition-fast;
  position: relative;
  user-select: none;
  -webkit-user-select: none;
  cursor: default;

  &.is-draggable {
    cursor: pointer;
    touch-action: none;

    &:hover {
      .remove-chord-btn {
        opacity: 1 !important;
        pointer-events: auto;
      }
    }
  }
}

.remove-chord-btn {
  position: absolute;
  top: -5px;
  right: -5px;
  width: 0.95rem;
  height: 0.95rem;
  border-radius: 50%;
  background-color: var(--color-danger);
  color: var(--text-on-accent);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
  pointer-events: none;
  transition: $transition-fast;
  z-index: var(--z-card);
  box-shadow: var(--shadow-sm);
  outline: none;
  opacity: 0;

  &:hover {
    transform: scale(1.05);
    background-color: color-mix(in srgb, var(--color-danger), black 15%);
  }

  &:active {
    transform: scale(0.95);
  }
}

.char-text {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: calc($fs-sm * var(--score-font-scale, 1));
  font-weight: 600;
  color: var(--text-title);
  line-height: 1.15rem;
  white-space: pre;
  min-height: calc(1.15rem * var(--score-font-scale, 1));
  padding: 0 $space-2xs;
  border-radius: 0;
  transition:
    color $duration-fast ease,
    font-size $duration-fast ease,
    min-height $duration-fast ease,
    border-color $duration-fast ease;
  border-bottom: 1.5px solid transparent;
  box-sizing: border-box;
  margin-top: auto;

  .has-chord &:not(.is-space) {
    border-bottom: 1.5px dashed var(--text-disabled);
  }
}
</style>
