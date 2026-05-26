<template>
  <div
    class="panel-left h-[calc(100vh-24px)] flex flex-col shrink-0 relative overflow-hidden z-10"
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
    class="sidebar-toggle-btn sidebar-toggle-btn-left text-[9px] font-black"
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

// 🌟 修正：这里必须是 panel-left
.panel-left {
  .mixin-panel-base();
  transition:
    width 0.35s @bezier-standard,
    opacity 0.25s ease,
    margin 0.35s @bezier-standard;
}

.sidebar-toggle-btn {
  .mixin-sidebar-toggle();
  // 🌟 修正：左侧按钮的轨道位移必须绑定 left
  transition:
    all 0.2s ease,
    left 0.35s @bezier-standard;

  // 🌟 修正：这里必须是 -left
  &-left {
    // 🌟 修正：左侧按钮的圆角是右边圆，左边平
    border-radius: 0 10px 10px 0;
    transform: translateY(-50%) scale(1);
    transform-origin: left; // 🌟 修正：动画缩放基准点在左侧
    &:active {
      transform: translateY(-50%) scale(0.93);
    }
  }
}
</style>
