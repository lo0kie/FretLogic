<template>
  <!-- 添加槽（行首 / 行尾的「+」）：同样以外壳 SlotShell 为基础——外壳、焦点协议、落点提示、
       面板目标高亮，以及槽盒子的内边距与间距全部由它承担（本组件不传任何布局类，
       唯一的类覆盖是「不染 hover 底色」这一条皮肤）。本组件只多两件事：内容换成「+」按钮，以及
       触屏下让该按钮常驻可发现（见「+」上那份 (hover: none) 变体）。
       「+」的槽级激活态（槽被 hover / 聚焦才浮现）由本组件的 CSS 表达，不走外壳的插槽参数——
       理由见 SlotShell 的组件说明。
       点击不在本组件：点「+」的 click 冒泡到宿主 ScoreInteractiveArea 的槽位委托上，按
       `[data-slot-key]` 寻址后打开面板（见 SlotShell 组件说明）。
       与 ChordSlot 并列而不是它的一个变体：那边是「槽 + 和弦」，这边是「槽 + 添加入口」，
       唯一的共同点是外壳——外壳归 SlotShell，故两者互不引用、也不互相 import。 -->
  <SlotShell
    :is-drop-line
    :is-drop-target
    :is-picker-target
    :slot-key
    :aria-label="ADD_SLOT_ARIA_LABEL"
    @focusin="handleFocusIn($event)"
    class="hover:bg-transparent!"
    content-class="items-center"
  >
    <template #default>
      <!-- 「+」的显隐：默认 opacity-0，只在槽被 hover / 聚焦、所在行被悬停、或本行是落点行时显现。
           前两者（槽级）由 group-hover / group-focus-within 表达，不经 JS——划过槽不产生任何 DOM
           写入，详见 SlotShell 的「为什么激活态必须是 CSS」；后两者（行级）仍是 props 驱动的 :class，
           它们只在进出整行时翻转一次、一行也仅两个添加槽，与槽级 hover 不是一个量级。
           触屏没有 hover，该按钮等于「行首行尾可以加和弦」这件事完全不可发现，故在 (hover: none)
           下让行级条件未满足的一档（.add-slot-idle）常驻半透明可见。用 (hover: none) 而非
           (pointer: coarse)：前者直接表达「这台设备没有悬停能力」，正是本线索失效的原因；触屏二合一
           设备接上鼠标后是 (hover: hover)，不会误触发。
           变体挂在 .add-slot-idle 上而非按钮本身，故只命中行级条件未满足的一档：它带两个类、
           特异性 (0,2,0)，压得住 :class 里的 opacity-0 / pointer-events-none；行级条件满足时不挂
           这个类，opacity-100 不受影响。group-hover 变体是 (0,3,0)，稳压它——但 (hover: none) 下
           group-hover 永不匹配，两者不会同时命中。 -->
      <ActionButton
        :aria-label="addPlaceholderTitle"
        :class="isLineVisible() ? 'pointer-events-auto opacity-100' : 'add-slot-idle pointer-events-none opacity-0'"
        :tabindex="-1"
        :title="addPlaceholderTitle"
        icon-only
        class="group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 [@media(hover:none)]:[&.add-slot-idle]:pointer-events-auto [@media(hover:none)]:[&.add-slot-idle]:opacity-45"
        icon="plus"
        icon-color="var(--color-primary)"
        icon-size="lg"
        icon-stroke="bold"
        ref="addButtonEl"
        variant="subtle"
      />
    </template>
  </SlotShell>
</template>

<script setup lang="ts">
import { nextTick, useTemplateRef } from 'vue';

import ActionButton from '@/platform/ui/button/ActionButton.vue';

import SlotShell from './SlotShell.vue';

import type { SlotKey } from '@/domains/score/types';

/**
 * 添加槽：行首 / 行尾那个「+」占位槽，点在它上面就是「在这里加一个边缘和弦」。
 *
 * 它是谱面里唯一没有字符层、也没有和弦的槽：外壳以「没有字符层」为判据认定它是完全空的一格，
 * 于是把「落点行撑开 + 虚线框」这套落点视觉整份给它，本组件只转达「本行是落点行 / 本槽是落点」
 * 这些事实，自己不写任何样式。「+」按钮只是这一格的可见线索。
 *
 * 焦点模型：槽本体与「+」按钮共用一个焦点位——焦点落在槽本体时转交给按钮（按钮才是唯一可见的
 * 内容），反向（按钮 → 槽）由 focusin 冒泡天然生效。故按钮自身 tabindex=-1，不进 Tab 序列，
 * 该槽在 Tab 序列里始终只占一位。
 */
defineOptions({ name: 'AddSlot' });

const props = defineProps<{
  slotKey: SlotKey;
  /** 「+」的无障碍文本与原生提示（行首 / 行尾措辞不同，由宿主给） */
  addPlaceholderTitle?: string;
  /** 所在行是否被悬停：行级悬停也让「+」显现，避免必须精确指到按钮上 */
  lineHovered?: boolean;
  /** 本行是否为当前活动落点行：只转达这个事实，撑开尺寸与虚线边框都由外壳给出（见 SlotShell） */
  isDropLine?: boolean;
  /** 本槽位是否为当前拖拽落点 */
  isDropTarget?: boolean;
  /** 本槽位是否为选器和弦面板的当前目标 */
  isPickerTarget?: boolean;
}>();

/** 无障碍文本：本槽没有字符，只表达「在这里加一个边缘和弦」 */
const ADD_SLOT_ARIA_LABEL = '添加边缘和弦槽位';

const addButtonEl = useTemplateRef<{ $el: HTMLButtonElement }>('addButtonEl');

/**
 * 「+」是否应常驻可见：所在行被悬停、或本行是当前活动落点行（行级条件，仍取自 props）。
 * 槽级条件（本槽被 hover / 聚焦）不在这里——它由 group-hover / group-focus-within 表达，
 * 见模板里「+」的注释与 SlotShell 的组件说明。
 * 收敛成函数是为了让「行级条件不满足」那一档也能被样式命中：触屏没有 hover，该按钮默认
 * opacity-0 就等于「行首行尾可以加和弦」这件事完全不可发现，需在 (hover: none) 下让它常驻
 * 半透明可见（见「+」上挂在 .add-slot-idle 的变体）。
 */
const isLineVisible = (): boolean => Boolean(props.lineHovered) || Boolean(props.isDropLine);

/**
 * 焦点进入槽本体（而非槽内按钮）时把焦点转交给「+」按钮。
 * 判据用「target 自身带 data-slot-key」：该属性只挂在槽根元素上（拖拽系统同样按它寻址），
 * 因此等价于「焦点确实落在槽本体」；鼠标点击或槽内按钮间移动时不得重聚焦，否则会把焦点拉回按钮。
 */
const handleFocusIn = (e: FocusEvent) => {
  if (!(e.target as HTMLElement).hasAttribute('data-slot-key')) return;
  nextTick(() => addButtonEl.value?.$el.focus());
};
</script>
