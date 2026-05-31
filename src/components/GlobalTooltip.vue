<template>
  <div ref="referenceRef" class="relative inline-block" @mouseenter="show = true" @mouseleave="show = false">
    <slot></slot>

    <Teleport to="body">
      <Transition name="tooltip-native">
        <div
          v-if="show && content"
          ref="floatingRef"
          class="tooltip-box fixed px-3 py-1.5 font-black rounded-lg text-xs shadow-xl pointer-events-none"
          :style="floatingStyles"
          v-html="safeHtmlContent"
        ></div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/vue';
import { computed, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    content?: string;
    placement?: 'top' | 'bottom' | 'left' | 'right' | 'bottom-end';
  }>(),
  { placement: 'top' }
);

const show = ref(false);

const referenceRef = ref<HTMLElement | null>(null);
const floatingRef = ref<HTMLElement | null>(null);

// 🌟 核心修复 2：实现极客级数据脱水清洗计算属性
// 🌟 无论上层传进来的是真正的换行符、被转义的 \\n、还是原生字符串，强行全量替换为标准的 HTML <br /> 标签
const safeHtmlContent = computed(() => {
  if (!props.content) return '';
  return props.content
    .replace(/\\n/g, '<br />') // 拦截并修复被编译器误转义的 '\\n' 字符串
    .replace(/\n/g, '<br />'); // 捕获标准的原生换行符
});

const { floatingStyles } = useFloating(referenceRef, floatingRef, {
  placement: computed(() => props.placement),

  whileElementsMounted: (reference, floating, update) => {
    return autoUpdate(reference, floating, update);
  },

  middleware: [offset(8), flip({ fallbackAxisSideDirection: 'start' }), shift({ padding: 6 })],
});
</script>

<style scoped lang="less">
.tooltip-box {
  background-color: #0f172a;
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.1);
  z-index: 9999;
  transition: opacity 0.12s ease-out;

  /* 🌟 核心修复 3：因为改用了原生 <br />, 样式表回归最干净、最稳定的标准非折行形态 */
  white-space: nowrap;

  /* 🌟 极致多行排版润色 */
  line-height: 1.6; /* 稍微拉开多行文本的行高阻尼，消除紧凑感 */
  text-align: center; /* 居中对齐换行后的文本，视觉重心更稳固 */
}

.tooltip-native-enter-active,
.tooltip-native-leave-active {
  transition: opacity 0.12s ease-out;
}
.tooltip-native-enter-from,
.tooltip-native-leave-to {
  opacity: 0 !important;
}
</style>
