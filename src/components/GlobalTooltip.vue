<template>
  <div class="relative inline-block w-full" @mouseenter="show = true" @mouseleave="show = false">
    <slot></slot>

    <Transition name="tooltip-native">
      <div
        v-if="show && content"
        class="tooltip-box absolute whitespace-nowrap px-3 py-1.5 font-black rounded-lg z-[100] text-xs shadow-xl pointer-events-none dark:bg-[#f8fafc] dark:text-[#0f172a] dark:border-[#0F172A]"
        :data-placement="placement"
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
    placement?: 'top' | 'bottom' | 'left' | 'right' | 'bottom-end';
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
  // ☀️ 浅色模式默认基准
  background-color: #0f172a;
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.1);

  // 🌟 核心剔除：暗色变体交由 HTML 上的 Tailwind 级联管理，此处不再写重叠逻辑

  // ==========================================================================
  // 🧭 大一统定位中心
  // ==========================================================================
  top: auto;
  left: auto;
  right: auto;
  bottom: auto;
  transform: none;

  &[data-placement='top'] {
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 8px;
  }
  &[data-placement='bottom'] {
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-top: 8px;
  }
  &[data-placement='left'] {
    right: 100%;
    top: 50%;
    transform: translateY(-50%);
    margin-right: 8px;
  }
  &[data-placement='right'] {
    left: 100%;
    top: 50%;
    transform: translateY(-50%);
    margin-left: 8px;
  }
  &[data-placement='bottom-end'] {
    top: 100%;
    right: 0;
    margin-top: 8px;
  }

  // 保证平移与颜色都能平滑过渡
  transition: all 0.25s @bezier-standard;
}

// ==========================================================================
// 🌟 Transition 多维阻尼动效中枢
// ==========================================================================
.tooltip-native-enter-active,
.tooltip-native-leave-active {
  transition: all 0.25s @bezier-standard;
}

.tooltip-native-enter-from,
.tooltip-native-leave-to {
  opacity: 0;
}

// A. Top 类型 ➔ 从下往上优雅上浮
.tooltip-native-enter-from[data-placement='top'],
.tooltip-native-leave-to[data-placement='top'] {
  transform: translateX(-50%) translateY(6px) scale(0.92) !important;
}

// B. Bottom 类型 ➔ 从上往下顺滑掉落
.tooltip-native-enter-from[data-placement='bottom'],
.tooltip-native-leave-to[data-placement='bottom'] {
  transform: translateX(-50%) translateY(-6px) scale(0.92) !important;
}

// 侧边栏贴边端 (bottom-end)
.tooltip-native-enter-from[data-placement='bottom-end'],
.tooltip-native-leave-to[data-placement='bottom-end'] {
  transform: translateY(-6px) scale(0.92) !important;
}

// C. Left 类型 ➔ 从右向左弹入
.tooltip-native-enter-from[data-placement='left'],
.tooltip-native-leave-to[data-placement='left'] {
  transform: translateY(-50%) translateX(6px) scale(0.92) !important;
}

// D. Right 类型 ➔ 从左向右滑入
.tooltip-native-enter-from[data-placement='right'],
.tooltip-native-leave-to[data-placement='right'] {
  transform: translateY(-50%) translateX(-6px) scale(0.92) !important;
}
</style>
