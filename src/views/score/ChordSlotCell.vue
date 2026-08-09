<template>
  <div
    class="char-box"
    ref="charBoxRef"
    :class="{
      'edge-slot': variant !== 'char',
      'add-btn-slot': variant === 'add',
      'is-drop-target': isDropTarget,
      'has-chord': variant === 'char' && Boolean(chord),
      'has-edge-chord': variant === 'edge' && Boolean(chord),
    }"
    role="button"
    tabindex="0"
    :aria-label="ariaLabelText"
    :title="variant === 'char' ? (chord ? '点击更换或清除和弦' : '点击添加和弦') : undefined"
    @click.stop.prevent="emit('click')"
    @keydown.enter.prevent="emit('click')"
    @keydown.space.prevent="emit('click')"
    @keydown.delete.prevent="chord && emit('remove', slotKey)"
    @keydown.backspace.prevent="chord && emit('remove', slotKey)"
    @dragover.prevent="emit('dragover', $event)"
    @dragleave="emit('dragleave', $event)"
    @drop="emit('drop')"
    v-wave
    data-focusable-inline
  >
    <div class="chord-display-slot">
      <div
        v-if="chord"
        class="inline-fretboard-card"
        draggable="true"
        title="点击更换和弦，按住可拖拽换位"
        @click.stop.prevent="emit('click')"
        @dragstart.stop="emit('dragstart', $event)"
        @dragend="emit('dragend')"
      >
        <button
          v-wave
          v-if="isVisible"
          type="button"
          class="remove-chord-btn"
          title="清除当前和弦"
          aria-label="清除当前和弦"
          @click.stop.prevent="emit('remove', slotKey)"
          data-focusable-inline
        >
          <X :size="12" :stroke-width="3" aria-hidden="true" />
        </button>

        <span class="inline-chord-name"> {{ chord.chordName }} </span>

        <Fretboard
          v-if="isVisible"
          :chord="chord"
          :ref="el => chord && setFretboardMeasureRef(el, chord.fretCount)"
          :interactive="false"
          :scale="0.28 * scoreEditor.fretboardScale"
          :is-dark-mode="settingsStore.isDarkMode"
          fret-number-size="lg"
        />

        <div v-else :style="getCalculatedOrCachedSize(chord.fretCount)" />
      </div>

      <span v-wave v-else-if="variant === 'add'" class="add-edge-placeholder" :title="addPlaceholderTitle">+和弦</span>
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
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Chord } from '@/types';
import { getPlaceholderSize } from '@/utils/fretboardVisuals';
import { X } from '@lucide/vue';
import { useIntersectionObserver } from '@vueuse/core';
import { computed, ref, useTemplateRef, watch, type ComponentPublicInstance } from 'vue';

const props = defineProps<{
  slotKey: string | number;
  chord?: Chord;
  char?: string;
  variant: 'char' | 'edge' | 'add';
  addPlaceholderTitle?: string;
  isDropTarget: boolean;
  isExporting: boolean;
  scrollRoot?: HTMLElement | null; // 🌟 新增
}>();

const emit = defineEmits<{
  (e: 'click'): void;
  (e: 'remove', slotKey: string | number): void;
  (e: 'dragstart', event: DragEvent): void;
  (e: 'dragend'): void;
  (e: 'dragover', ev: DragEvent): void;
  (e: 'dragleave', ev: DragEvent): void;
  (e: 'drop'): void;
}>();

const isVisible = ref(false);
const scoreEditor = useScoreEditorStore();
const settingsStore = useSettingsStore();
const charBoxRef = useTemplateRef<HTMLElement>('charBoxRef');

const { stop: stopObserving } = useIntersectionObserver(
  charBoxRef,
  ([entry]) => {
    if (entry.isIntersecting) {
      isVisible.value = true;
      stopObserving();
    }
  },
  { root: () => props.scrollRoot ?? undefined }
);

const getEffectiveScale = () => 0.28 * scoreEditor.fretboardScale;
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

const ariaLabelText = computed(() => {
  if (props.variant === 'add') {
    return '添加边缘和弦槽位';
  }
  const charDisplay = props.char === ' ' ? '空格' : props.char || '边缘槽位';
  if (props.chord) {
    return `字符 ${charDisplay}，当前分配和弦 ${props.chord.chordName}，按 Enter 更换，按 Delete 清除`;
  }
  return `字符 ${charDisplay}，未分配和弦，按 Enter 添加`;
});

let unwatchExport: (() => void) | null = null;

unwatchExport = watch(
  () => props.isExporting,
  exporting => {
    if (exporting) {
      isVisible.value = true;
      stopObserving();
      unwatchExport?.();
    }
  },
  { immediate: true }
);
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.char-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 0.15rem 0.12rem;
  align-self: stretch;
  border-radius: @radius-sm;
  box-sizing: border-box;
  transition:
    background-color @duration-fast ease,
    box-shadow @duration-fast ease;
  position: relative;
  cursor: pointer;
  outline: none;

  &:hover {
    background-color: color-mix(in srgb, var(--color-primary), transparent 88%);

    .char-text {
      color: var(--color-primary);
    }
  }

  &.is-drop-target {
    background-color: color-mix(in srgb, var(--color-primary), transparent 85%);
    box-shadow: inset 0 0 0 2px var(--color-primary);

    .add-edge-placeholder {
      opacity: 1;
      pointer-events: auto;
    }
  }

  &.edge-slot {
    opacity: 0.85;

    &.has-edge-chord {
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
  align-items: flex-start;
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
  transition: @transition-fast;
  cursor: pointer;
  position: relative;

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

    .remove-chord-btn {
      opacity: 1;
      pointer-events: auto;
    }
  }
}

.remove-chord-btn {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 0.95rem;
  height: 0.95rem;
  border-radius: 50%;
  background-color: var(--color-danger);
  color: #ffffff;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  opacity: 0;
  pointer-events: none;
  transition: @transition-fast;
  z-index: 5;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  outline: none;

  &:hover {
    transform: scale(1.05);
    background-color: color-mix(in srgb, var(--color-danger), black 15%);
  }

  &:active {
    transform: scale(0.95);
  }
}

.inline-chord-name {
  font-size: v-bind('`${0.7 * scoreEditor.fretboardScale}rem`');
  font-weight: 800;
  color: var(--text-title);
  line-height: 1;
  margin-bottom: 0.1rem;
  transition: font-size @duration-fast ease;
}

.char-text {
  display: inline-flex;
  align-items: center;
  justify-content: center;

  font-size: calc(0.9rem * var(--score-font-scale, 1));
  font-weight: 600;
  color: var(--text-title);
  line-height: 1.15rem;

  white-space: pre;
  min-height: calc(1.15rem * var(--score-font-scale, 1));

  padding: 0 0.08rem;
  border-radius: 0;
  transition:
    color @duration-fast ease,
    font-size @duration-fast ease,
    min-height @duration-fast ease,
    border-color @duration-fast ease;
  border-bottom: 1.5px solid transparent;
  box-sizing: border-box;
  margin-top: auto;

  .has-chord &:not(.is-space) {
    border-bottom: 1.5px dashed var(--text-disabled);
  }
}
</style>
