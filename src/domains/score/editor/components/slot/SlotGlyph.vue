<template>
  <span
    :class="[
      { 'group-hover:text-primary': !isDragActive },
      isSeparator ? 'font-normal text-fg-muted' : 'font-semibold text-fg-title',
    ]"
    class="char-text mt-auto inline-flex min-h-[calc(1.15rem*var(--score-font-scale,1))] items-center justify-center px-0.5 text-[calc(var(--score-font-scale,1)*0.875rem)]/[1.15rem] whitespace-pre transition-all duration-fast"
  >
    {{ glyph }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/**
 * 槽的字符层：谱面里「一个槽位」底部那一行字形的唯一实现。
 *
 * 与外壳（SlotShell）的分工：外壳管槽的盒子——骨架、内外布局、状态类、共有事件与落点视觉；
 * 字符归本组件，外壳不认识字符（不接收 char、也不判断要不要留白）。两者互不 import：
 * 用得到字形的槽（瘦槽位 / 和弦槽）把本组件放进外壳的 `#char` 位，这就是组装关系。
 *
 * 不传 char 时渲染空字形、但占住同一行高度：行首 / 行尾的边缘槽靠它与字符槽等高对齐。
 * 高度取自同一个 min-h，故随 --score-font-scale 同步缩放（此前边缘槽由宿主侧的伪元素写死
 * 1.15rem，字号放大后比字符槽矮一截）。挂载即代表「这一行要占位」，没有额外开关——
 * 不想要这一行的槽（如添加槽）不挂本组件即可。
 *
 * 贴底（mt-auto）与 hover 染色（依赖外壳根上的 .group）都是这一行的固有行为，故留在本组件；
 * `|` 是歌词里的换行分隔符，视觉上当标点而非正文字，降为常规字重 + 次级色。
 */
defineOptions({ name: 'SlotGlyph' });

const props = defineProps<{
  /** 槽内字符（含空格与 `|` / `｜` 分隔符）；不传则渲染空字形，只占住字符行高度 */
  char?: string;
  /** 全局拖拽中：抑制字形 hover 染色，避免与落点边框抢注意力。
   *  这个事实的源头在槽外壳——它经 #char 插槽参数下发，宿主原样转交即可，不必自己再取一遍 */
  isDragActive?: boolean;
}>();

/** 字形：空格用不换行空格撑宽（普通空格会被折叠）；无字符时为空串，但 min-h 仍在 */
const glyph = computed(() => {
  if (props.char === undefined) return '';
  return props.char === ' ' ? '\u00A0' : props.char;
});

/** 歌词换行分隔符：视觉上当标点处理 */
const isSeparator = computed(() => props.char === '|' || props.char === '｜');
</script>
