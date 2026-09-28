<template>
  <!-- 指向式气泡（平台 UI 原语）：一枚药丸面板 + 指向锚点的箭头，自带进出场过渡与按压波纹。
       **刻意不含定位**：锚点坐标、跟随锚点移动的位移过渡、内容语义与点击行为全归调用方 ——
       气泡只负责「长什么样、怎么进出、怎么被按、别把指针事件漏给下面的宿主」。
       ⚠️ 箭头必须由本组件渲染成面板的**直接子节点**（剪影层靠 parentElement 认领宿主），面板也不得裁剪。 -->
  <!-- 入场**总是**播（静态无值 appear）：气泡所在的整棵子树常随「显示」挂载 / 卸载（指板横按气泡就是，
       它的定位容器带 v-if），挂载那一次渲染里面板已经在了 —— 入场只能由 appear 播出来，
       关掉它这些场景就只剩硬闪。刻意不绑成一个开关：目前没有「挂载即静默出现」的调用方。
       ⚠️ 不要写成 `:appear` —— 那是 `:appear="appear"` 的简写，绑的是个 prop 而不是「恒真」，
       默认值一旦是 false，入场动画会静默消失（抽成组件时踩过一次）。 -->
  <Transition @after-leave="emit('after-leave')" appear name="anchor-bubble">
    <div
      v-auto-width
      v-if="visible"
      v-wave="waveOptions"
      :aria-disabled="disabled || undefined"
      :class="[
        disabled ? 'pointer-events-none cursor-default' : 'pointer-events-auto cursor-pointer',
        'group relative flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold whitespace-nowrap transition-[background-color,border-color,box-shadow] duration-fast',
      ]"
      @click.stop
      @mousedown.prevent.stop
      @pointerdown.prevent.stop
      @pointermove.stop
    >
      <slot />
      <BaseArrowPanel :side :size="arrowSize" />
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import BaseArrowPanel from '@/platform/ui/popover/BaseArrowPanel.vue';
import { ARROW_PANEL_SIZE } from '@/platform/ui/popover/arrowPanel';

import type { ArrowSide } from '@/platform/ui/popover/arrowPanelPath';

/**
 * 指向式气泡：内容由默认插槽给，外观两态（如「已标记 / 未标记」）由调用方经 class 透传。
 *
 * 与 `BasePopover` / `BaseFloatingPanel` 的分工：那两个管的是「浮层生命周期」（开关、外点关闭、
 * 定位与翻转、焦点与滚动锁）；本组件只管一枚**贴锚点的小气泡**——它没有开关状态机
 *（`visible` 由调用方给，进出场只做过渡）、不接管定位、也不锁任何东西。
 *
 * 指针事件刻意**就地掐断**（`prevent` + `stop`）：气泡浮在可交互内容之上，按下/点击若漏到宿主，
 * 会连带触发宿主的选中、拖拽或点选 —— 这是「气泡」这一形态的固有需求，不是某个调用方的偏好。
 * 调用方自己的 `@click` 等监听经 attrs 透传到同一元素上，与这里的处理**并存**（Vue 会合并同元素的监听），
 * 故 `stop` 不会吞掉调用方的回调。
 *
 * 按压波纹（`v-wave`）归本组件所有，见 `waveOptions` 的说明。
 */
const props = withDefaults(
  defineProps<{
    /** 是否显示；进出场过渡由本组件驱动，定位与位移仍归调用方 */
    visible: boolean;
    /** 箭头边长（px），透传给剪影层；同时决定波纹容器的裁剪外扩量（见 waveOptions） */
    arrowSize?: number;
    /** 箭头指向：气泡贴在锚点的哪一侧（默认向下 = 气泡在锚点上方） */
    side?: ArrowSide;
    /** 禁用态：不接收指针事件、不播波纹。**只管交互不管外观**——是否变灰由调用方经 class 决定 */
    disabled?: boolean;
    /** 是否启用按压波纹（默认开）；置假即把波纹的 disabled 置真，调用方不必去摘指令 */
    wave?: boolean;
  }>(),
  { arrowSize: ARROW_PANEL_SIZE, side: 'bottom', disabled: false, wave: true }
);

/** 离场过渡结束（离场元素已摘除）——调用方据此回收「气泡仍挂载」这类状态 */
const emit = defineEmits<{ (e: 'after-leave'): void }>();

/**
 * 传给 `v-wave` 的选项：**裁剪外扩量由本组件自己算**。
 *
 * ① 箭尖越出面板 **border-box** 底边 `arrowSize/√2`（楔形底边就落在 border-box 边上）；
 * ② 波纹容器自宿主 border-box 起算（补丁按 border-box 撑开，见 patches/v-wave.patch），
 *    故容器底边要往下放开同样多才罩得住箭头，向上取整留出抗锯齿余量。
 *
 * 这段推导原先写在调用方（`useBarreBubble` 的 `barreWaveClip`），等于把「本组件的箭头有多凸」
 * 这件私事抄了一份到外面 —— 箭头尺寸一改就得同步两处，而尺寸本来就是本组件的 prop。
 *
 * **裁剪形状仍不在这里**：只放开一个矩形会让波纹在箭头左右也可见，真正的轮廓由剪影层挂到面板上的
 * `--arrow-panel-clip` 给出（面板 + 箭头一条非凸曲线），补丁优先按它裁 —— 所以这里只需要「放开多少」。
 *
 * 禁用态与「不要波纹」合并进同一个 `disabled`：v-wave 在 disabled 时**根本不建容器**
 * （`wave()` 首行即 `if (options.disabled) return`），故两者观感上无从区分，也不必区分。
 */
const waveOptions = computed(() => ({
  clip: { bottom: Math.ceil(props.arrowSize / Math.SQRT2) },
  disabled: props.disabled || !props.wave,
}));
</script>

<style scoped lang="scss">
@use '@/assets/token-vars' as *;

/* 进出场过渡。**必须 scoped**：面板自带 Tailwind 的
   transition-[background-color,border-color,box-shadow] 工具类（与下列规则同为单类选择器 (0,1,0)，
   且在样式表中位置更靠后）。scoped 给选择器附加的 [data-v-*] 把特异性提到 (0,2,0) 才能压过它；
   一旦去掉 scoped，opacity + transform 的进出场就会被那个工具类覆盖，气泡动画静默失效。 */
.anchor-bubble-enter-active,
.anchor-bubble-leave-active {
  transition:
    opacity $duration-base $bezier-standard,
    transform $duration-base $bezier-standard;
  will-change: opacity, transform;
}

.anchor-bubble-enter-from,
.anchor-bubble-leave-to {
  transform: translateY(6px);
  opacity: 0;
}

.anchor-bubble-enter-to,
.anchor-bubble-leave-from {
  transform: translateY(0);
  opacity: 1;
}

/* 波纹容器（v-wave 以 JS 创建、不带 scoped 标记，故必须用 :deep 穿透）：
   裁剪形状不归这里管 —— 容器被撑成「气泡盒 + 箭头凸出」，真正的轮廓由剪影层挂到面板上的
   --arrow-panel-clip 给出（补丁优先按它裁：面板 + 箭头是一条非凸曲线，矩形加圆角表达不了）。
   这里只负责把容器抬到剪影层之上：水波要扫过箭头，就必须晚于它绘制；
   靠文档序决定先后太脆，显式层级才稳。 */
:deep([data-v-wave-container-internal]) {
  z-index: 2 !important;
}
</style>
