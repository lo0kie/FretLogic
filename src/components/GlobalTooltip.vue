<template>
  <div class="relative inline-block w-full" @mouseenter="show = true" @mouseleave="show = false">
    <slot></slot>

    <Transition name="tooltip">
      <div
        v-if="show && content"
        class="tooltip-box absolute whitespace-nowrap px-3 py-1.5 font-black rounded-lg z-[100] text-xs shadow-xl pointer-events-none"
        :class="[
          placement === 'top' ? 'bottom-full left-1/2 -translate-x-1/2 mb-2' : '',
          placement === 'bottom' ? 'top-full left-1/2 -translate-x-1/2 mt-2' : '',
          placement === 'left' ? 'right-full top-50% -translate-y-50% mr-2' : '',
          placement === 'right' ? 'left-full top-50% -translate-y-50% ml-2' : '',
        ]"
      >
        {{ content }}
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

withDefaults(
  defineProps<{
    content?: string;
    placement?: 'top' | 'bottom' | 'left' | 'right';
  }>(),
  {
    placement: 'top',
  }
);

const show = ref(false);
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

.tooltip-box {
  // 🌟 反转换肤系统：提示框采用黑底白字，暗色下白底黑字，完美承接原生变量的反转映射
  background-color: #0f172a;
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.1);

  :global(.dark) & {
    background-color: #f8fafc;
    color: #0f172a;
    border-color: rgba(15, 23, 42, 0.05);
  }
}

// 🌟 核心纠错：干掉多余的横杠，让 Less 完美编译出 Vue 能够精准识别的标准动画钩子
.tooltip {
  & -enter-active {
    // 弹性激起
    transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  & -leave-active {
    // 标准淡出：完美接入系统级缓动曲线
    transition: all 0.15s @bezier-standard;
  }

  & -enter-from,
  & -leave-to {
    opacity: 0;
    transform: scale(0.92) translateY(4px); // 🌟 体验升级：让提示框带有优雅的缩放和气流上浮感
  }
}
</style>
