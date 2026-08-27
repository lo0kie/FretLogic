<template>
  <div
    ref="charBoxRef"
    v-wave="{ disabled: !isGlobalEditable }"
    class="char-box group flex flex-col items-center justify-start p-0.5 self-stretch rounded-sm box-border relative cursor-pointer outline-none transition-all duration-fast [touch-action:pan-x_pan-y] [&.is-drop-target]:!bg-tint-primary-85 [&.is-drop-target]:!shadow-[inset_0_0_0_2px_var(--color-primary)] [&.is-dragging-source]:!opacity-35"
    :data-slot-key="slotKey"
    :class="[
      isGlobalEditable
        ? 'hover:bg-tint-primary-88'
        : 'cursor-default [&_.inline-fretboard-card]:pointer-events-none [&_.chord-display-slot]:pointer-events-none [&_.char-text]:pointer-events-none',
      {
        'opacity-85': variant !== 'char' && !(variant === 'edge' && chord) && variant !== 'add',
        'opacity-100 justify-start after:content-[\'\'] after:block after:w-full after:h-[1.15rem] after:shrink-0':
          variant === 'edge' && Boolean(chord),
        'opacity-100 px-[0.4rem] justify-center hover:!bg-transparent': variant === 'add',
        '!hidden': variant === 'add' && !isGlobalEditable,
        'ml-[0.42rem]': leftChordGap,
      },
    ]"
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
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <div
      class="chord-display-slot flex-1 flex justify-center w-full"
      :class="variant === 'edge' && chord ? 'items-start' : variant === 'add' ? 'items-center' : 'items-start'"
    >
      <div
        v-if="chord"
        v-wave="{ disabled: !isGlobalEditable }"
        class="inline-fretboard-card flex flex-col items-center p-xs rounded-sm bg-transparent relative select-none transition-all duration-fast"
        :class="{ 'cursor-pointer [touch-action:none]': isGlobalEditable }"
        :title="isGlobalEditable ? '点击更换和弦，按住可拖拽换位' : undefined"
        @pointerdown.stop="isGlobalEditable && emit('pointerdown', $event, slotKey, chord)"
      >
        <button
          v-if="isVisible && !isExporting && isGlobalEditable"
          v-wave
          type="button"
          :tabindex="isButtonRevealed ? 0 : -1"
          class="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-danger text-text-on-accent border-none flex items-center justify-center p-0 cursor-pointer pointer-events-none group-hover:pointer-events-auto group-hover:!opacity-100 z-card shadow-sm outline-none opacity-0 transition-all duration-fast hover:scale-105 active:scale-95"
          title="清除当前和弦"
          aria-label="清除当前和弦"
          data-focusable-inline
          @pointerdown.stop
          @click.stop.prevent="emit('remove', slotKey)"
        >
          <X :size="12" :stroke-width="3" aria-hidden="true" />
        </button>
        <Fretboard
          v-if="isVisible"
          :ref="setFretboardMeasureRef"
          :chord-name-editable="false"
          :chord
          :interactive="false"
          :is-score-mode="true"
          :scale="0.25 * scoreEditor.effectiveFretboardScale"
          :is-dark-mode="globalDarkMode"
          fret-number-size="lg"
        />
        <div v-else :style="chord ? getCalculatedOrCachedSize(chord.fretCount) : undefined" />
      </div>
      <span
        v-else-if="variant === 'add' && isGlobalEditable"
        v-wave
        class="inline-flex items-center justify-center h-5 text-2xs font-bold text-primary opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-[.is-drop-target]:!opacity-100 group-[.is-drop-target]:!pointer-events-auto border border-dashed border-primary bg-tint-primary-92 px-sm rounded-sm whitespace-nowrap cursor-pointer box-border transition-all duration-fast hover:bg-tint-primary-80"
        :class="{ '!opacity-100 !pointer-events-auto': lineHovered }"
        :title="addPlaceholderTitle"
        role="button"
        tabindex="-1"
      >
        <Plus :size="18" :stroke-width="3" />
      </span>
    </div>
    <template v-if="variant === 'char'">
      <span
        class="char-text inline-flex items-center justify-center font-semibold text-text-title px-0.5 box-border mt-auto transition-all duration-fast text-[calc(0.875rem*var(--score-font-scale,1))] leading-[1.15rem] min-h-[calc(1.15rem*var(--score-font-scale,1))] whitespace-pre group-hover:text-primary"
        :class="[
          char === ' '
            ? ''
            : chord
              ? 'underline decoration-dashed decoration-text-disabled/80 underline-offset-[3px]'
              : '',
        ]"
      >
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
import Fretboard from '@/components/fretboard/Fretboard.vue';
import { globalDarkMode, isGlobalEditable } from '@/stores/globalState';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import type { Chord } from '@/types';
import { observeVisibility } from '@/utils/core/common';
import { getPlaceholderSize } from '@/utils/music/chord-fretboard';
import { getChordName } from '@/utils/music/musicTheory';
import { Plus, X } from '@lucide/vue';
import { computed, ref, useTemplateRef, watch, watchEffect, type ComponentPublicInstance } from 'vue';

const props = defineProps<{
  slotKey: string;
  chord?: Chord;
  char?: string;
  variant: 'char' | 'edge' | 'add';
  addPlaceholderTitle?: string;
  isDropTarget?: boolean;
  isDraggingSource?: boolean;
  isExporting: boolean;
  scrollRoot?: HTMLElement | null;
  leftChordGap?: boolean;
  lineHovered?: boolean;
}>();

const emit = defineEmits<{
  (e: 'click'): void;
  (e: 'remove', slotKey: string): void;
  (e: 'pointerdown', event: PointerEvent, slotKey: string, chord: Chord): void;
}>();

const isVisible = ref(false);
const isHovered = ref(false);
// 清除按钮仅在父容器 hover 时显示；隐藏时不进入 Tab 焦点序列，避免抢占键盘导航
const isButtonRevealed = computed(() => isHovered.value && isGlobalEditable);
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

const setFretboardMeasureRef = (el: Element | ComponentPublicInstance | null) => {
  if (!el || !props.chord) return;
  const cacheKey = getCacheKey(props.chord.fretCount);
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
  else return getPlaceholderSize(fretCount, getEffectiveScale(), true, true);
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
      isVisible.value = true;
      unwatchExport?.();
    }
  },
  { immediate: true }
);
</script>
