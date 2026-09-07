<template>
  <div
    :style="{ width: `${realScaledWidth}px`, height: `${realScaledHeight}px` }"
    class="pointer-events-auto relative box-border transition-[width,height] duration-slow ease-sidebar"
  >
    <div
      :style="{
        width: `${boardWidth}px`,
        height: `${rawHeight}px`,
        transform: `scale(${fretboardScale})`,
        transformOrigin: 'top left',
        backgroundColor: 'transparent',
      }"
      @contextmenu="handleRightClickRoot($event)"
      data-focusable-outline
      class="relative box-border flex cursor-default touch-none flex-col items-center transition-[transform,height,background-color,border-color] duration-slow ease-sidebar outline-none select-none"
      ref="fretBoardRef"
      tabindex="0"
    >
      <div
        :style="{ height: `${CANVAS_CONFIG.CHORD_NAME_ZONE_HEIGHT}px`, paddingTop: '0px' }"
        @contextmenu.stop
        @pointerdown.stop
        class="box-border flex w-full max-w-full shrink-0 cursor-text items-center justify-center overflow-hidden px-sm font-[Helvetica_Neue,Arial,sans-serif] whitespace-nowrap select-none"
      >
        <!-- 和弦名行内编辑：底层 DOM/选区/占位符协议均由 BaseEditableText 承接 -->
        <BaseEditableText
          v-model="inputChordName"
          v-model:editing="isInputFocused"
          :maxlength="MAX_CHORD_NAME_LENGTH"
          :style="chordNameFontSizeStyle"
          @cancel="handleEscape()"
          @commit="commitOrRevert($event)"
          aria-label="和弦名称"
          class="no-scrollbar box-border flex size-full min-h-0 max-w-full cursor-text items-center justify-center-safe overflow-x-auto overflow-y-hidden px-0.5 text-center font-[Helvetica_Neue,Arial,sans-serif] leading-[1.15] font-bold whitespace-nowrap text-fg-title"
          placeholder="CHORD"
        />
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
        @toggle-barre="handleToggleBarre($event)"
        @toggle-pitch="handleTogglePitchName($event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import FretboardSvg from '@/domains/fretboard/components/FretboardSvg.vue';
import BaseEditableText from '@/platform/ui/input/BaseEditableText.vue';
import {
  getActiveBaseStrings,
  getChordName,
  isValidChordName,
  nameToSegments,
  segmentsToString,
} from '@/domains/chord/theory/theory';
import { useFretboardInteraction } from '@/domains/fretboard/composables/useFretboardInteraction';
import { isDark } from '@/platform/composables/useTheme';
import { useUiStore } from '@/platform/store/uiStore';

import { CANVAS_CONFIG, CHORD_NAME_FONT_SIZE } from '../constants';

import type { Chord, ChordNameSegments } from '@/domains/chord/types';
import type { BarreEntity, GuitarStringsModel } from '@/domains/fretboard/types';
import type { CSSProperties } from 'vue';

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

const isInputFocused = ref(false);

// 交互指板的和弦名始终显示全称，不跟随全局简写设置（编辑时以全称为基准提交）
const displayChordName = computed(() => getChordName(props.chord, { shorthand: false }));
// 有意取一次初始快照作为输入框初值，后续同步走下方 watch；对 AST 规则的误报行内豁免
// eslint-disable-next-line vue/no-ref-object-reactivity-loss
const inputChordName = ref(displayChordName.value);

// 当非聚焦状态下外部和弦数据变更（如选中和弦卡片/重置指板/撤销重做），自动同步 input 内容；
// DOM 回填由 BaseEditableText 依据 modelValue 在非编辑态自动完成
watch(
  displayChordName,
  newName => {
    if (!isInputFocused.value) {
      inputChordName.value = newName;
    }
  },
  { immediate: true }
);

const MAX_CHORD_NAME_LENGTH = 16;

/**
 * 提交（BaseEditableText 失焦/Enter 触发，入参为最终文本）时执行校验：
 * 1. 无修改 -> 保持原名称
 * 2. 删空 -> 清空和弦名
 * 3. 合法名称 -> 派发生效
 * 4. 非法名称 -> Toast 警告并恢复修改前的有效名称
 */
const commitOrRevert = (rawText: string) => {
  const trimmed = rawText.trim();
  const currentName = displayChordName.value.trim();

  // 1. 无修改
  if (trimmed === currentName) {
    inputChordName.value = currentName;
    return;
  }

  // 2. 删空
  if (!trimmed) {
    emit('update:chord-name', '');
    emit('update:name-segments', null);
    inputChordName.value = '';
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
      return;
    }
  }

  // 4. 非法名称：警告并回退（Esc 恢复由 BaseEditableText 在 cancel 时同步回 modelValue）
  uiStore.toast.warning('和弦名称不合法');
  inputChordName.value = currentName;
};

/** Esc 取消编辑：恢复修改前的有效名称（组件负责回填 DOM 并抑制随后的 commit） */
const handleEscape = () => {
  const isChanged = inputChordName.value.trim() !== displayChordName.value.trim();
  inputChordName.value = displayChordName.value;
  if (isChanged) {
    uiStore.toast.info('已取消编辑');
  }
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
