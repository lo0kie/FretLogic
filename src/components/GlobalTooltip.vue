<template>
  <div class="relative inline-block w-full" @mouseenter="show = true" @mouseleave="show = false">
    <slot></slot>

    <Transition name="tooltip-native">
      <div
        v-if="show && content"
        class="tooltip-box absolute whitespace-nowrap px-3 py-1.5 font-black rounded-lg z-[3000] text-xs shadow-xl pointer-events-none dark:bg-[#f8fafc] dark:text-[#0f172a] dark:border-[#0F172A]"
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
  // 🌟 回归最稳定的绝对定位坐标系，确保身位绝不脱离按钮
  position: absolute;
  background-color: #0f172a;
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.1);

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

  transition: all 0.25s @bezier-standard;
}

.tooltip-native-enter-active,
.tooltip-native-leave-active {
  transition: all 0.25s @bezier-standard;
}

.tooltip-native-enter-from,
.tooltip-native-leave-to {
  opacity: 0;
}

.tooltip-native-enter-from[data-placement='top'],
.tooltip-native-leave-to[data-placement='top'] {
  transform: translateX(-50%) translateY(6px) scale(0.92) !important;
}

.tooltip-native-enter-from[data-placement='bottom'],
.tooltip-native-leave-to[data-placement='bottom'] {
  transform: translateX(-50%) translateY(-6px) scale(0.92) !important;
}
</style>
