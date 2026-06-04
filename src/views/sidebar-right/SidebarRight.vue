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
    :title="uiStore.isRightOpen ? '收起右侧边栏' : '展开右侧边栏'"
    :class="{ 'is-open': uiStore.isRightOpen }"
  >
    <Triangle :size="12" fill="currentColor" :style="{ rotate: uiStore.isRightOpen ? '90deg' : '270deg' }" />
  </button>
</template>

<script setup lang="ts">
import { RIGHT_SIDEBAR_WIDTH_PIXEL } from '@/constants';
import { useUiStore } from '@/stores/uiStore';
import RightContent from '@/views/sidebar-right/RightContent.vue';
import RightHeader from '@/views/sidebar-right/RightHeader.vue';
import RightPanelFooter from '@/views/sidebar-right/RightPanelFooter.vue';
import { Triangle } from '@lucide/vue';

const uiStore = useUiStore();
</script>

<style scoped lang="less">
@import '@/assets/tokens.less';

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
    width: v-bind(RIGHT_SIDEBAR_WIDTH_PIXEL);
    opacity: 1;
    margin: 12px;
  }
}

.sidebar-toggle-btn-right {
  .mixin-sidebar-toggle();
  border-radius: 10px 0 0 10px;
  transform: translateY(-50%) scale(1);
  transform-origin: right;
  right: 0px; // 🌟 默认收起时贴紧最右边缘
  transition:
    all 0.2s ease,
    right @duration-slow @bezier-sidebar;

  // 🌟 统一逻辑：动态计算按钮悬浮偏移量（侧边栏宽度 + 12px 外边距）
  &.is-open {
    right: calc(v-bind(RIGHT_SIDEBAR_WIDTH_PIXEL) + 13px);
  }

  &:active {
    transform: translateY(-50%) scale(0.93);
  }
}
</style>
