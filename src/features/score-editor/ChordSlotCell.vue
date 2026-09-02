<template>
  <div
    v-wave
    :aria-label="ariaLabelText"
    :class="[
      {
        'opacity-85': variant !== 'char' && !(variant === 'edge' && chord) && variant !== 'add',
        'justify-start opacity-100 after:block after:h-[1.15rem] after:w-full after:shrink-0 after:content-[\'\']':
          variant === 'edge' && Boolean(chord),
        'justify-center px-[0.4rem] opacity-100 hover:bg-transparent!': variant === 'add',
        'ml-[0.42rem]': leftChordGap,
        // 拖拽期间整行空字符槽统一撑开（isDragActive 全程恒定）：
        // 若跟随 dropZone 逐槽增缩会推动整行来回顶、产生抽动
        'is-drop-widened': !chord && isDragActive,
        // 聚焦时和弦自身保持外边框（焦点会落到组内按钮，故用 isFocused 状态而非 :focus）
        [FOCUS_RING_SHADOW_CLASS]: isFocused,
      },
    ]"
    :data-focusable-inline="true"
    :data-slot-key="slotKey"
    :tabindex="0"
    :title="slotTitle"
    @click="handleClick"
    @focusin="handleFocusIn"
    @focusout="handleFocusOut"
    @keydown.backspace="handleDelete"
    @keydown.delete="handleDelete"
    @keydown.enter="handleKeydown"
    @keydown.space="handleKeydown"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    class="char-box group duration-fast hover:bg-tint-primary-88 [&.is-drop-target]:bg-tint-primary-85! relative box-border flex cursor-pointer [touch-action:pan-x_pan-y] flex-col items-center justify-start self-stretch rounded-sm p-0.5 transition-all outline-none [&.is-dragging-source]:!opacity-35"
    ref="charBoxRef"
    role="button"
  >
    <div
      :class="variant === 'edge' && chord ? 'items-start' : variant === 'add' ? 'items-center' : 'items-start'"
      class="chord-display-slot flex w-full flex-1 justify-center"
    >
      <!-- 拖拽分区落点：本槽位为当前落点时，上下两块分区即松手后将执行的动作（光标所在分区放大）。
           层级说明：z-[3] 低于操作按钮层 z-card(5)，因拖拽中操作层被 isDragActive 抑制为
           opacity-0 + pointer-events-none，且分区层自身 pointer-events-none，二者无交互冲突。
           外层 Transition 负责分区整体出现/消失的透明度过渡 -->
      <Transition
        enter-active-class="transition-[opacity,scale] duration-[160ms]"
        enter-from-class="opacity-0 scale-100"
        leave-active-class="transition-[opacity,scale] duration-[160ms]"
        leave-to-class="opacity-0 scale-100"
      >
        <div
          v-if="dropZone"
          class="pointer-events-none absolute inset-0 z-3 flex flex-col gap-[4px] overflow-hidden rounded-[6px] p-[2px]"
        >
          <!-- 有和弦的落点：整槽压暗提示将被影响（位于分区之下） -->
          <div v-if="chord" class="pointer-events-none absolute inset-0 z-[-1] rounded-[6px] bg-black/30" />
          <div :class="[FAST_TRANSITION_CLASS, zoneShellClass('top')]" class="flex items-center justify-center">
            <span :class="[FAST_TRANSITION_CLASS, zoneLabelClass('top')]" class="leading-none font-bold break-keep">
              {{ zoneLabel('top') }}
            </span>
          </div>
          <div :class="[FAST_TRANSITION_CLASS, zoneShellClass('bottom')]" class="flex items-center justify-center">
            <span :class="[FAST_TRANSITION_CLASS, zoneLabelClass('bottom')]" class="leading-none font-bold break-keep">
              {{ zoneLabel('bottom') }}
            </span>
          </div>
        </div>
      </Transition>
      <div
        v-if="chord"
        class="inline-fretboard-card p-xs duration-fast relative flex flex-col items-center rounded-sm bg-transparent transition-all select-none"
      >
        <div
          v-if="isVisible && !isExporting"
          :class="[FAST_TRANSITION_CLASS, isActive ? 'opacity-100' : 'opacity-0']"
          class="pointer-events-none absolute inset-0 z-2 rounded-sm bg-black/30"
        >
          <div
            v-if="isVisible && !isExporting"
            :class="[
              FAST_TRANSITION_CLASS,
              isActive ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
            ]"
            @keydown="handleActionKeydown"
            class="z-card absolute inset-0 flex flex-col items-stretch justify-center gap-1.5 p-2"
            ref="actionGroupEl"
          >
            <ActionButton
              v-wave
              :aria-label="editButtonTitle"
              :class="actionButtonTransition(0)"
              :tabindex="-1"
              :title="editButtonTitle"
              @click.stop.prevent="emit('click')"
              @pointerdown.stop
              block
              class="pointer-events-auto!"
              color="primary"
              ref="editButtonEl"
              size="sm"
              variant="subtle"
            >
              <BaseIcon :size="16" :stroke-width="2.5" class="shrink-0" name="pencil" />
              <span class="font-bold">{{ editButtonLabel }}</span>
            </ActionButton>
            <ActionButton
              v-wave
              :aria-label="moveButtonTitle"
              :class="actionButtonTransition(1)"
              :tabindex="-1"
              :title="moveButtonTitle"
              @click.stop.prevent
              @mouseup.stop.prevent
              @pointerdown.stop.prevent="emit('copyPointerdown', $event, slotKey, chord)"
              block
              class="pointer-events-auto! cursor-grab active:cursor-grabbing"
              color="success"
              ref="copyButtonEl"
              size="sm"
              variant="subtle"
            >
              <BaseIcon :size="16" :stroke-width="2.5" class="shrink-0" name="grip-vertical" />
              <span class="font-bold">{{ moveButtonLabel }}</span>
            </ActionButton>
            <ActionButton
              v-wave
              :aria-label="removeButtonTitle"
              :class="actionButtonTransition(2)"
              :tabindex="-1"
              :title="removeButtonTitle"
              @click.stop.prevent="emit('remove', slotKey)"
              @pointerdown.stop
              block
              class="pointer-events-auto!"
              color="danger"
              ref="removeButtonEl"
              size="sm"
              variant="subtle"
            >
              <BaseIcon :size="16" :stroke-width="2.5" class="shrink-0" name="x" />
              <span class="font-bold">{{ removeButtonLabel }}</span>
            </ActionButton>
          </div>
        </div>
        <Fretboard
          v-if="isVisible"
          :chord
          :chord-name-editable="false"
          :interactive="false"
          :is-dark-mode="globalDarkMode"
          :is-score-mode="true"
          :ref="setFretboardMeasureRef"
          :scale="0.25 * scoreEditor.effectiveFretboardScale"
          fret-number-size="lg"
        />
        <div v-else :style="chord ? getCalculatedOrCachedSize(chord.fretCount) : undefined" />
      </div>

      <ActionButton
        v-else-if="variant === 'add'"
        :aria-label="addPlaceholderTitle"
        :class="isActive || lineHovered ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'"
        :tabindex="-1"
        :title="addPlaceholderTitle"
        icon-only
        ref="addButtonEl"
        variant="subtle"
      >
        <BaseIcon :size="18" :stroke-width="3" class="text-primary" name="plus" />
      </ActionButton>
    </div>
    <template v-if="variant === 'char'">
      <span
        :class="[
          // 拖拽中字符 hover 不染主题色（避免与分区高亮抢注意力），正常 hover 仍保留
          { 'group-hover:text-primary': !isDragActive },
          char === ' '
            ? ''
            : chord
              ? 'decoration-text-disabled/80 underline decoration-dashed underline-offset-[8px]'
              : '',
        ]"
        class="char-text text-text-title duration-fast mt-auto box-border inline-flex min-h-[calc(1.15rem*var(--score-font-scale,1))] items-center justify-center px-0.5 text-[calc(0.875rem*var(--score-font-scale,1))] leading-[1.15rem] font-semibold whitespace-pre transition-all"
      >
        {{ char === ' ' ? '\u00A0' : char }}
      </span>
    </template>
  </div>
</template>

<script lang="ts">
import { reactive } from 'vue';

import BaseIcon from '@/components/ui/BaseIcon.vue';

const fretboardSizeCache = reactive(new Map<string, { width: string; height: string }>());
</script>

<script lang="ts" setup>
import { computed, nextTick, ref, useTemplateRef, watch, watchEffect, type ComponentPublicInstance } from 'vue';

import Fretboard from '@/components/fretboard/Fretboard.vue';
import ActionButton from '@/components/ui/ActionButton.vue';
import {
  resolveDropAction,
  type DropAction,
  type DropZone,
} from '@/features/score-editor/composables/lyrics-drag/dropZone';
import { getChordName } from '@/services/music/theory';
import { globalDarkMode } from '@/stores/globalState';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import type { Chord, SlotKey } from '@/types';
import { observeVisibility } from '@/utils/core/common';
import { getPlaceholderSize } from '@/utils/music/chord-fretboard';

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
  /** 全局是否正在拖拽和弦：拖拽中抑制 hover/focus 触发的操作层（压暗遮罩与按钮），避免干扰落点视觉 */
  isDragActive?: boolean;
  /** 拖拽落点分区：本槽位为当前落点时指示指针所在分区（null 表示非落点，不渲染分区层） */
  dropZone?: DropZone | null;
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
// 覆盖层（操作按钮/遮罩/添加槽提示）在 hover 或聚焦时显示；拖拽进行中一律抑制，
// 防止指针划过的和弦弹出压暗遮罩与按钮、盖住落点高亮
const isActive = computed(() => (isHovered.value || isFocused.value) && !props.isDragActive);

// 拖拽/焦点高亮与过渡常量
const FOCUS_RING_SHADOW_CLASS = '!shadow-[0_0_0_2px_var(--bg-panel),0_0_0_4px_var(--color-primary)]';
const FAST_TRANSITION_CLASS = 'transition-all duration-[160ms]';

// 三个操作按钮的级联过渡类（完整类名需静态写出供 Tailwind 扫描）：
// 显示时按 修改 → 移动 → 删除 依次延迟淡入并上移归位，隐藏时统一无延迟淡出。
// 注意覆盖层随 isVisible 懒挂载后不再重挂，出场动画只能靠 isActive 驱动的过渡实现
const ACTION_BUTTON_SHOW_CLASSES = [
  'opacity-100 translate-y-0 scale-100',
  'opacity-100 translate-y-0 scale-100 [transition-delay:50ms]',
  'opacity-100 translate-y-0 scale-100 [transition-delay:100ms]',
] as const;
const actionButtonTransition = (index: number): string =>
  isActive.value ? (ACTION_BUTTON_SHOW_CLASSES[index] ?? '') : 'opacity-0 translate-y-2 scale-95';

// 分区落点样式：上区=主色（交换/复制），下区=警示色（替换/移位），颜色上区分动作类型；
// 光标所在分区放大（约 65%）并加强（描边+亮字），另一分区同色系压暗收缩。
// 命中判定仍以槽位垂直中点为界，放大只推向非活动侧，与判定不会错位
// 分区按动作语义配色/命名（由 resolveDropAction 统一派生，避免位置与动作双套映射）：
// 交换/复制 → 主色蓝，移动/替换 → success 绿。
// 活动/非活动分区同色不压暗，仅靠大小（flex-[1.86] vs flex-1）与描边区分光标所在分区。
// 命中判定仍以槽位垂直中点为界，放大只推向非活动侧，与判定不会错位
const ACTION_LABELS: Record<DropAction, string> = {
  swap: '交换',
  replace: '替换',
  copy: '复制',
  move: '移动',
};
// 活动/非活动均用 border 描边（仅宽度/透明度差异），避免 box-shadow ring ↔ border
// 切换时过渡出现白闪
const ZONE_ACTIVE_CLASSES: Record<DropAction, string> = {
  swap: 'flex-[1.86] bg-tint-primary-88 border-2 border-primary rounded-[5px]',
  replace: 'flex-[1.86] bg-tint-success-88 border-2 border-success rounded-[5px]',
  copy: 'flex-[1.86] bg-tint-primary-88 border-2 border-primary rounded-[5px]',
  move: 'flex-[1.86] bg-tint-success-88 border-2 border-success rounded-[5px]',
};
const ZONE_INACTIVE_CLASSES: Record<DropAction, string> = {
  swap: 'flex-1 bg-tint-primary-88 rounded-[5px] border border-primary/40',
  replace: 'flex-1 bg-tint-success-88 rounded-[5px] border border-success/40',
  copy: 'flex-1 bg-tint-primary-88 rounded-[5px] border border-primary/40',
  move: 'flex-1 bg-tint-success-88 rounded-[5px] border border-success/40',
};
const ZONE_LABEL_CLASSES: Record<DropAction, { active: string; inactive: string }> = {
  swap: { active: 'text-xs text-primary', inactive: 'text-2xs text-primary' },
  replace: { active: 'text-xs text-success', inactive: 'text-2xs text-success' },
  copy: { active: 'text-xs text-primary', inactive: 'text-2xs text-primary' },
  move: { active: 'text-xs text-success', inactive: 'text-2xs text-success' },
};
/** 落点分区对应的拖拽动作：有和弦的落点为交换/替换，空槽落点为复制/移动 */
const zoneAction = (zone: DropZone): DropAction => resolveDropAction(zone, Boolean(props.chord));
/** 分区动作文案（交换/替换/复制/移动） */
const zoneLabel = (zone: DropZone): string => ACTION_LABELS[zoneAction(zone)];
/** 分区容器样式：光标所在分区用激活态（放大+描边），另一分区用弱化态 */
const zoneShellClass = (zone: DropZone): string => {
  const action = zoneAction(zone);
  return props.dropZone === zone ? ZONE_ACTIVE_CLASSES[action] : ZONE_INACTIVE_CLASSES[action];
};
/** 分区文字样式：光标所在分区字号更大更醒目 */
const zoneLabelClass = (zone: DropZone): string => {
  const cls = ZONE_LABEL_CLASSES[zoneAction(zone)];
  return props.dropZone === zone ? cls.active : cls.inactive;
};

// 焦点进入本槽（含进入内部按钮）时标记为激活；避免 blur 在焦点移入按钮时误关闭
const handleFocusIn = (e: FocusEvent) => {
  isFocused.value = true;
  // 仅当焦点直接落在根槽（Tab/程序聚焦）时才同步到内部按钮；
  // 鼠标点击或槽内按钮间移动时不得重聚焦，否则会把焦点拉回 activeActionIndex 所指按钮
  if ((e.target as HTMLElement) !== charBoxRef.value) return;
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
/** 字符槽 title：按是否已有和弦给出点击提示 */
const slotTitle = computed(() =>
  props.variant === 'char' ? (props.chord ? '点击更换或清除和弦' : '点击添加和弦') : undefined
);
/** 修改/复制/删除大按钮的标签与提示文案 */
const editButtonLabel = '修改';
const editButtonTitle = '打开和弦编辑器';
const moveButtonLabel = '移动';
const moveButtonTitle = '按住拖拽：落到和弦上可交换或替换，落到空位可复制或移位';
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

/** 当前实际渲染缩放（基础 0.25 × 全局和弦缩放） */
const getEffectiveScale = () => 0.25 * scoreEditor.effectiveFretboardScale;
/** 占位尺寸缓存键：品数 + 缩放保留两位小数 */
const getCacheKey = (fretCount: number) => `${fretCount}_${getEffectiveScale().toFixed(2)}`;

/** 首次渲染的指板测量真实尺寸并按品数缓存，供后续占位元素复用 */
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

/** 取缓存的指板占位尺寸；无缓存时按当前缩放计算，保证懒挂载前后布局一致 */
const getCalculatedOrCachedSize = (fretCount: number) => {
  const cacheKey = getCacheKey(fretCount);
  const cached = fretboardSizeCache.get(cacheKey);
  if (cached) return cached;
  else return getPlaceholderSize(fretCount, getEffectiveScale(), true, true);
};

/** 槽位点击：空槽/添加槽打开 picker；有和弦的交互收敛到 hover 浮出的操作按钮 */
const handleClick = (e: MouseEvent) => {
  // 空槽（无和弦）点击用于添加；有和弦的交互收敛到 hover 浮出的操作按钮
  if (!props.chord) {
    e.stopPropagation();
    e.preventDefault();
    emit('click');
  }
};

/** 键盘操作：空槽/添加槽打开 picker；有和弦唤起操作按钮组并聚焦当前激活按钮 */
const handleKeydown = (e: KeyboardEvent) => {
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
/** 聚焦指定下标的操作按钮 */
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

/** Delete/Backspace：有和弦时清除当前槽位的和弦 */
const handleDelete = (e: KeyboardEvent) => {
  if (props.chord) {
    e.stopPropagation();
    e.preventDefault();
    emit('remove', props.slotKey);
  }
};

const ariaLabelText = computed(() => {
  if (props.variant === 'add') {
    return '添加边缘和弦槽位';
  }
  const charDisplay = props.char === ' ' ? '空格' : props.char || '边缘槽位';
  if (props.chord) {
    const chordName = getChordName(props.chord);
    return `字符 ${charDisplay}，当前分配和弦 ${chordName}，按 Enter 更换，按 Delete 清除`;
  }
  return `字符 ${charDisplay}，未分配和弦，按 Enter 添加`;
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

<style lang="scss" scoped>
/* 拖拽经过的空槽位撑开：直接加宽字符槽 + X 轴外边距推开相邻字符，
   min-width 只作下限、不缩窄；宽度/外边距变化带过渡 */
.is-drop-widened {
  box-sizing: content-box;
  min-width: 58px;
  margin-left: 6px;
  margin-right: 6px;
  transition:
    min-width 0.18s cubic-bezier(0.25, 0.1, 0.25, 1),
    margin 0.18s cubic-bezier(0.25, 0.1, 0.25, 1);
}

/* 触摸长按等待期的按压反馈：源槽位渐显主色描边并轻微放大，提示即将进入拖拽 */
.char-box.is-press-arming {
  box-shadow: 0 0 0 2px var(--color-primary);
  transform: scale(1.04);
}

/* 拖拽源槽位高亮外边框 */
.char-box.is-dragging-source,
.char-box.is-dragging-copy-source {
  box-shadow:
    0 0 0 2px var(--bg-panel),
    0 0 0 4px var(--color-primary) !important;
}
</style>
