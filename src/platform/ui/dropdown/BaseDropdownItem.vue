<template>
  <button
    v-wave="{ disabled }"
    :disabled
    :role
    :title
    :aria-selected="active"
    :class="[
      BASE_ROW_CLASS,
      sizeClasses,
      active ? ACTIVE_CLASS : highlighted ? HIGHLIGHT_CLASS : WEIGHT_ASSET_CLASS(fontBlack),
      { [DISABLED_CLASS]: disabled },
    ]"
    :tabindex="disabled ? -1 : 0"
    @click="handleSelect()"
    data-focusable-outline
    ref="rootRef"
    type="button"
  >
    <slot name="leading" />
    <span class="flex min-w-0 flex-1 items-center justify-between gap-2"><slot /></span>
    <slot name="trailing" />
  </button>
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from 'vue';

import { CONTROL_HEIGHT_CLASSES } from '@/platform/ui/controlSizes';
import { ITEM_TEXT_CLASSES } from '@/platform/ui/dropdown/dropdownPanelHeight';

import type { ControlSize } from '@/platform/ui/controlSizes';

/**
 * 通用的"下拉/列表行"外壳：为下拉选项（BaseSelector）与搜索结果行（BaseInput）抽出的共享项。
 * 统一承担一行的布局（leading 前缀 + 主内容区 + trailing 后缀的左右两段）、行高档位、
 * 默认悬停高亮、瞬态光标高亮（highlighted）、持久选中高亮（active）、禁用态，
 * 以及「点击即选（含按钮原生 Enter/Space）」的交互。
 * 两处消费方只管填内容与选中回调，行壳视觉与交互完全一致。
 *
 * 三档层级（由弱到强，互斥渲染）：
 *   ① 未命中任何态 → 透明（悬停时走 CSS 的 hover 基底弱背景）
 *   ② highlighted  → 中性面板悬停底色（键盘光标 / 指针划过）
 *   ③ active       → 主题 tint + 主题色文字（持久选中，压过 ①②）
 *
 * 布局口径：主内容区是 flex-1 且内部 justify-between，因此主内容自身可以是「左项 + 右项」的两列
 * （搜索结果行的左边和弦名 + 右边徽标），也能是单个文本（下拉选项）。leading/trailing 均为固定宽，
 * leading 在最左、trailing 靠主内容区的弹性被推到最右。
 */
const props = withDefaults(
  defineProps<{
    /** 是否处于激活/选中态：统一渲染主题色高亮（区别于默认悬停的弱背景） */
    active?: boolean;
    /** 瞬态光标高亮：键盘导航 / 指针划过所指向的那一行。
     *  与 active 分离的原因：active 是「持久选中」（选择器里已选中的选项、搜索结果里正在编辑的和弦），
     *  而光标只是路过。两者若共用同一档视觉，划过一行就会与真正选中的那行长得一模一样。 */
    highlighted?: boolean;
    /** 禁用：行不可交互并淡显 */
    disabled?: boolean;
    /** 原生 title/悬停提示 */
    title?: string;
    /** 尺寸档位：同时决定行高（CONTROL_HEIGHT_CLASSES）与字号（ITEM_TEXT_CLASSES），默认 md */
    size?: ControlSize;
    /** 未激活项是否加重为 font-black（沿用 selector 的 fontBlackItems 语义），默认 font-bold */
    fontBlack?: boolean;
    /** 无障碍 role，默认 'option'（供 listbox 语义下拉项使用） */
    role?: string;
  }>(),
  {
    active: false,
    disabled: false,
    highlighted: false,
    title: undefined,
    size: 'md',
    fontBlack: false,
    role: 'option',
  }
);

const emit = defineEmits<{
  (e: 'select'): void;
}>();

defineSlots<{
  leading?: () => unknown;
  default?: () => unknown;
  trailing?: () => unknown;
}>();

/** 行的固定布局骨架：与原始 BaseSelector 下拉项一致的权威样式（含恒有悬停基底）；
 *  行高与字号不在此写死，改由 sizeClasses 按 size 承担（字号见 ITEM_TEXT_CLASSES）；
 *  全项默认加粗（font-bold），②highlighted / ③active 以 important 叠加各自底色 */
const BASE_ROW_CLASS =
  'flex min-w-0 shrink-0 cursor-pointer items-center justify-between gap-2xs rounded-md bg-transparent px-2.5 text-fg-body transition-colors outline-none hover:bg-surface-panel-hover hover:text-fg-title';
/** 激活/选中高亮：始终 font-bold + 主题 tint 背景（important 压过悬停基底） */
const ACTIVE_CLASS = 'bg-tint-primary-88! font-bold text-primary!';
/** 瞬态光标高亮：中性面板悬停底色（与 hover 基底同一取值，故划过与键盘移动视觉连续）。
 *  刻意不用主题色——主题色留给 active 的持久选中，光标一旦同色就会与「已选中」混淆 */
const HIGHLIGHT_CLASS = 'bg-surface-panel-hover! text-fg-title';
/** 未激活项的字重：默认 font-bold，fontBlack 时加重为 font-black（沿用 selector 的 fontBlackItems 语义） */
const WEIGHT_ASSET_CLASS = (fontBlack: boolean) => (fontBlack ? 'font-black' : 'font-bold');
/** 禁用态：纯块点击失效并淡显（沿袭原 div 的 pointer-events-none 语义，禁用时悬停基底不生效） */
const DISABLED_CLASS = 'pointer-events-none cursor-not-allowed opacity-40';

/** 尺寸档位：行高（CONTROL_HEIGHT_CLASSES）+ 字号（ITEM_TEXT_CLASSES）。两者都由 size 驱动，
 *  故 size 一变行高与文字一起变，且字号与 BaseSelector 触发器共用同一份，不各记一处 */
const sizeClasses = computed(() => [
  CONTROL_HEIGHT_CLASSES[props.size] ?? CONTROL_HEIGHT_CLASSES.md,
  ITEM_TEXT_CLASSES[props.size] ?? ITEM_TEXT_CLASSES.md,
]);

/** 点击/回车/空格统一点击 select：按钮原生 Enter/Space 即触发 click，无需额外 keydown 绑定 */
const handleSelect = () => void emit('select');

const rootRef = useTemplateRef<HTMLElement>('rootRef');
/** 暴露根按钮元素，供下拉键盘导航 / 滚动定位时直接调用 focus()、getBoundingClientRect() 等原生能力 */
defineExpose({ root: rootRef });
</script>
