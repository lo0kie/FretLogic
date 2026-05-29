<template>
  <div class="relative inline-block w-full" @mouseenter="show = true" @mouseleave="show = false">
    <slot></slot>

    <Transition name="tooltip-native">
      <div
        v-if="show && content"
        class="tooltip-box absolute whitespace-nowrap px-3 py-1.5 font-black rounded-lg z-[3000] text-xs shadow-xl pointer-events-none"
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
  { placement: 'top' }
);

const show = ref(false);
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

.tooltip-box {
  background-color: #0f172a;
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: @transition-base;

  /* 深色模式下的 tooltip 配色反转 */
  :global(.dark) & {
    background-color: #f8fafc;
    color: #0f172a;
    border-color: #0f172a;
  }

  &[data-placement='top'] {
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: @space-sm;
  }
  &[data-placement='bottom'] {
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-top: @space-sm;
  }
  &[data-placement='left'] {
    right: 100%;
    top: 50%;
    transform: translateY(-50%);
    margin-right: @space-sm;
  }
  &[data-placement='right'] {
    left: 100%;
    top: 50%;
    transform: translateY(-50%);
    margin-left: @space-sm;
  }
  &[data-placement='bottom-end'] {
    top: 100%;
    right: 0;
    margin-top: @space-sm;
  }
}
</style>
