<template>
  <div
    class="panel-left h-[calc(100vh-24px)] flex flex-col shrink-0 relative rounded-xl z-10 box-content"
    :style="{
      width: uiStore.isLeftOpen ? '335px' : '0px',
      opacity: uiStore.isLeftOpen ? 1 : 0,
      margin: uiStore.isLeftOpen ? '12px' : '12px 0',
    }"
  >
    <LeftHeader />
    <LeftGroupList />
    <LeftFooter />
  </div>

  <button
    @click="uiStore.isLeftOpen = !uiStore.isLeftOpen"
    class="sidebar-toggle-btn-left text-[9px] font-black"
    :style="{ left: uiStore.isLeftOpen ? '347px' : '0px' }"
  >
    {{ uiStore.isLeftOpen ? '◀' : '▶' }}
  </button>
</template>

<script setup lang="ts">
import { useUiStore } from '@/stores/uiStore';
import LeftFooter from '@/views/sidebar-left/LeftFooter.vue';
import LeftGroupList from '@/views/sidebar-left/LeftGroupList.vue';
import LeftHeader from '@/views/sidebar-left/LeftHeader.vue';

const uiStore = useUiStore();
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

.panel-left {
  .mixin-panel-base();

  transition:
    width @duration-slow @bezier-standard,
    opacity @duration-base ease,
    margin @duration-slow @bezier-standard;
}

.sidebar-toggle-btn-left {
  .mixin-sidebar-toggle();
  border-radius: 0 10px 10px 0;
  transform: translateY(-50%) scale(1);
  transform-origin: left;
  transition:
    all 0.2s ease,
    left @duration-slow @bezier-standard;
  &:active {
    transform: translateY(-50%) scale(0.93);
  }
}
</style>
