<template>
  <!-- 整块模式：富文本插槽，或纯文本强制整段滚动（alwaysRoll）。rollKey 变化时整块翻滚 -->
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

/**
 * BaseRollingText 翻页文本（逐字符 / 整块 合一）。
 *
 * - 逐字符模式（默认）：text 为纯字符串，文本变化时仅内容变化的字符做「旧字上滑离场、新字自下滑入」，
 *   未变化的字符保持静止；文本长度变化时新增/移除字符走普通进出场。
 * - 整块模式：提供默认插槽（富文本，如 v-chord-name 和弦名）或开启 alwaysRoll 时启用，
 *   将整段内容作为一块，rollKey（或 text）变化时整体翻滚。适于无法用字符串逐字表达的标签。
 *
 * 外观由宿主 class/attrs 控制（字号、颜色、字重、对齐等）；组件自身保证窗口的垂直居中与裁切。
 * prefers-reduced-motion 下退化为直接切换。
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
const blockMode = computed(() => !!slots['default'] || props.alwaysRoll === true);

/** 逐字符模式的字符单元：key 是跨文本变化的稳定标识，供窗口 span 复用（未变字符不重挂、不翻页） */
interface RollCell {
  key: number;
  char: string;
}

/**
 * 字符单元序列：text 变化时按「公共前缀 + 公共后缀」对齐新旧字符。
 * 关键约束：窗口 span 的 key 必须跨变化**稳定**，翻页动画靠内层 Transition 以字符值为 key
 * 触发——窗口一旦重挂载（新 key），内层是初始渲染，不会播翻页。因此：
 *  - 前后缀匹配的字符沿用旧 cell（key 与字符都不变 → 窗口与内容双静止）；
 *  - 中间变化的字符**按位复用旧 cell 的 key**、只替换字符 → 外层窗口不重挂，内层 key 变化 → 翻页；
 *  - 中间多出的新槽位（长度增长）才分配新 key（新窗口初始渲染，内容直接出现，不翻页）。
 * 这样「9/30 → 10/30」里首槽 '9'→'1' 翻页，"/30" 原位静止；按下标对位的写法会让整体右移、
 * 未变字符集体错位翻滚，而「变化字符给全新 key」的写法会让窗口重挂、什么都不翻。
 */
const cells = ref<RollCell[]>([]);
let nextCellKey = 0;

watch(
  () => props.text ?? '',
  next => {
    const newChars = Array.from(next);
    const old = cells.value;

    // 公共后缀：从两端末尾逐字比较（长度变化时后缀通常不变，先算它才能锁住尾段）
    let suffixLen = 0;
    while (
      suffixLen < old.length &&
      suffixLen < newChars.length &&
      old[old.length - 1 - suffixLen]!.char === newChars[newChars.length - 1 - suffixLen]!
    ) {
      suffixLen++;
    }
    // 公共前缀：不得越过公共后缀（全等时二者相接，不重叠）
    let prefixLen = 0;
    while (
      prefixLen < old.length - suffixLen &&
      prefixLen < newChars.length - suffixLen &&
      old[prefixLen]!.char === newChars[prefixLen]!
    ) {
      prefixLen++;
    }

    const keptPrefix = old.slice(0, prefixLen);
    const keptSuffix = old.slice(old.length - suffixLen);
    const oldMiddle = old.slice(prefixLen, old.length - suffixLen);
    const inserted: RollCell[] = newChars.slice(prefixLen, newChars.length - suffixLen).map((char, i) =>
      // 有旧槽位就复用其 key（同窗口内换字 → 内层翻页）；多出的才是全新槽位
      i < oldMiddle.length ? { key: oldMiddle[i]!.key, char } : { key: nextCellKey++, char }
    );

    cells.value = [...keptPrefix, ...inserted, ...keptSuffix];
  },
  { immediate: true, flush: 'pre' }
);

/** 整块过渡 key：rollKey 优先，回退到 text，确保始终为合法 PropertyKey */
const blockKey = computed<PropertyKey>(() => props.rollKey ?? props.text ?? '');

/** 进出场时长（秒），供内联 style 注入过渡时长 */
const durationSec = computed(() => `${(props.duration ?? 200) / 1000}s`);
</script>

<style scoped>
/* 过渡类名无法用 Tailwind 表达（Transition 进出场状态类）；窗口/字符静态样式已内联为工具类 */
.br-roll-enter-active,
.br-roll-leave-active {
  transition:
    transform var(--br-duration, 0.2s) cubic-bezier(0.33, 0, 0.2, 1),
    opacity var(--br-duration, 0.2s) cubic-bezier(0.33, 0, 0.2, 1);
}

/* 新内容自下滑入；旧内容绝对定位叠在原位向上滑出，两者同时进行形成翻页 */
.br-roll-enter-from {
  transform: translateY(110%);
  opacity: 0;
}

.br-roll-leave-active {
  position: absolute;
  inset: 0;
}

.br-roll-leave-to {
  transform: translateY(-110%);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .br-roll-enter-active,
  .br-roll-leave-active {
    transition: none;
  }
}
</style>
