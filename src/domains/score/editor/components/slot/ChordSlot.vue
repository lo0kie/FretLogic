<template>
  <!-- 外壳引用 SlotShell（与谱面瘦槽位同源）：槽的骨架、内外几何、共有事件、激活态与全部
       落点视觉都由它承担，本组件不向它透传任何布局类（改槽的留白只需改外壳一处）。
       本组件只负责「和弦槽」在瘦壳之上多出来的东西，一律经插槽注入：指板图卡片、删除钮，
       以及字符层 SlotGlyph。这样「胖」是加在「瘦」上的，而不是另起一套壳：改一处槽级状态
       （如面板目标高亮）不会再有第二个地方需要同步。
       两种用法同源，差异只有「有没有字符」：传 char 是字符槽（指板图 + 其下字形），不传则是
       行首 / 行尾的边缘槽——同样挂一份 SlotGlyph，只是渲染空字形占住字符行高度、与字符槽等高。 -->
  <SlotShell
    :is-drag-active
    :is-drop-target
    :is-picker-target
    :left-chord-gap
    :slot-key
    :aria-label="ariaLabelText"
    :title="slotTitle"
    @click="emit('click')"
    @pointerdown="handleSlotPointerDown($event)"
    @remove="handleDeleteKey($event)"
  >
    <!-- 悬停操作层：仅保留「删除」（更换 / 复制等操作统一由右侧选择面板承担，
         拖动则直接按住和弦本体）。右上角小图标不遮挡指板，槽位主体仍是拖动面。
         配色走中性灰阶而非常驻 danger：24px 小尺寸下的一抹红色是全站冷色系（primary 蓝紫）
         里少见的暖色噪点，而本钮只在 hover/focus 才浮现，红色等于每次悬停都制造一次色彩噪音。
         危险语义改由「按下」承担——active 时才切 danger（按下即执行删除，红色是即时反馈）。
         隐形点击热区：视觉边长必须保持 24px（见 REMOVE_BUTTON_SIZE——放大到控件标尺会盖住指板图），
         但 24px 远小于触屏建议的最小可点尺寸，故用伪元素把命中面外扩 6px（24 → 36px），视觉尺寸不变。
         为什么只扩 6px 而不补到 44px：槽位是密集网格，热区向右扩会吃掉相邻槽的指针事件，把「点不中」
         换成「点错」（删掉隔壁的和弦）——那是更糟的失败模式；且本钮只在槽位被 hover / 聚焦时才
         pointer-events-auto，热区非常驻，误触窗口本身有限。 -->
    <template #overlay="{ active }">
      <div
        v-if="chord"
        :class="[FAST_TRANSITION_CLASS, active ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0']"
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
          class="relative after:absolute after:inset-[-6px] after:content-[''] active:text-danger"
          color="default"
          icon="trash-2"
          icon-size="xs"
          icon-stroke="thin"
          size="sm"
          variant="subtle"
        />
      </div>
    </template>

    <template #default>
      <!-- 和弦单元容器：极淡底色 + 细描边，把「指板图 + 其下字符」聚合成一个视觉块。
           此前 bg-transparent 无边框，指板图直接悬浮在歌词行里，一行内和弦密集时与字符糊成
           一片，看不出「一个和弦单元」的边界在哪。
           底色选 surface-panel-subtle（面板上一档的浅填充）而非 panel-hover：行在 hover/focus
           时本身才染 panel-hover，单元底色必须比行底色更轻，否则悬停时两层撞成一片、层级反而糊。
           px-0.5 是给新描边的呼吸位（原本 px-0 让画布直接贴着卡片边缘）。 -->
      <div
        v-if="chord"
        class="inline-fretboard-card relative flex flex-col items-center rounded-sm border border-border-light bg-surface-panel-subtle transition-all duration-fast select-none"
      >
        <FretboardCanvas
          :chord
          :is-dark-mode="isDark"
          :scale="(1.4 * scoreEditor.effectiveFretboardScale) / 100"
          :shorthand="settingsStore.scoreChordShorthand"
          :show-barre="settingsStore.scoreShowBarre"
          :trim-empty-edge-frets="settingsStore.scoreTrimEmptyEdgeFrets"
        />
      </div>
    </template>

    <!-- 字符层：字形归 SlotGlyph，外壳不认识字符。传了 char 是字符槽；不传（行首 / 行尾的边缘槽）
         也照挂一份——它渲染空字形占住同一行高度，与字符槽等高对齐（同一件事此前由外壳的
         reserve-char-row 开关表达）。
         拖拽态不从这里传：外壳已把 isDragActive 作为插槽参数下发（源头是同一个 prop），
         字形直接取参数即可，宿主不必再取一遍。 -->
    <template #char="{ dragActive }">
      <SlotGlyph :char :is-drag-active="dragActive" />
    </template>
  </SlotShell>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import FretboardCanvas from '@/domains/fretboard/components/FretboardCanvas.vue';
import ActionButton from '@/platform/ui/button/ActionButton.vue';
import { getChordName } from '@/domains/chord/theory/theory';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { isDark } from '@/platform/composables/useTheme';
import { useSettingsStore } from '@/platform/store/settingsStore';

import SlotGlyph from './SlotGlyph.vue';
import SlotShell from './SlotShell.vue';

import type { Chord } from '@/domains/chord/types';
import type { SlotKey } from '@/domains/score/types';

/**
 * 和弦槽（胖槽）：在 SlotShell 的通用槽壳上叠加指板图卡片与删除钮。
 *
 * 两种用法由「有没有字符」区分，不再需要 variant 开关——原先 char / edge 两个取值本就是在表达
 * 同一件事（宿主侧早已折算成 `:char="variant === 'char' ? char : undefined"`，`variant` 只是
 * 第二真相，还让一处 class 条件依赖两个字段交叉判断）：
 * - 传 char：字符槽，指板图卡片下方还有该字符；
 * - 不传 char：行首 / 行尾的边缘槽，外壳留出字符行高度，卡片与字符槽等高。
 */
defineOptions({ name: 'ChordSlot' });

const props = defineProps<{
  slotKey: SlotKey;
  /** 本槽绑定的和弦；当前所有用法都由宿主先筛掉空槽后再实例化，故实际必传 */
  chord?: Chord;
  /** 槽内字符；不传即行首 / 行尾的边缘槽 */
  char?: string;
  /** 与左侧相邻和弦是否紧邻：只转达「紧邻」这个事实，间距值归外壳的 .is-left-adjacent */
  leftChordGap?: boolean;
  /** 全局是否正在拖拽和弦：拖拽中抑制 hover/focus 触发的删除钮，避免干扰落点提示 */
  isDragActive?: boolean;
  /** 本槽位是否为当前拖拽落点：为 true 时渲染落点边框提示 */
  isDropTarget?: boolean;
  /** 本槽位是否为选器和弦面板的当前目标：为 true 时高亮显示（指示卡片会写进哪一格） */
  isPickerTarget?: boolean;
}>();

const emit = defineEmits<{
  (e: 'click'): void;
  (e: 'remove', slotKey: SlotKey): void;
  /** 按下和弦本体：宿主据此登记「移动」拖拽会话（鼠标超阈值 / 触摸长按起拖） */
  (e: 'pointerdown', payload: { event: PointerEvent; slotKey: SlotKey; chord: Chord }): void;
}>();

// 拖拽/焦点高亮与过渡常量
// 拖拽源高亮描边引用 tokens 的 --focus-ring 令牌（聚焦外环改由 JS 注入的 data-focusable-outline 承担）
// 操作层（删除钮容器）显隐的过渡：时长取 duration-fast 令牌，曲线走 tailwind.css 的默认曲线令牌
const FAST_TRANSITION_CLASS = 'transition-all duration-fast';
/** 悬停删除钮的无障碍文本与原生提示 */
const REMOVE_ACTION_TITLE = '清除当前和弦';
/**
 * 悬停删除钮边长(px)：控件标尺最小档 sm 已是 1.6rem(25.6px)，压在字符槽角上仍明显偏大，
 * 故走 ActionButton 的 width/height 出口收紧（不改标尺，避免影响全站控件同高契约），
 * 图标同步降到 xs(12px) 档，保证小尺寸下仍居中且不糊成一团。
 */
const REMOVE_BUTTON_SIZE = 24;

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

/**
 * 按下槽位本体：登记拖拽意图（唯一语义为「移动」），后续阈值/长按判定由宿主接管。
 * 无和弦的空槽没有可拖动的内容，不登记；按钮起手已由槽壳排除。
 */
const handleSlotPointerDown = (e: PointerEvent) => {
  if (!props.chord) return;
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

/** Delete/Backspace：有和弦时清除当前槽位的和弦（无和弦时不拦截，交回上层） */
const handleDeleteKey = (e: KeyboardEvent) => {
  if (!props.chord) return;
  e.stopPropagation();
  e.preventDefault();
  emit('remove', props.slotKey);
};

/** 字符槽 title：点击恒为打开选择和弦面板（面板只作拖动来源，关闭走外壳按钮 / Escape），
 *  有和弦时额外提示按住可直接拖动。边缘槽（无字符）不给原生提示：卡片上没有任何文字锚点，
 *  悬停提示反而与「点一下打开面板」的直觉冲突 */
const slotTitle = computed(() =>
  props.char !== undefined ? (props.chord ? '点击打开和弦面板（按住可拖动到其它槽位）' : '点击打开和弦面板') : undefined
);

const ariaLabelText = computed(() => {
  const charDisplay = props.char === ' ' ? '空格' : props.char || '边缘槽位';
  if (props.chord) {
    const chordName = getChordName(props.chord);
    return `字符 ${charDisplay}，当前分配和弦 ${chordName}，按 Enter 打开和弦面板，按 Delete 清除`;
  }
  return `字符 ${charDisplay}，未分配和弦，按 Enter 打开和弦面板`;
});
</script>
