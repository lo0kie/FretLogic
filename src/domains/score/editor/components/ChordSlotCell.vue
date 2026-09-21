<template>
  <div
    v-wave="{}"
    :aria-label="ariaLabelText"
    :class="[
      {
        'opacity-85': variant !== 'char' && !(variant === 'edge' && chord) && variant !== 'add',
        'justify-start opacity-100 after:block after:h-[1.15rem] after:w-full after:shrink-0 after:content-[\'\']':
          variant === 'edge' && Boolean(chord),
        'justify-center px-[0.4rem] opacity-100 hover:bg-transparent!': variant === 'add',
        'rounded-md border border-dashed border-border-base/70': variant === 'add' && isActiveDropLine,
        'ml-[0.15rem]': leftChordGap,
        'px-0': Boolean(chord),
        'px-0.5': !chord,
        // 拖拽落点行内整行空字符槽统一撑开（仅活动落点行触发）：
        // 尺寸与外边距平滑过渡，保证落点边框有充裕高度且行内相对位置不抽动
        'is-drop-widened': !chord && isActiveDropLine,
      },
    ]"
    :data-slot-key="slotKey"
    :tabindex="0"
    :title="slotTitle"
    @click="handleClick($event)"
    @focusin="handleFocusIn($event)"
    @focusout="handleFocusOut($event)"
    @keydown.backspace="handleDelete($event)"
    @keydown.delete="handleDelete($event)"
    @keydown.enter="handleKeydown($event)"
    @keydown.space="handleKeydown($event)"
    @pointerdown="handleSlotPointerDown($event)"
    data-focusable-outline
    class="char-box group relative flex cursor-pointer [touch-action:pan-x_pan-y] flex-col items-center justify-start self-stretch rounded-sm p-0.5 transition-all duration-fast outline-none hover:bg-tint-primary-88 [&.is-dragging-source]:opacity-35!"
    ref="charBoxRef"
    role="button"
  >
    <!-- 悬停操作层：仅保留「删除」（更换 / 复制等操作统一由右侧选择面板承担，
         拖动则直接按住和弦本体）。右上角小图标不遮挡指板，槽位主体仍是拖动面 -->
    <div
      v-if="chord"
      :class="[FAST_TRANSITION_CLASS, isActive ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0']"
      class="absolute -top-2 -right-1 z-card"
    >
      <ActionButton
        v-wave
        :aria-label="REMOVE_ACTION_TITLE"
        :height="REMOVE_BUTTON_SIZE"
        :tabindex="-1"
        :title="REMOVE_ACTION_TITLE"
        :width="REMOVE_BUTTON_SIZE"
        @click="handleRemoveClick($event)"
        @pointerdown="handleRemovePointerDown($event)"
        icon-only
        color="danger"
        icon="trash-2"
        icon-size="xs"
        icon-stroke="thin"
        size="sm"
        variant="subtle"
      />
    </div>

    <div
      :class="variant === 'edge' && chord ? 'items-start' : variant === 'add' ? 'items-center' : 'items-start'"
      class="chord-display-slot flex w-full flex-1 justify-center"
    >
      <!-- 拖拽落点提示：只给一圈主题色边框，不铺底色、不遮挡和弦与字符。
           层级说明：z-[3] 低于操作按钮层 z-card(5)，因拖拽中操作按钮被 isDragActive 抑制为
           opacity-0 + pointer-events-none，且本层自身 pointer-events-none，二者无交互冲突。
           过渡改由本元素自身的类切换承担（原外层 <Transition> 每槽位会多实例化 Transition +
           BaseTransition 两个组件，纯装饰性提示不值得付组件开销；原 enter/leave 的 scale 两端
           都是 100，实际只有 opacity 在变，故 transition-property 收敛为 opacity,visibility）。
           visibility 与 opacity 同过渡：淡出结束后才转 hidden，既不建层叠上下文也不参与命中。 -->
      <div
        :class="isDropTarget ? 'visible opacity-100' : 'invisible opacity-0'"
        aria-hidden="true"
        class="pointer-events-none absolute inset-[2px] z-3 rounded-[5px] border-2 border-primary transition-[opacity,visibility] duration-fast"
      />
      <div
        v-if="chord"
        class="inline-fretboard-card relative flex flex-col items-center rounded-sm bg-transparent px-0 py-xs transition-all duration-fast select-none"
      >
        <FretboardCanvas
          :chord
          :chord-name-scale="0.8"
          :is-dark-mode="isDark"
          :scale="(1.4 * scoreEditor.effectiveFretboardScale) / 100"
          :shorthand="settingsStore.scoreChordShorthand"
          :show-barre="settingsStore.scoreShowBarre"
        />
      </div>

      <ActionButton
        v-else-if="variant === 'add'"
        :aria-label="addPlaceholderTitle"
        :class="
          isActive || lineHovered || isActiveDropLine
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0'
        "
        :tabindex="-1"
        :title="addPlaceholderTitle"
        icon-only
        icon="plus"
        icon-color="var(--color-primary)"
        icon-size="lg"
        icon-stroke="bold"
        ref="addButtonEl"
        variant="subtle"
      />
    </div>
    <template v-if="variant === 'char'">
      <span
        :class="[
          // 拖拽中字符 hover 不染主题色（避免与落点边框抢注意力），正常 hover 仍保留
          { 'group-hover:text-primary': !isDragActive },
          char === '|' || char === '｜' ? 'font-normal text-fg-muted' : 'font-semibold text-fg-title',
          char === ' ' ? '' : chord ? 'underline decoration-fg-disabled/80 decoration-dashed underline-offset-8' : '',
        ]"
        class="char-text mt-auto inline-flex min-h-[calc(1.15rem*var(--score-font-scale,1))] items-center justify-center px-0.5 text-[calc(var(--score-font-scale,1)*0.875rem)]/[1.15rem] whitespace-pre transition-all duration-fast"
      >
        {{ char === ' ' ? '\u00A0' : char }}
      </span>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from 'vue';

import { useElementHover } from '@vueuse/core';

import FretboardCanvas from '@/domains/fretboard/components/FretboardCanvas.vue';
import ActionButton from '@/platform/ui/button/ActionButton.vue';
import { getChordName } from '@/domains/chord/theory/theory';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { isDark } from '@/platform/composables/useTheme';
import { useSettingsStore } from '@/platform/store/settingsStore';

import type { Chord } from '@/domains/chord/types';
import type { SlotKey } from '@/domains/score/types';

const props = defineProps<{
  slotKey: SlotKey;
  chord?: Chord;
  char?: string;
  variant: 'char' | 'edge' | 'add';
  addPlaceholderTitle?: string;
  scrollRoot?: HTMLElement | null;
  leftChordGap?: boolean;
  lineHovered?: boolean;
  /** 全局是否正在拖拽和弦：拖拽中抑制 hover/focus 触发的删除钮与 hover 染色，避免干扰落点提示 */
  isDragActive?: boolean;
  /** 本行是否为当前活动落点行：驱动空槽/添加槽撑开与虚线提示（仅落点行生效，避免全量重排） */
  isActiveDropLine?: boolean;
  /** 本槽位是否为当前拖拽落点：为 true 时渲染落点边框提示 */
  isDropTarget?: boolean;
}>();

const emit = defineEmits<{
  (e: 'click'): void;
  (e: 'remove', slotKey: SlotKey): void;
  /** 按下和弦本体：宿主据此登记「移动」拖拽会话（鼠标超阈值 / 触摸长按起拖） */
  (e: 'pointerdown', payload: { event: PointerEvent; slotKey: SlotKey; chord: Chord }): void;
}>();

// 根槽元素：hover 态经 useElementHover 跟踪（免去模板 mouseenter/mouseleave 双绑定），焦点态仍走 focusin/focusout
const charBoxRef = useTemplateRef<HTMLElement>('charBoxRef');
const isHovered = useElementHover(charBoxRef);
const isFocused = ref(false);
const addButtonEl = useTemplateRef<{ $el: HTMLButtonElement }>('addButtonEl');

// 覆盖层（删除钮 / 添加槽提示）在 hover 或聚焦时显示；全局拖拽期间一律抑制
// （isDragActive 传全局拖拽态，而非本行落点态）：防止拖动经过任意和弦时弹出删除钮、盖住落点提示
const isActive = computed(() => (isHovered.value || isFocused.value) && !props.isDragActive);

// 拖拽/焦点高亮与过渡常量
// 拖拽源高亮描边引用 tokens 的 --focus-ring 令牌（聚焦外环改由 JS 注入的 data-focusable-outline 承担）
// 落点提示淡入淡出统一使用 duration-fast 令牌（双源统一后 fast=100ms）
const FAST_TRANSITION_CLASS = 'transition-all duration-fast';
/** 悬停删除钮的无障碍文本与原生提示 */
const REMOVE_ACTION_TITLE = '清除当前和弦';
/**
 * 悬停删除钮边长(px)：控件标尺最小档 sm 已是 1.6rem(25.6px)，压在字符槽角上仍明显偏大，
 * 故走 ActionButton 的 width/height 出口收紧（不改标尺，避免影响全站控件同高契约），
 * 图标同步降到 xs(12px) 档，保证小尺寸下仍居中且不糊成一团。
 */
const REMOVE_BUTTON_SIZE = 24;

// 落点边框提示统一用主题色描边（不再按落地动作分色），保证和弦指板与字符始终保持原样可读
// 焦点进入本槽（含内部按钮）时标记为激活；避免 blur 在焦点移入按钮时误关闭
const handleFocusIn = (e: FocusEvent) => {
  isFocused.value = true;
  // 仅当焦点直接落在根槽（Tab/程序聚焦）时才同步到内部按钮；
  // 鼠标点击或槽内按钮间移动时不得重聚焦，否则会把焦点拉回按钮
  if ((e.target as HTMLElement) !== charBoxRef.value) return;
  if (props.variant === 'add')
    // 添加槽与字符槽共享焦点模型：根槽聚焦时把焦点同步到内部"+"按钮（反向经 focusin 冒泡已天然生效）
    nextTick(() => addButtonEl.value?.$el.focus());
};
// 仅当焦点真正离开本槽子树时才取消激活
const handleFocusOut = (e: FocusEvent) => {
  const next = e.relatedTarget as Node | null;
  if (next && charBoxRef.value?.contains(next)) return;
  isFocused.value = false;
};
/** 字符槽 title：点击恒为开关选择和弦面板（面板只作拖动来源），有和弦时额外提示按住可直接拖动 */
const slotTitle = computed(() =>
  props.variant === 'char' ? (props.chord ? '点击开关和弦面板（按住可拖动到其它槽位）' : '点击开关和弦面板') : undefined
);

const stopEvent = (e: Event): void => {
  e.stopPropagation();
  e.preventDefault();
};

/** 删除钮点击位移容差（px）：起手点与松手点距离超过它，视为「其实是想拖动」而非删除 */
const REMOVE_CLICK_MOVE_TOLERANCE = 5;
/** 删除钮起手位置；null 表示本次点击不是从删除钮起手的 */
let removePressPos: { x: number; y: number } | null = null;

const scoreEditor = useScoreEditorStore();
const settingsStore = useSettingsStore();

/** 槽位点击：一律开关选择和弦面板；面板只作拖动来源，和弦经「把卡片拖到本槽」落地 */
const handleClick = (e: MouseEvent) => {
  e.stopPropagation();
  e.preventDefault();
  emit('click');
};

/** 键盘操作：回车/空格与点击等价，同样开关选择和弦面板 */
const handleKeydown = (e: KeyboardEvent) => {
  e.stopPropagation();
  e.preventDefault();
  emit('click');
};

/**
 * 按下槽位本体：登记拖拽意图（唯一语义为「移动」），后续阈值/长按判定由宿主接管。
 * 无和弦的空槽没有可拖动的内容，不登记；按下按钮（删除钮）也不算拖动起点——按钮自身
 * 已 stopPropagation，这里再按标签兜一层，避免按钮后续改动漏掉。
 */
const handleSlotPointerDown = (e: PointerEvent) => {
  if (!props.chord) return;
  if ((e.target as HTMLElement).closest('button')) return;
  emit('pointerdown', { event: e, slotKey: props.slotKey, chord: props.chord });
};

/**
 * 删除钮按下：记录起手位置并拦截冒泡（拖动不从按钮起手；仅 stopPropagation，
 * 不 preventDefault——否则会抑制随后那次 click 激活，按钮就点不动了）。
 */
const handleRemovePointerDown = (e: PointerEvent) => {
  e.stopPropagation();
  removePressPos = { x: e.clientX, y: e.clientY };
};

/** 删除钮：清除本槽和弦（拦截冒泡，避免同时触达槽位的点击打开面板） */
const handleRemoveClick = (e: MouseEvent) => {
  const press = removePressPos;
  removePressPos = null;
  stopEvent(e);
  // 起手在删除钮、但中途拖出去又拖回来松手：用户本意是拖和弦，不能当成删除
  if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > REMOVE_CLICK_MOVE_TOLERANCE) return;
  emit('remove', props.slotKey);
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
  if (props.variant === 'add') return '添加边缘和弦槽位';

  const charDisplay = props.char === ' ' ? '空格' : props.char || '边缘槽位';
  if (props.chord) {
    const chordName = getChordName(props.chord);
    return `字符 ${charDisplay}，当前分配和弦 ${chordName}，按 Enter 开关和弦面板，按 Delete 清除`;
  }
  return `字符 ${charDisplay}，未分配和弦，按 Enter 开关和弦面板`;
});
</script>

<style scoped lang="scss">
/* 字符盒 min-* 基线显式归零：min-width/min-height 初始值为 auto，
   auto 与长度之间无法插值（过渡按离散翻转，表现为瞬间跳变）；
   归零后 .is-drop-widened 的 0.12s 撑开过渡才能真实生效（收拢回落到本基线同样平滑） */
.char-box {
  min-width: 0;
  min-height: 0;
  /* 关键：min-width/min-height 过渡必须落在基类上——松开拖拽时 .is-drop-widened 被摘除，
     过渡若只写在状态类里会在同一帧随类一起消失，导致收拢瞬间跳回原宽而无过渡。
     box-sizing 恒定 content-box，避免收拢时宽度口径翻转造成离散跳变（撑开/收拢始终平滑）。 */
  box-sizing: content-box;
  transition: all 0.12s cubic-bezier(0.25, 0.1, 0.25, 1);
}

/* 拖拽期间仅当前活动落点行空字符槽/添加槽统一撑开：尺寸走基类的 all 过渡，撑开与收拢双向往返均平滑 */
.is-drop-widened {
  min-width: 58px;
  min-height: 108px;
}

/* 拖拽源高亮外边框引用 tokens 的 --focus-ring 令牌；聚焦外环统一由 JS 注入（data-focusable-outline） */

/* 触摸长按等待期的按压反馈：源槽位渐显主色描边并轻微放大，提示即将进入拖拽 */
.char-box.is-press-arming {
  transform: scale(1.04);
  box-shadow: 0 0 0 2px var(--color-primary);
}

/* 拖拽源槽位高亮外边框 */
.char-box.is-dragging-source {
  box-shadow: var(--focus-ring) !important;
}
</style>
