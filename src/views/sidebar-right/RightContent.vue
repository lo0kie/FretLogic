<template>
  <div class="scroll-container flex-1 overflow-y-auto no-scrollbar p-4 flex flex-col gap-4">
    <RightFretSlider />

    <RightTuningSelector />

    <RightCapoWheel />
    <RightHelper />
  </div>
</template>

<script setup lang="ts">
import RightCapoWheel from '@/views/sidebar-right/RightCapoWheel.vue';
import RightFretSlider from '@/views/sidebar-right/RightFretSlider.vue';
import RightHelper from '@/views/sidebar-right/RightHelper.vue';
import RightTuningSelector from '@/views/sidebar-right/RightTuningSelector.vue'; // 🌟 引入新组件
</script>

<style scoped lang="less">
.scroll-container {
  min-height: 0;
  &.no-scrollbar {
    scrollbar-width: none;
    &::-webkit-scrollbar {
      display: none;
    }
  }
}
</style>
