<template>
  <div
    :class="{ 'border-border-light rounded-md border': bordered }"
    :style="{ width: `${realScaledWidth}px`, height: `${realScaledHeight}px` }"
    class="duration-slow ease-sidebar pointer-events-auto relative box-border transition-[width,height]"
  >
    <div
      :class="[
        interactive || barrePickMode ? 'cursor-default touch-none' : 'pointer-events-none cursor-default outline-none',
        { 'border-border-light rounded-md border': bordered },
      ]"
      :data-focusable-outline="interactive || undefined"
      :inert="!(interactive || barrePickMode) || undefined"
      :style="{
        width: `${CANVAS_CONFIG.BOARD_WIDTH}px`,
        height: `${rawHeight}px`,
        transform: `scale(${fretboardScale})`,
        transformOrigin: 'top left',
        backgroundColor: bgColor,
      }"
      :tabindex="interactive ? 0 : undefined"
      @contextmenu="handleRightClickRoot"
      class="duration-slow ease-sidebar relative box-border flex flex-col items-center transition-[transform,background-color,border-color] outline-none select-none"
      ref="fretBoardRef"
    >
      <div
        v-if="showChordName"
        :class="[canEditChordName ? 'cursor-text' : '']"
        :style="{ height: `${CANVAS_CONFIG.CHORD_NAME_ZONE_HEIGHT}px`, paddingTop: isShowPitchNames ? '0px' : '16px' }"
        @contextmenu.stop
        @pointerdown.stop
        class="px-sm box-border flex w-full max-w-full shrink-0 cursor-default items-center justify-center overflow-hidden font-[Helvetica_Neue,Arial,sans-serif] whitespace-nowrap select-none"
      >
        <div
          v-if="canEditChordName"
          :class="{
            'before:text-text-disabled before:pointer-events-none before:font-bold before:opacity-35 before:content-[attr(data-placeholder)]':
              !inputChordName.trim(),
          }"
          :data-placeholder="'CHORD'"
          :style="chordNameFontSizeStyle"
          @blur="commitOrRevert"
          @focus="handleFocus"
          @input="handleInput"
          @keydown.enter.prevent="chordNameInputRef?.blur()"
          @keydown.esc.prevent="handleEscape"
          @keydown.stop
          @pointerdown.stop
          aria-label="和弦名称"
          class="text-text-title caret-primary empty:before:text-text-disabled box-border flex h-full min-h-0 w-full max-w-full cursor-text items-center justify-center overflow-hidden border-none bg-transparent px-0.5 text-center font-[Helvetica_Neue,Arial,sans-serif] leading-normal font-bold whitespace-nowrap outline-none select-text empty:before:pointer-events-none empty:before:font-bold empty:before:opacity-35 empty:before:content-[attr(data-placeholder)]"
          contenteditable="plaintext-only"
          ref="chordNameInputRef"
          role="textbox"
          spellcheck="false"
        >
          {{ displayChordName }}
        </div>
        <div
          v-else
          :style="chordNameFontSizeStyle"
          class="text-text-title cursor-inherit box-border flex h-full min-h-0 w-full max-w-full items-center justify-center overflow-hidden px-0.5 font-[Helvetica_Neue,Arial,sans-serif] leading-normal font-bold text-ellipsis whitespace-nowrap outline-none"
        >
          <span v-chord-name="{ chord, shorthand: isUseShorthand }" v-if="displayChordName" />
          <span v-else class="text-text-disabled font-bold opacity-35">CHORD</span>
        </div>
      </div>
      <div
        :class="{ 'pointer-events-none': !interactive }"
        :style="{ height: `${activeTopOffset}px` }"
        class="pointer-events-auto relative box-border w-full"
      >
        <svg
          v-if="showOpenStrings"
          :height="activeTopOffset"
          :viewBox="`0 0 ${CANVAS_CONFIG.BOARD_WIDTH} ${activeTopOffset}`"
          :width="CANVAS_CONFIG.BOARD_WIDTH"
          style="overflow: visible; width: 100%; height: 100%"
        >
          <FretboardNote
            v-for="(str, sIdx) in chord.strings"
            v-tooltip="getOpenStringTooltip(sIdx)"
            :aria-label="openStringAriaLabels[sIdx]"
            :interactive
            :is-accidental="isShowPitchNames && openNoteInfo(sIdx).isAccidental"
            :is-dark-mode
            :is-focused="isFocused && focusPoint?.fretIndex === 0 && focusPoint?.stringIndex === sIdx"
            :is-hovered="hoverPoint?.fretIndex === 0 && hoverPoint?.stringIndex === sIdx"
            :is-muted="isMuted(str)"
            :is-pressed="str[0] > 0"
            :is-root="isRoot(sIdx)"
            :key="'os-' + sIdx"
            :label="isShowPitchNames ? openNoteInfo(sIdx).label : ''"
            :prefer-flat="str[1]"
            :show-pitch-names="isShowPitchNames"
            :x="stringXPositions[sIdx] || 30 + sIdx * 64"
            :y="openStringMarkerY"
            @toggle-pitch="handleTogglePitchName(sIdx)"
            is-open-string
          />
        </svg>
      </div>

      <FretboardSvg
        :active-base-strings="getActiveBaseStrings(chord.tuning)"
        :barre-candidates
        :barre-pick-mode
        :barres="effectiveBarres"
        :capo="chord.capo"
        :focus-point="isFocused ? focusPoint : null"
        :fret-count="chord.fretCount"
        :fret-number-size
        :hover-point
        :interactive
        :is-dark-mode
        :root-string-index="chord.rootStringIndex"
        :show-fret-numbers
        :show-pitch-names="isShowPitchNames"
        :string-x-positions
        :strings="chord.strings"
        :wide-nut="isWideNut"
        @barre-click="emit('barre-click', $event)"
        @toggle-pitch="handleTogglePitchName"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, getCurrentInstance, nextTick, ref, useTemplateRef, watch, type CSSProperties } from 'vue';
import { useRoute } from 'vue-router';

import FretboardSvg from '@/components/fretboard/FretboardSvg.vue';
import { vTooltip } from '@/directives/vTooltip.ts';
import {
  calcNoteLabel,
  computeStringLabelAccidental,
  getActiveBaseStrings,
  getChordName,
  isMuted,
  isValidChordName,
  nameToSegments,
  segmentsToString,
} from '@/services/music/theory';
import { useFretboardInteraction } from '@/shared/composables/useFretboardInteraction';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';
import type { BarreEntity, Chord, ChordNameSegments, GuitarStringsModel } from '@/types';
import {
  CANVAS_CONFIG,
  CHORD_NAME_FONT_SIZE_MAP,
  OPEN_STRING_MARKER_Y,
  type ChordNameFontSize,
} from '@/utils/core/constants';

import FretboardNote from './FretboardNote.vue';

export interface FretboardProps {
  chord: Chord;
  isDarkMode?: boolean;
  interactive?: boolean;
  scale?: number;
  fretNumberSize?: 'sm' | 'md' | 'lg';
  showOpenStrings?: boolean;
  showFretNumbers?: boolean;
  showPitchNames?: boolean;
  isScoreMode?: boolean;
  bgColor?: string;
  bordered?: boolean;
  /** 是否自带和弦名显示 + input 切换编辑（仅编辑主场景开启，缩略图/谱面/选择器不受影响） */
  chordNameEditable?: boolean;
  /** 和弦名预设字号（sm/md/lg），默认 md */
  chordNameFontSize?: ChordNameFontSize;
  showChordName?: boolean;
  /** 零品品丝是否加宽（粗琴枕效果），默认 false */
  wideNut?: boolean;
  /** 横按拾取模式：候选横按梁可点击派发 barre-click（音符保持不可编辑） */
  barrePickMode?: boolean;
  /** 可点击的候选横按列表（barrePickMode 时展示） */
  barreCandidates?: BarreEntity[];
}

const props = withDefaults(defineProps<FretboardProps>(), {
  isDarkMode: false,
  interactive: true,
  scale: 1.0,
  fretNumberSize: 'md',
  showOpenStrings: true,
  showFretNumbers: true,
  showPitchNames: undefined,
  isScoreMode: undefined,
  bgColor: 'transparent',
  showChordName: true,
  bordered: false,
  chordNameEditable: false,
  chordNameFontSize: 'md',
  wideNut: true,
  barrePickMode: false,
  barreCandidates: () => [],
});

const emit = defineEmits<{
  (e: 'update:strings', strings: GuitarStringsModel): void;
  (e: 'update:capo', capo: number): void;
  (e: 'update:root-string-index', index: number | null): void;
  (e: 'update:chord-name', name: string): void;
  (e: 'update:name-segments', segments: ChordNameSegments | null): void;
  (e: 'barre-click', barre: BarreEntity): void;
}>();

let routeInstance: ReturnType<typeof useRoute> | null = null;
try {
  const instance = getCurrentInstance();
  if (instance?.appContext.config.globalProperties.$route) {
    routeInstance = useRoute();
  }
} catch {
  routeInstance = null;
}

const isScoreMode = computed(() => {
  if (props.isScoreMode !== undefined) return props.isScoreMode;
  return routeInstance?.path === '/score';
});

const uiStore = useUiStore();
const settingsStore = useSettingsStore();

const isShowPitchNames = computed(() => {
  if (props.showPitchNames !== undefined) return props.showPitchNames;
  return isScoreMode.value ? settingsStore.scoreShowPitchNames : settingsStore.workbenchShowPitchNames;
});

const isWideNut = computed(() => Boolean(props.wideNut));

/** 生效横按：仅采用显式手动标记（不做自动推导） */
const effectiveBarres = computed<BarreEntity[]>(() => props.chord.barres ?? []);

const openStringMarkerY = computed(() => (isShowPitchNames.value ? OPEN_STRING_MARKER_Y : 42));

const isUseShorthand = computed(() => {
  return isScoreMode.value ? settingsStore.scoreChordShorthand : settingsStore.workbenchChordShorthand;
});

/** 是否允许编辑和弦名：chordNameEditable 且 interactive */
const canEditChordName = computed(() => props.chordNameEditable && props.interactive);

const chordNameInputRef = useTemplateRef<HTMLDivElement>('chordNameInputRef');
const isInputFocused = ref(false);

const displayChordName = computed(() => getChordName(props.chord, { shorthand: isUseShorthand.value }));
const inputChordName = ref(displayChordName.value);

// 当非聚焦状态下外部和弦数据变更（如选中和弦卡片/重置指板/撤销重做），自动同步 input 内容
watch(
  displayChordName,
  newName => {
    if (!isInputFocused.value) {
      inputChordName.value = newName;
      if (chordNameInputRef.value) {
        if (!newName) {
          chordNameInputRef.value.innerHTML = '';
        } else if (chordNameInputRef.value.textContent !== newName) {
          chordNameInputRef.value.textContent = newName;
        }
      }
    }
  },
  { immediate: true }
);

const MAX_CHORD_NAME_LENGTH = 16;

/** 和弦名输入聚焦：标记编辑态，暂停外部数据对输入内容的同步覆盖 */
const handleFocus = () => {
  isInputFocused.value = true;
};

/** 和弦名输入：截断超长文本并把光标维持到末尾，同步到内部状态 */
const handleInput = (e: Event) => {
  const el = e.target as HTMLElement;
  let text = el?.textContent ?? '';
  if (text.length > MAX_CHORD_NAME_LENGTH) {
    text = text.slice(0, MAX_CHORD_NAME_LENGTH);
    if (el) el.textContent = text;
    const selection = window.getSelection();
    if (selection && el) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }
  inputChordName.value = text;
  if (!text.trim() && el && el.innerHTML !== '') {
    el.innerHTML = '';
  }
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
    if (chordNameInputRef.value) {
      if (!currentName) {
        chordNameInputRef.value.innerHTML = '';
      } else if (chordNameInputRef.value.textContent !== currentName) {
        chordNameInputRef.value.textContent = currentName;
      }
    }
    return;
  }

  // 2. 删空
  if (!trimmed) {
    emit('update:chord-name', '');
    emit('update:name-segments', null);
    inputChordName.value = '';
    if (chordNameInputRef.value) chordNameInputRef.value.innerHTML = '';
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
  if (chordNameInputRef.value) {
    if (!currentName) {
      chordNameInputRef.value.innerHTML = '';
    } else {
      chordNameInputRef.value.textContent = currentName;
    }
  }
};

/** Esc 取消编辑：恢复修改前的有效名称并失焦（不触发校验） */
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

/** 和弦名字号：展示模式（非交互）下提升一档更醒目；可编辑输入模式下对长名称自适应缩放 */
const chordNameFontSizeStyle = computed<CSSProperties>(() => {
  // 展示模式字号提升一档：sm→md、md/lg→lg
  const sizeKey: ChordNameFontSize = props.interactive
    ? props.chordNameFontSize
    : props.chordNameFontSize === 'sm'
      ? 'md'
      : 'lg';
  const basePx = CHORD_NAME_FONT_SIZE_MAP[sizeKey];
  if (!canEditChordName.value) {
    return {
      fontSize: `${basePx / 16}rem`,
    };
  }
  const nameLen = inputChordName.value.length;
  const scale = nameLen > 4 ? Math.max(0.48, 4.8 / nameLen) : 1.0;
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
  stringXPositions,
  rawHeight,
  fretboardScale,
  realScaledWidth,
  realScaledHeight,
  activeTopOffset,
  handleRightClickRoot,
  handleTogglePitchName,
} = useFretboardInteraction(
  props,
  capo => emit('update:capo', capo),
  strings => emit('update:strings', strings),
  index => emit('update:root-string-index', index)
);

/** 空弦悬停提示：仅可交互且未被按品时展示操作说明 */
const getOpenStringTooltip = (sIdx: number) => {
  const str = props.chord.strings[sIdx];
  if (!str || !props.interactive || str[0] > 0) return undefined;
  return {
    content: '左键：切换空弦 \n 右键：设为根音 \n 滚轮：切换升降号',
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
