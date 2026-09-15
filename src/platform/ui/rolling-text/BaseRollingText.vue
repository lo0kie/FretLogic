<template>
  <span aria-live="polite" class="inline-flex items-center leading-none select-none">
    <span v-for="(_, i) in chars" :key="i" class="relative inline-block overflow-hidden leading-none whitespace-pre">
      <Transition name="brc-roll">
        <span :key="chars[i]" :style="{ '--brc-duration': durationSec }" class="inline-block">{{ chars[i] }}</span>
      </Transition>
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/**
 * BaseRollingText 逐字符翻页文本。
 * 文本变化时仅内容变化的字符做「旧字上滑离场、新字自下滑入」的翻页过渡，
 * 未变化的字符保持静止；文本长度变化时新增/移除的字符走普通进出场。
 * 宿主通过 class/attrs 控制字号、颜色、字重等外观；组件自身保证字符窗口的
 * 垂直居中与裁切（inline-flex + leading-none + overflow hidden）。
 * prefers-reduced-motion 下退化为直接切换。
 */
const props = defineProps<{
  /** 展示文本；按 Unicode 码点逐字符拆分 */
  text: string;
  /** 单字符翻页时长（毫秒） */
  duration?: number;
}>();

const chars = computed(() => Array.from(props.text));

/** 进出场时长（秒），供内联 style 注入过渡时长 */
const durationSec = computed(() => `${(props.duration ?? 200) / 1000}s`);
</script>

<style scoped>
/* 过渡类名无法用 Tailwind 表达（Transition 进出场状态类），窗口/字符的静态样式已内联为工具类 */
.brc-roll-enter-active,
.brc-roll-leave-active {
  transition:
    transform var(--brc-duration, 0.2s) cubic-bezier(0.33, 0, 0.2, 1),
    opacity var(--brc-duration, 0.2s) cubic-bezier(0.33, 0, 0.2, 1);
}

/* 新字符自下滑入；旧字符绝对定位叠在原位向上滑出，两者同时进行形成翻页 */
.brc-roll-enter-from {
  transform: translateY(110%);
  opacity: 0;
}

.brc-roll-leave-active {
  position: absolute;
  inset: 0;
}

.brc-roll-leave-to {
  transform: translateY(-110%);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .brc-roll-enter-active,
  .brc-roll-leave-active {
    transition: none;
  }
}
</style>
