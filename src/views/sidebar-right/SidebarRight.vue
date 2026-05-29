<template>
  <div
    class="panel-right h-[calc(100vh-24px)] flex flex-col shrink-0 justify-between relative z-10 rounded-xl box-content"
    :class="{ 'is-open': uiStore.isRightOpen }"
  >
    <RightHeader />
    <RightContent />
    <RightPanelFooter />
  </div>

  <button
    @click="uiStore.isRightOpen = !uiStore.isRightOpen"
    class="sidebar-toggle-btn-right text-[9px] font-black"
    :style="{ right: uiStore.isRightOpen ? '347px' : '0px' }"
  >
    {{ uiStore.isRightOpen ? '▶' : '◀' }}
  </button>
</template>

<script setup lang="ts">
import { useUiStore } from '@/stores/uiStore';
import RightContent from '@/views/sidebar-right/RightContent.vue';
import RightHeader from '@/views/sidebar-right/RightHeader.vue';
import RightPanelFooter from '@/views/sidebar-right/RightPanelFooter.vue';

const uiStore = useUiStore();
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

.panel-right {
  .mixin-panel-base();
  width: 0px;
  opacity: 0;
  margin: 12px 0;
  transition:
    width @duration-slow @bezier-sidebar,
    opacity @duration-base ease,
    margin @duration-slow @bezier-sidebar;

  &.is-open {
    width: 335px;
    opacity: 1;
    margin: 12px;
  }
}

.sidebar-toggle-btn-right {
  .mixin-sidebar-toggle();
  border-radius: 10px 0 0 10px;
  transform: translateY(-50%) scale(1);
  transform-origin: right;
  transition:
    all 0.2s ease,
    right @duration-slow @bezier-sidebar;

  &:active {
    transform: translateY(-50%) scale(0.93);
  }
}
</style>
