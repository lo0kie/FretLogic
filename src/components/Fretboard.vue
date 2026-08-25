<template>
  <div
    class="fretboard-layout-scaler"
    :class="{ 'has-border': bordered }"
    :style="{ width: `${realScaledWidth}px`, height: `${realScaledHeight}px` }"
  >
    <div
      ref="fretBoardRef"
      class="fretboard-container"
      :class="[interactive ? 'is-interactive' : 'is-disabled', { 'is-bordered': bordered }]"
      :tabindex="interactive ? 0 : undefined"
      :data-focusable-outline="interactive || undefined"
      :inert="!interactive || undefined"
      :style="{
        width: `${CANVAS_CONFIG.BOARD_WIDTH}px`,
        height: `${rawHeight}px`,
        transform: `scale(${fretboardScale})`,
        transformOrigin: 'top left',
        backgroundColor: bgColor,
      }"
      @contextmenu="handleRightClickRoot"
    >
      <div
        v-if="showChordName"
        class="chord-name-zone"
        :class="[canEditChordName ? 'is-editable' : 'is-readonly']"
        @pointerdown.stop
        @contextmenu.stop
      >
        <div
          v-if="canEditChordName"
          ref="chordNameInputRef"
          contenteditable="plaintext-only"
          spellcheck="false"
          role="textbox"
          aria-label="和弦名称"
          :data-placeholder="'CHORD'"
          class="chord-name-input"
          :style="chordNameFontSizeStyle"
          @focus="handleFocus"
          @blur="commitOrRevert"
          @input="handleInput"
          @keydown.enter.prevent="chordNameInputRef?.blur()"
          @keydown.esc.prevent="handleEscape"
          @keydown.stop
          @pointerdown.stop
        >
          {{ displayChordName }}
        </div>
        <div v-else class="chord-name-display-container" :style="chordNameFontSizeStyle">
          <ChordNameDisplay v-if="displayChordName" :chord="chord" size="inherit" />
          <span v-else class="chord-name-placeholder">CHORD</span>
        </div>
      </div>
      <div
        class="open-strings-wrapper"
        :class="{ 'is-inert': !interactive }"
        :style="{ height: `${activeTopOffset}px` }"
      >
        <svg
          v-if="showOpenStrings"
          :width="CANVAS_CONFIG.BOARD_WIDTH"
          :height="activeTopOffset"
          :viewBox="`0 0 ${CANVAS_CONFIG.BOARD_WIDTH} ${activeTopOffset}`"
          style="overflow: visible; width: 100%; height: 100%; display: block"
        >
          <FretboardNote
            v-for="(str, sIdx) in chord.strings"
            :key="'os-' + sIdx"
            v-tooltip="getOpenStringTooltip(sIdx)"
            :x="stringXPositions[sIdx] || 30 + sIdx * 64"
            :y="activeTopOffset / 2"
            is-open-string
            :is-root="isRoot(sIdx)"
            :is-dark-mode="isDarkMode"
            :interactive="interactive"
            :is-pressed="str[0] > 0"
            :is-muted="isMuted(str)"
            :is-hovered="hoverPoint?.fretIndex === 0 && hoverPoint?.stringIndex === sIdx"
            :is-focused="isFocused && focusPoint?.fretIndex === 0 && focusPoint?.stringIndex === sIdx"
            :label="openNoteInfo(sIdx).label"
            :is-accidental="openNoteInfo(sIdx).isAccidental"
            :prefer-flat="str[1]"
            :aria-label="openStringAriaLabels[sIdx]"
            @click="handleLocalToggleOpenString(sIdx)"
            @toggle-pitch="handleTogglePitchName(sIdx)"
          />
        </svg>
      </div>

      <FretboardSvg
        :is-dark-mode
        :interactive
        :string-x-positions
        :hover-point
        :focus-point="isFocused && !isPointerDown ? focusPoint : null"
        :fret-number-size
        :show-fret-numbers
        :strings="chord.strings"
        :fret-count="chord.fretCount"
        :capo="chord.capo"
        :root-string-index="chord.rootStringIndex"
        :active-base-strings="getActiveBaseStrings(chord.tuning)"
        @toggle-pitch="handleTogglePitchName"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import ChordNameDisplay from '@/components/ChordNameDisplay.vue';
import FretboardSvg from '@/components/FretboardSvg.vue';
import { useFretboardInteraction } from '@/composables/useFretboardInteraction';
import { vTooltip } from '@/directives/vTooltip.ts';
import { useUiStore } from '@/stores/uiStore';
import type { Chord, ChordNameSegments, GuitarStringsModel } from '@/types';
import { CANVAS_CONFIG, CHORD_NAME_FONT_SIZE_MAP, type ChordNameFontSize } from '@/utils/constants';
import {
  calcNoteLabel,
  computeStringLabelAccidental,
  getActiveBaseStrings,
  getChordName,
  isMuted,
  isValidChordName,
  nameToSegments,
  segmentsToString,
} from '@/utils/musicTheory';
import { computed, type CSSProperties, nextTick, ref, useTemplateRef, watch } from 'vue';
import FretboardNote from './FretboardNote.vue';

export interface FretboardProps {
  chord: Chord;
  isDarkMode?: boolean;
  interactive?: boolean;
  scale?: number;
  fretNumberSize?: 'sm' | 'md' | 'lg';
  showOpenStrings?: boolean;
  showFretNumbers?: boolean;
  bgColor?: string;
  bordered?: boolean;
  /** 是否自带和弦名显示 + input 切换编辑（仅编辑主场景开启，缩略图/谱面/选择器不受影响） */
  chordNameEditable?: boolean;
  /** 和弦名预设字号（sm/md/lg），默认 md */
  chordNameFontSize?: ChordNameFontSize;
  showChordName?: boolean;
}

const props = withDefaults(defineProps<FretboardProps>(), {
  isDarkMode: false,
  interactive: true,
  scale: 1.0,
  fretNumberSize: 'md',
  showOpenStrings: true,
  showFretNumbers: true,
  bgColor: 'transparent',
  showChordName: true,
  bordered: false,
  chordNameEditable: false,
  chordNameFontSize: 'md',
});

const emit = defineEmits<{
  (e: 'drag-status-change', isDragging: boolean): void;
  (e: 'update:strings', strings: GuitarStringsModel): void;
  (e: 'update:capo', capo: number): void;
  (e: 'update:root-string-index', index: number | null): void;
  (e: 'update:chord-name', name: string): void;
  (e: 'update:name-segments', segments: ChordNameSegments | null): void;
}>();

const uiStore = useUiStore();

/** 是否允许编辑和弦名：chordNameEditable 且 interactive */
const canEditChordName = computed(() => props.chordNameEditable && props.interactive);

const chordNameInputRef = useTemplateRef<HTMLDivElement>('chordNameInputRef');
const isInputFocused = ref(false);

const displayChordName = computed(() => getChordName(props.chord));
const inputChordName = ref(displayChordName.value);

// 当非聚焦状态下外部和弦数据变更（如选中和弦卡片/重置指板/撤销重做），自动同步 input 内容
watch(
  displayChordName,
  newName => {
    if (!isInputFocused.value) {
      inputChordName.value = newName;
      if (chordNameInputRef.value && chordNameInputRef.value.textContent !== newName) {
        chordNameInputRef.value.textContent = newName;
      }
    }
  },
  { immediate: true }
);

const handleFocus = () => {
  isInputFocused.value = true;
};

const handleInput = (e: Event) => {
  const text = (e.target as HTMLElement)?.textContent ?? '';
  inputChordName.value = text;
};

let isCancellingWithEsc = false;

/**
 * 失焦或提交时执行校验：
 * 1. 删空 -> 清空和弦名
 * 2. 合法名称 -> 派发生效
 * 3. 非法名称 -> Toast 警告并恢复修改前的有效名称
 */
const commitOrRevert = () => {
  if (isCancellingWithEsc) return;
  isInputFocused.value = false;
  const rawText = chordNameInputRef.value?.textContent ?? inputChordName.value;
  const trimmed = rawText.trim();
  const currentName = displayChordName.value.trim();

  // 1. 无修改
  if (trimmed === currentName) {
    inputChordName.value = currentName;
    if (chordNameInputRef.value && chordNameInputRef.value.textContent !== currentName) {
      chordNameInputRef.value.textContent = currentName;
    }
    return;
  }

  // 2. 删空
  if (!trimmed) {
    emit('update:chord-name', '');
    emit('update:name-segments', null);
    inputChordName.value = '';
    if (chordNameInputRef.value) chordNameInputRef.value.textContent = '';
    return;
  }

  // 3. 合法和弦名
  if (isValidChordName(trimmed)) {
    const segs = nameToSegments(trimmed);
    if (segs) {
      const formattedName = segmentsToString(segs);
      emit('update:chord-name', trimmed);
      emit('update:name-segments', segs);
      inputChordName.value = formattedName;
      if (chordNameInputRef.value && chordNameInputRef.value.textContent !== formattedName) {
        chordNameInputRef.value.textContent = formattedName;
      }
      return;
    }
  }

  // 4. 非法名称：警告并回退
  uiStore.toast.warning('和弦名称不合法');
  inputChordName.value = currentName;
  if (chordNameInputRef.value) chordNameInputRef.value.textContent = currentName;
};

const handleEscape = () => {
  const rawText = chordNameInputRef.value?.textContent ?? inputChordName.value;
  const isChanged = rawText.trim() !== displayChordName.value.trim();
  isCancellingWithEsc = true;
  inputChordName.value = displayChordName.value;
  if (chordNameInputRef.value) chordNameInputRef.value.textContent = displayChordName.value;
  isInputFocused.value = false;
  chordNameInputRef.value?.blur();
  if (isChanged) {
    uiStore.toast.info('已取消编辑');
  }
  nextTick(() => {
    isCancellingWithEsc = false;
  });
};

/** 和弦名字号：由预设键（sm/md/lg）取 px 值，若文字较长（>5 字符）自适应等比缩放，避免超出或换行 */
const chordNameFontSizeStyle = computed<CSSProperties>(() => {
  const basePx = CHORD_NAME_FONT_SIZE_MAP[props.chordNameFontSize];
  const nameLen = (canEditChordName.value ? inputChordName.value : displayChordName.value || '').length;
  const scale = nameLen > 5 ? Math.max(0.55, 5.5 / nameLen) : 1.0;
  const actualPx = Math.round(basePx * scale);
  return {
    fontSize: `${actualPx / 16}rem`,
  };
});

const {
  fretBoardRef,
  hoverPoint,
  focusPoint,
  isFocused,
  isPointerDown,
  stringXPositions,
  rawHeight,
  fretboardScale,
  realScaledWidth,
  realScaledHeight,
  activeTopOffset,
  handleRightClickRoot,
  handleLocalToggleOpenString,
  handleTogglePitchName,
} = useFretboardInteraction(
  props,
  capo => emit('update:capo', capo),
  strings => emit('update:strings', strings),
  index => emit('update:root-string-index', index),
  isDragging => emit('drag-status-change', isDragging)
);

const getOpenStringTooltip = (sIdx: number) => {
  const str = props.chord.strings[sIdx];
  if (!str || !props.interactive || str[0] > 0) return undefined;
  return {
    content: '左键：切换空弦/静音 \n 右键：设为根音（静音时先恢复为可用） \n 滚轮：切换升降号',
    placement: 'top' as const,
  };
};

/** 单点根音标记：某弦是否为主音（根音位置可能是按弦品位，也可能是空弦 0 品）。
 *  空弦圈只代表“空弦本身”：仅当该弦确为根音弦且按在空弦（0 品）时，空弦才算主音（黄环）；
 *  若根音弦被按到其他品位，主音落在指板按弦点，空弦走自己的状态（静音红/普通蓝），不随弦上的主音变化。
 *  数据层已保证 rootStringIndex 永不指向静音弦。 */
const isRoot = (sIdx: number) => props.chord.rootStringIndex === sIdx && (props.chord.strings[sIdx]?.[0] ?? -1) === 0;

const openStringAriaLabels = computed(() => {
  return props.chord.strings.map((str, sIdx) => {
    const stringNum = 6 - sIdx;
    if (str[0] > 0) {
      return `第 ${stringNum} 弦（已按第 ${str[0]} 品，点击清除按音）`;
    }
    if (isMuted(str)) {
      return `第 ${stringNum} 弦（静音，点击切换为空弦）`;
    }
    const noteName = calcNoteLabel(sIdx, 0, props.chord.capo, str[1], getActiveBaseStrings(props.chord.tuning));
    return `第 ${stringNum} 弦（空弦 ${noteName}，点击切换为静音）`;
  });
});

/** 空弦音名拆分：自然字母 + 是否为变化音级（供模板拆出独立小号升降号） */
const openNoteInfo = (sIdx: number): { label: string; isAccidental: boolean; preferFlat: boolean } => {
  const str = props.chord.strings[sIdx];
  if (!str) return { label: '', isAccidental: false, preferFlat: false };
  const { label, isAccidental } = computeStringLabelAccidental(
    sIdx,
    0,
    props.chord.capo,
    str[1],
    getActiveBaseStrings(props.chord.tuning)
  );
  return { label, isAccidental, preferFlat: str[1] };
};
</script>

<style scoped lang="scss">
.fretboard-layout-scaler {
  display: inline-block;
  transition:
    width $duration-slow $bezier-sidebar,
    height $duration-slow $bezier-sidebar;
}

.fretboard-container {
  --fretboard-focus-color: var(--color-primary);
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  user-select: none;
  box-sizing: border-box;
  transition:
    transform $duration-slow $bezier-sidebar,
    background-color $duration-fast ease,
    border-color $duration-fast ease;

  &.is-bordered {
    border: 1px solid var(--border-light);
    border-radius: $radius-md;
  }

  &.is-interactive {
    touch-action: none;
    cursor: default;
  }

  &.is-disabled {
    pointer-events: none !important;
    cursor: default;
    outline: none !important;
  }
}

.chord-name-zone {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  width: 100%;
  max-width: 100%;
  height: 88px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-sizing: border-box;
  user-select: none;
  overflow: visible;
  white-space: nowrap;
  padding: 0 $space-xs;
  cursor: default;

  &.is-editable {
    cursor: text;
  }
}

.chord-name-display-container {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 100%;
  height: 100%;
  min-height: 0;
  line-height: normal;
  font-weight: 700;
  color: var(--text-title);
  box-sizing: border-box;
  outline: none;
  cursor: inherit;
  white-space: nowrap;
  padding: 0 $space-2xs;

  &.is-interactive {
    cursor: text;
    border-radius: $radius-sm;
    transition: background-color $duration-fast ease;

    &:hover {
      background-color: var(--bg-hover);
    }
  }

  .chord-name-placeholder {
    color: var(--text-disabled);
    opacity: 0.35;
    font-weight: 700;
  }
}

.chord-name-input {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  width: 100%;
  max-width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-weight: 700;
  line-height: normal;
  background-color: transparent;
  border: none;
  outline: none;
  color: var(--text-title);
  caret-color: $primary;
  box-sizing: border-box;
  white-space: nowrap;
  overflow: visible;
  padding: 0 $space-2xs;
  cursor: text;
  user-select: text;

  &:empty::before {
    content: attr(data-placeholder);
    color: var(--text-disabled);
    opacity: 0.35;
    font-weight: 700;
    pointer-events: none;
  }
}

.open-strings-wrapper {
  width: 100%;
  position: relative;
  pointer-events: auto;
  box-sizing: border-box;

  &.is-inert {
    pointer-events: none;
  }
}
</style>
