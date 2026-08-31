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
        // 聚焦时和弦自身保持外边框（焦点会落到组内按钮，故用 isFocused 状态而非 :focus）
        '!shadow-[0_0_0_2px_var(--bg-panel),0_0_0_4px_var(--color-primary)]': isFocused,
      },
    ]"
    :role="isGlobalEditable ? 'button' : undefined"
    :tabindex="isGlobalEditable ? 0 : -1"
    :aria-label="ariaLabelText"
    :title="slotTitle"
    :data-focusable-inline="isGlobalEditable || undefined"
    @click="handleClick"
    @keydown.enter="handleKeydown"
    @keydown.space="handleKeydown"
    @keydown.delete="handleDelete"
    @keydown.backspace="handleDelete"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    @focusin="handleFocusIn"
    @focusout="handleFocusOut"
  >
    <div
      class="chord-display-slot flex-1 flex justify-center w-full"
      :class="variant === 'edge' && chord ? 'items-start' : variant === 'add' ? 'items-center' : 'items-start'"
    >
      <div
        v-if="chord"
        class="inline-fretboard-card flex flex-col items-center p-xs rounded-sm bg-transparent relative select-none transition-all duration-fast"
      >
        <div
          v-if="isVisible && isGlobalEditable && !isExporting"
          class="absolute inset-0 rounded-sm bg-black/30 pointer-events-none transition-all duration-fast z-[2]"
          :class="isActive ? 'opacity-100' : 'opacity-0'"
        >
          <div
            v-if="isVisible && !isExporting && isGlobalEditable"
            ref="actionGroupEl"
            class="absolute inset-0 z-card transition-all duration-fast flex flex-col items-stretch justify-center gap-1.5 p-2"
            :class="isActive ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'"
            @keydown="handleActionKeydown"
          >
            <ActionButton
              ref="editButtonEl"
              v-wave
              color="primary"
              variant="subtle"
              size="sm"
              block
              :tabindex="-1"
              :aria-label="editButtonTitle"
              :title="editButtonTitle"
              class="!pointer-events-auto"
              @pointerdown.stop
              @click.stop.prevent="emit('click')"
            >
              <Pencil :size="16" :stroke-width="2.5" class="shrink-0" />
              <span class="font-bold">{{ editButtonLabel }}</span>
            </ActionButton>
            <ActionButton
              ref="copyButtonEl"
              v-wave
              color="success"
              variant="subtle"
              size="sm"
              block
              :tabindex="-1"
              :aria-label="moveButtonTitle"
              :title="moveButtonTitle"
              class="!pointer-events-auto cursor-grab active:cursor-grabbing"
              @pointerdown.stop.prevent="emit('copyPointerdown', $event, slotKey, chord)"
              @mouseup.stop.prevent
              @click.stop.prevent
            >
              <GripVertical :size="16" :stroke-width="2.5" class="shrink-0" />
              <span class="font-bold">{{ moveButtonLabel }}</span>
            </ActionButton>
            <ActionButton
              ref="removeButtonEl"
              v-wave
              color="danger"
              variant="subtle"
              size="sm"
              block
              :tabindex="-1"
              :aria-label="removeButtonTitle"
              :title="removeButtonTitle"
              class="!pointer-events-auto"
              @pointerdown.stop
              @click.stop.prevent="emit('remove', slotKey)"
            >
              <X :size="16" :stroke-width="2.5" class="shrink-0" />
              <span class="font-bold">{{ removeButtonLabel }}</span>
            </ActionButton>
          </div>
        </div>
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

      <ActionButton
        v-else-if="variant === 'add' && isGlobalEditable"
        ref="addButtonEl"
        icon-only
        variant="subtle"
        :tabindex="-1"
        :aria-label="addPlaceholderTitle"
        :title="addPlaceholderTitle"
        :class="isActive || lineHovered ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'"
      >
        <Plus :size="18" :stroke-width="3" class="text-primary" />
      </ActionButton>
    </div>
    <template v-if="variant === 'char'">
      <span
        class="char-text inline-flex items-center justify-center font-semibold text-text-title px-0.5 box-border mt-auto transition-all duration-fast text-[calc(0.875rem*var(--score-font-scale,1))] leading-[1.15rem] min-h-[calc(1.15rem*var(--score-font-scale,1))] whitespace-pre group-hover:text-primary"
        :class="[
          char === ' '
            ? ''
            : chord
              ? 'underline decoration-dashed decoration-text-disabled/80 underline-offset-[8px]'
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
const fretboardSizeCache = reactive(new Map<string, { width: string; height: string }>());
</script>

<script setup lang="ts">
import ActionButton from '@/components/base/ActionButton.vue';
import Fretboard from '@/components/fretboard/Fretboard.vue';
import { globalDarkMode, isGlobalEditable } from '@/stores/globalState';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import type { Chord, SlotKey } from '@/types';
import { observeVisibility } from '@/utils/core/common';
import { getPlaceholderSize } from '@/utils/music/chord-fretboard';
import { getChordName } from '@/utils/music/musicTheory';
import { GripVertical, Pencil, Plus, X } from '@lucide/vue';
import { computed, nextTick, ref, useTemplateRef, watch, watchEffect, type ComponentPublicInstance } from 'vue';

const props = defineProps<{
  slotKey: SlotKey;
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
  (e: 'remove', slotKey: SlotKey): void;
  (e: 'pointerdown', event: PointerEvent, slotKey: SlotKey, chord: Chord): void;
  (e: 'copyPointerdown', event: PointerEvent, slotKey: SlotKey, chord: Chord): void;
}>();

const isVisible = ref(false);
const isHovered = ref(false);
const isFocused = ref(false);
// 操作按钮组引用：作为单一可聚焦节点，方向键在其内部按钮间切换
const actionGroupEl = useTemplateRef<HTMLElement>('actionGroupEl');
const editButtonEl = useTemplateRef<{ $el: HTMLButtonElement }>('editButtonEl');
const copyButtonEl = useTemplateRef<{ $el: HTMLButtonElement }>('copyButtonEl');
const removeButtonEl = useTemplateRef<{ $el: HTMLButtonElement }>('removeButtonEl');
const addButtonEl = useTemplateRef<{ $el: HTMLButtonElement }>('addButtonEl');
// 当前激活的操作按钮下标（0 修改 / 1 复制 / 2 删除），支持上下方向键切换
const activeActionIndex = ref(0);
// 覆盖层（操作按钮/遮罩/添加槽提示）在 hover 或聚焦时显示
const isActive = computed(() => isHovered.value || isFocused.value);

// 焦点进入本槽（含进入内部按钮）时标记为激活；避免 blur 在焦点移入按钮时误关闭
const handleFocusIn = (e: FocusEvent) => {
  isFocused.value = true;
  // 仅当焦点直接落在根槽（Tab/程序聚焦）时才同步到内部按钮；
  // 鼠标点击或槽内按钮间移动时不得重聚焦，否则会把焦点拉回 activeActionIndex 所指按钮
  if ((e.target as HTMLElement) !== charBoxRef.value) return;
  if (!isGlobalEditable.value) return;
  if (props.variant === 'add') {
    // 添加槽与字符槽共享焦点模型：根槽聚焦时把焦点同步到内部"+"按钮（反向经 focusin 冒泡已天然生效）
    nextTick(() => addButtonEl.value?.$el.focus());
    return;
  }
  if (props.chord) {
    // 有和弦：让焦点同步落到当前激活按钮，方便方向键直接切换
    nextTick(() => focusButton(activeActionIndex.value));
  }
};
// 仅当焦点真正离开本槽子树时才取消激活
const handleFocusOut = (e: FocusEvent) => {
  const next = e.relatedTarget as Node | null;
  if (next && charBoxRef.value?.contains(next)) return;
  isFocused.value = false;
};
/** 字符槽 title：可编辑时按是否已有和弦给出点击提示 */
const slotTitle = computed(() =>
  isGlobalEditable.value && props.variant === 'char' ? (props.chord ? '点击更换或清除和弦' : '点击添加和弦') : undefined
);
/** 修改/复制/删除大按钮的标签与提示文案 */
const editButtonLabel = '修改';
const editButtonTitle = '打开和弦编辑器';
const moveButtonLabel = '移动';
const moveButtonTitle = '按住拖拽，松开后可选择复制或移位';
const removeButtonLabel = '删除';
const removeButtonTitle = '清除当前和弦';
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
  if (fretboardSizeCache.has(cacheKey)) return;
  const domEl = (el as ComponentPublicInstance)?.$el ?? el;
  if (!(domEl instanceof HTMLElement)) return;
  const rect = domEl.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    fretboardSizeCache.set(cacheKey, {
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
  }
};

const getCalculatedOrCachedSize = (fretCount: number) => {
  const cacheKey = getCacheKey(fretCount);
  const cached = fretboardSizeCache.get(cacheKey);
  if (cached) return cached;
  else return getPlaceholderSize(fretCount, getEffectiveScale(), true, true);
};

const handleClick = (e: MouseEvent) => {
  // 空槽（无和弦）点击用于添加；有和弦的交互收敛到 hover 浮出的操作按钮
  if (isGlobalEditable.value && !props.chord) {
    e.stopPropagation();
    e.preventDefault();
    emit('click');
  }
};

const handleKeydown = (e: KeyboardEvent) => {
  if (!isGlobalEditable.value) return;
  // 焦点已落在组内操作按钮上时，交给按钮原生处理（回车/空格触发对应操作），避免重复拦截
  const target = e.target as HTMLElement | null;
  if (actionGroupEl.value?.contains(target)) return;
  e.stopPropagation();
  e.preventDefault();
  if (props.variant === 'add') {
    // 行首行尾的添加槽与空字符槽共享行为：回车/空格直接打开添加 picker
    emit('click');
    return;
  }
  if (!props.chord) {
    // 无和弦的字符槽：打开添加 picker
    emit('click');
    return;
  }
  // 有和弦：不再弹出 picker，唤起操作按钮组，焦点停在按钮组节点上由用户用方向键切换
  isFocused.value = true;
  activeActionIndex.value = 0;
  nextTick(() => focusButton(activeActionIndex.value));
};

// 三个操作按钮的 DOM 引用，按下标取用
const actionButtons = () =>
  [editButtonEl.value, copyButtonEl.value, removeButtonEl.value].filter(Boolean) as Array<{
    $el: HTMLButtonElement;
  }>;
const focusButton = (index: number) => {
  const btn = actionButtons()[index];
  btn?.$el.focus();
};

// 上下方向键在按钮组内循环切换，回车/空格触发当前按钮的对应事件
const handleActionKeydown = (e: KeyboardEvent) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.key === 'ArrowDown' ? 1 : -1;
    const len = 3;
    activeActionIndex.value = (activeActionIndex.value + delta + len) % len;
    focusButton(activeActionIndex.value);
    return;
  }
  // 回车/空格保留默认行为（触发当前聚焦按钮的原生 click），仅阻止冒泡
  if (e.key === 'Enter' || e.key === ' ') {
    e.stopPropagation();
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
