<template>
  <!-- 整块模式：富文本插槽，或纯文本强制整段滚动（alwaysRoll）。rollKey 变化时整块翻滚。
       翻页过渡的类名规则（.br-roll-*）在全局 transitions.scss，不在此组件——滚动气泡读数
       （v-scrollbar 内的纯 DOM 节点，没有 Vue 实例）按帧手工切同一组类，故 CSS 收在全局唯一来源 -->
  <span
    v-if="blockMode"
    :style="{ '--br-duration': durationSec }"
    class="relative inline-flex items-center overflow-hidden leading-none whitespace-nowrap"
  >
    <Transition name="br-roll">
      <span :key="blockKey" class="inline-flex items-center"
        ><slot>{{ text }}</slot></span
      >
    </Transition>
  </span>
  <!-- 逐字符模式：纯文本，仅内容变化的字符翻页，未变位保持静止。
       窗口 key 来自字符单元的稳定标识（前缀/后缀对齐），而非数组下标——
       长度变化时（如 9/30 → 10/30）未变化的字符必须保持原 key 静止，
       按下标对位会让整段字符集体错位翻滚 -->
  <span v-else aria-live="polite" class="inline-flex items-center leading-none select-none">
    <span
      v-for="cell in cells"
      :key="cell.key"
      class="relative inline-block overflow-hidden leading-none whitespace-pre"
    >
      <Transition name="br-roll">
        <span :key="cell.char" :style="{ '--br-duration': durationSec }" class="inline-block">{{ cell.char }}</span>
      </Transition>
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed, ref, useSlots, watch } from 'vue';

import { alignRollCells } from '@/platform/utils/motion';

import type { RollCell } from '@/platform/utils/motion';

/**
 * BaseRollingText 翻页文本（逐字符 / 整块 合一）。
 *
 * - 逐字符模式（默认）：text 为纯字符串，文本变化时仅内容变化的字符做「旧字上滑离场、新字自下滑入」，
 *   未变化的字符保持静止；文本长度变化时新增/移除字符走普通进出场。
 * - 整块模式：提供默认插槽（富文本，如 v-chord-name 和弦名）或开启 alwaysRoll 时启用，
 *   将整段内容作为一块，rollKey（或 text）变化时整体翻滚。适于无法用字符串逐字表达的标签。
 *
 * 外观由宿主 class/attrs 控制（字号、颜色、字重、对齐等）；组件自身保证窗口的垂直居中与裁切。
 * 翻页过渡的类名规则（.br-roll-*）在全局 transitions.scss——它同时服务滚动气泡读数，
 * 那里没有 Vue 实例、按帧手工切类驱动同一组规则，故不放组件 scoped。
 * prefers-reduced-motion 下退化为直接切换（由 main.scss 的全局规则兜住）。
 */
const props = defineProps<{
  /** 纯文本模式：提供时逐字符翻页；整块模式下作为插槽缺省内容 */
  text?: string;
  /**
   * 整块翻滚触发键：变化时整块重挂载并播放过渡。
   * 富文本插槽模式建议必填（或回退到 text）；纯文本 alwaysRoll 模式可省略（回退到 text）。
   */
  rollKey?: PropertyKey;
  /**
   * 始终整段滚动：开启后把整段文本当作「全部变化」来翻页，不逐字比较。
   * 有富文本插槽时本属性无意义（整块始终滚动）。
   */
  alwaysRoll?: boolean;
  /** 单字符/块翻滚时长（毫秒），默认 200 与普通逐字符滚动一致 */
  duration?: number;
}>();

const slots = useSlots();
/** 整块模式：提供了富文本插槽，或显式要求整段滚动 */
const blockMode = computed(() => Boolean(slots['default']) || props.alwaysRoll === true);

/** 逐字符模式的字符单元序列：对位算法与滚动气泡读数共用（规则见 alignRollCells 的注释），
 *  本组件只负责把结果喂给响应式 cells——Vue 侧的翻页由 <Transition name="br-roll"> 驱动 */
const cells = ref<RollCell[]>([]);
/** 新槽位的 key 游标：alignRollCells 保持无状态，游标由各消费者实例持有 */
let nextCellKey = 0;

watch(
  () => props.text ?? '',
  next => {
    const aligned = alignRollCells(cells.value, next, nextCellKey);
    cells.value = aligned.cells;
    nextCellKey = aligned.nextKey;
  },
  { immediate: true, flush: 'pre' }
);

/** 整块过渡 key：rollKey 优先，回退到 text，确保始终为合法 PropertyKey */
const blockKey = computed<PropertyKey>(() => props.rollKey ?? props.text ?? '');

/** 进出场时长（秒），供内联 style 注入过渡时长 */
const durationSec = computed(() => `${(props.duration ?? 200) / 1000}s`);
</script>
