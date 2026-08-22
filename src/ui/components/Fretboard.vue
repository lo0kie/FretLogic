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
      :tabindex="interactive ? 0 : -1"
      :data-focusable-outline="interactive || undefined"
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
      >
        <input
          v-model="chordNameValue"
          type="text"
          spellcheck="false"
          maxlength="15"
          placeholder="CHORD"
          class="chord-name-input"
          :readonly="!canEditChordName"
          :style="chordNameFontSizeStyle"
          @pointerdown.stop
        />
      </div>
      <div class="open-strings-wrapper" :style="{ height: `${activeTopOffset}px` }">
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
            v-tooltip="openStringTooltips[sIdx]"
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
        :focus-point
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
import FretboardSvg from '@/ui/components/FretboardSvg.vue';
import { CANVAS_CONFIG, CHORD_NAME_FONT_SIZE_MAP, type ChordNameFontSize } from '@/constants';
import { useFretboardInteraction } from '@/ui/composables/useFretboardInteraction';
import type { Chord, GuitarStringsModel } from '@/types';
import { calcNoteLabel, computeStringLabelAccidental, getActiveBaseStrings, isMuted } from '@/utils/musicTheory';
import { computed, type CSSProperties } from 'vue';
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
}>();

/** 是否允许编辑和弦名：chordNameEditable 且 interactive */
const canEditChordName = computed(() => props.chordNameEditable && props.interactive);

/** 直通 v-model：可编辑时写入 emit，不可编辑时只读显示 */
const chordNameValue = computed<string>({
  get: () => props.chord.chordName,
  set: val => {
    if (canEditChordName.value) emit('update:chord-name', val);
  },
});

/** 和弦名字号：由预设键（sm/md/lg）取 px 值，换算为 rem 内联应用 */
const chordNameFontSizeStyle = computed<CSSProperties>(() => ({
  fontSize: `${CHORD_NAME_FONT_SIZE_MAP[props.chordNameFontSize] / 16}rem`,
}));

const {
  fretBoardRef,
  hoverPoint,
  focusPoint,
  isFocused,
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

// 将 tooltip 也改为计算属性缓存
const openStringTooltips = computed(() => {
  return props.chord.strings.map(str => {
    return props.interactive && str[0] <= 0
      ? {
          content: '左键：切换空弦/静音 \n 右键：设为根音 \n 滚轮：切换升降号',
          placement: 'top',
        }
      : undefined;
  });
});

/** 单点根音标记：某弦是否为主音。
 *  数据层已保证 rootStringIndex 永不指向禁用的弦（静音某弦时编辑器与交互层会自动清空 root），
 *  因此此处只做相等判断即可，不必再在渲染层做 str[0]>=0 的“遮蔽”——那只会掩盖数据不一致。 */
const isRoot = (sIdx: number) => props.chord.rootStringIndex === sIdx;

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

<style scoped lang="less">
@import '@/assets/tokens.module';

.fretboard-layout-scaler {
  display: inline-block;
  transition:
    width @duration-slow @bezier-sidebar,
    height @duration-slow @bezier-sidebar;
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
    transform @duration-slow @bezier-sidebar,
    background-color @duration-fast ease,
    border-color @duration-fast ease;

  &.is-bordered {
    border: 1px solid var(--border-light);
    border-radius: @radius-md;
  }

  &.is-interactive {
    touch-action: none;
    cursor: pointer;
  }

  &.is-disabled {
    pointer-events: none !important;
    cursor: default;
    outline: none !important;
  }
}

.chord-name-zone {
  width: 100%;
  height: 88px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-sizing: border-box;
  user-select: none;
  cursor: default;

  &.is-editable {
    cursor: text;
  }
}

.chord-name-input {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  width: 100%;
  height: 100%;
  text-align: center;
  font-weight: 700;
  font-size: @fs-display;
  line-height: 1;
  letter-spacing: -0.03em;
  background-color: transparent;
  border: none;
  outline: none;
  color: var(--text-title);
  caret-color: @primary;
  box-sizing: border-box;

  &::placeholder {
    color: var(--text-disabled);
    opacity: 0.35;
    font-weight: 700;
  }

  /* 非编辑态：readonly 但保持与显示态完全一致的视觉；pointer-events none 让点击落到 zone 触发编辑 */
  &:read-only {
    opacity: 1;
    cursor: inherit;
    background-color: transparent;
    pointer-events: none;
  }
}

.open-strings-wrapper {
  width: 100%;
  position: relative;
  pointer-events: none;
  box-sizing: border-box;

  svg {
    pointer-events: auto;
  }
}
</style>
