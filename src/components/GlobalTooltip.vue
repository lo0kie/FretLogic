<template>
  <div ref="referenceRef" class="relative inline-block" @mouseenter="show = true" @mouseleave="show = false">
    <slot></slot>

    <Teleport to="body">
      <Transition name="tooltip-native">
        <div
          v-if="show && content"
          ref="floatingRef"
          class="tooltip-box fixed whitespace-nowrap px-3 py-1.5 font-black rounded-lg text-xs shadow-xl pointer-events-none"
          :style="floatingStyles"
        >
          {{ content }}
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
// 🌟 修复核心：把 autoUpdate 直接从最顶部标准 import 进来，斩断 require 隐 hidden 炸弹！
import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/vue';

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

const { floatingStyles } = useFloating(referenceRef, floatingRef, {
  placement: computed(() => props.placement),

  // 🌟 修复核心：直接在配置项里调用导出的 autoUpdate 变量，安全、干净且绝对对齐构建流
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
