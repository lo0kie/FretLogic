<template>
  <div
    :style="{ width: `${realScaledWidth}px`, height: `${realScaledHeight}px` }"
    class="duration-slow ease-sidebar pointer-events-auto relative box-border transition-[width,height]"
  >
    <div
      :style="{
        width: `${boardWidth}px`,
        height: `${rawHeight}px`,
        transform: `scale(${fretboardScale})`,
        transformOrigin: 'top left',
        backgroundColor: 'transparent',
      }"
      @contextmenu="handleRightClickRoot"
      data-focusable-outline
      class="duration-slow ease-sidebar relative box-border flex cursor-default touch-none flex-col items-center transition-[transform,height,background-color,border-color] outline-none select-none"
      ref="fretBoardRef"
      tabindex="0"
    >
      <div
        :style="{ height: `${CANVAS_CONFIG.CHORD_NAME_ZONE_HEIGHT}px`, paddingTop: '0px' }"
        @contextmenu.stop
        @pointerdown.stop
        class="px-sm box-border flex w-full max-w-full shrink-0 cursor-text items-center justify-center overflow-hidden font-[Helvetica_Neue,Arial,sans-serif] whitespace-nowrap select-none"
      >
        <!-- v-wheel-scroll：和弦名超长被截断时可用滚轮横向平移查看全文；未溢出时指令自动放行 -->
        <div
          v-wheel-scroll.smooth
          :class="{
            'before:text-text-disabled before:pointer-events-none before:font-bold before:opacity-35 before:content-[attr(data-placeholder)]':
              !inputChordName.trim(),
          }"
          :data-placeholder="'CHORD'"
          :style="chordNameFontSizeStyle"
          @keydown.stop
          @pointerdown.stop
          @blur="commitOrRevert"
          @focus="handleFocus"
          @input="handleInput"
          @keydown.enter.prevent="chordNameInputRef?.blur()"
          @keydown.esc.prevent="handleEscape"
          aria-label="和弦名称"
          class="text-text-title caret-primary empty:before:text-text-disabled no-scrollbar box-border flex h-full min-h-0 w-full max-w-full cursor-text items-center justify-center-safe overflow-x-auto overflow-y-hidden border-none bg-transparent px-0.5 text-center font-[Helvetica_Neue,Arial,sans-serif] leading-[1.15] font-bold whitespace-nowrap outline-none select-text empty:before:pointer-events-none empty:before:font-bold empty:before:opacity-35 empty:before:content-[attr(data-placeholder)]"
          contenteditable="plaintext-only"
          ref="chordNameInputRef"
          role="textbox"
          spellcheck="false"
        >
          {{ displayChordName }}
        </div>
      </div>

      <FretboardSvg
        :board-width
        :hover-point
        :string-x-positions
        :active-base-strings="getActiveBaseStrings(chord.tuning)"
        :barres="effectiveBarres"
        :focus-point="isFocused ? focusPoint : null"
        :fret-count="chord.fretCount"
        :fret-offset="chord.fretOffset"
        :is-dark-mode="isDark"
        :root-string-index="chord.rootStringIndex"
        :strings="chord.strings"
        @toggle-barre="handleToggleBarre"
        @toggle-pitch="handleTogglePitchName"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch, type CSSProperties } from 'vue';

import {
  getActiveBaseStrings,
  getChordName,
  isValidChordName,
  nameToSegments,
  segmentsToString,
} from '@/domains/chord/theory/theory';
import type { Chord, ChordNameSegments } from '@/domains/chord/types';
import FretboardSvg from '@/domains/fretboard/components/FretboardSvg.vue';
import { useFretboardInteraction } from '@/domains/fretboard/composables/useFretboardInteraction';
import type { BarreEntity, GuitarStringsModel } from '@/domains/fretboard/types';
import { isDark } from '@/platform/composables/useTheme';
import { useUiStore } from '@/platform/store/uiStore';

import { CANVAS_CONFIG, CHORD_NAME_FONT_SIZE } from '../constants';

export interface FretboardProps {
  chord: Chord;
}

const props = defineProps<FretboardProps>();

const emit = defineEmits<{
  (e: 'update:strings', strings: GuitarStringsModel): void;
  (e: 'update:fret-offset', fretOffset: number): void;
  (e: 'update:root-string-index', index: number | null): void;
  (e: 'update:chord-name', name: string): void;
  (e: 'update:name-segments', segments: ChordNameSegments | null): void;
  (e: 'update:barres', barres: BarreEntity[] | undefined): void;
}>();

const uiStore = useUiStore();

/** 生效横按：仅采用显式手动标记（不做自动推导） */
const effectiveBarres = computed<BarreEntity[]>(() => props.chord.barres ?? []);

/** 点击横按梁切换标记状态：已标记则移除，未标记则添加并派发更新 */
const handleToggleBarre = (barre: BarreEntity) => {
  const current = props.chord.barres ?? [];
  const existsIndex = current.findIndex(
    b => b.fret === barre.fret && b.fromString === barre.fromString && b.toString === barre.toString
  );
  let next: BarreEntity[] | undefined;
  if (existsIndex >= 0) {
    const filtered = current.filter((_, idx) => idx !== existsIndex);
    next = filtered.length > 0 ? filtered : undefined;
  } else {
    next = [...current, { fret: barre.fret, fromString: barre.fromString, toString: barre.toString }];
  }
  emit('update:barres', next);
};

const chordNameInputRef = useTemplateRef<HTMLDivElement>('chordNameInputRef');
const isInputFocused = ref(false);

// 交互指板的和弦名始终显示全称，不跟随全局简写设置（编辑时以全称为基准提交）
const displayChordName = computed(() => getChordName(props.chord, { shorthand: false }));
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
  // 失焦时收起输入框内的文字选区：contenteditable 嵌套在可聚焦父容器 fretBoardRef 内，
  // 点击指板其它位置时焦点转移到父级 div，浏览器不会自动收起子级选区，导致选中高亮残留
  const selection = window.getSelection();
  if (
    selection &&
    chordNameInputRef.value &&
    selection.anchorNode &&
    chordNameInputRef.value.contains(selection.anchorNode)
  ) {
    selection.removeAllRanges();
  }
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

/**
 * 和弦名字号样式：取全局固定字号，不随名称长度缩放；超长由容器 overflow-hidden 截断。
 * 必须用 px 而非 rem：根字号为 22.25px，用 rem 会把字号放大到约 1.39 倍，
 * 逼近 80px 的容器高度，导致 j / g 等带下伸部的字母被容器裁掉底部（砍脚）
 */
const chordNameFontSizeStyle: CSSProperties = { fontSize: `${CHORD_NAME_FONT_SIZE}px` };

const {
  fretBoardRef,
  hoverPoint,
  focusPoint,
  isFocused,
  boardWidth,
  stringXPositions,
  rawHeight,
  fretboardScale,
  realScaledWidth,
  realScaledHeight,
  handleRightClickRoot,
  handleTogglePitchName,
} = useFretboardInteraction(
  props,
  fretOffset => {
    emit('update:fret-offset', fretOffset);
  },
  strings => emit('update:strings', strings),
  index => emit('update:root-string-index', index)
);
</script>
