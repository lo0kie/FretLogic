<template>
  <div class="scroll-container flex-1 overflow-y-auto no-scrollbar p-4 flex flex-col gap-4">
    <RightFretSlider />
    <RightCapoWheel />
    <RightHelper />
  </div>
</template>

<script setup lang="ts">
import RightCapoWheel from './RightCapoWheel.vue';
import RightFretSlider from './RightFretSlider.vue';
import RightHelper from './RightHelper.vue';
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
