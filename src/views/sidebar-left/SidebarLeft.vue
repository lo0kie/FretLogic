<template>
  <div
    class="panel-left h-[calc(100vh-24px)] flex flex-col shrink-0 relative rounded-xl z-10 box-content"
    :class="{ 'is-open': uiStore.isLeftOpen }"
  >
    <LeftHeader />
    <LeftGroupList />
    <LeftFooter />
  </div>

  <button
    @click="uiStore.isLeftOpen = !uiStore.isLeftOpen"
    class="sidebar-toggle-btn-left"
    :title="uiStore.isLeftOpen ? '收起左侧边栏' : '展开左侧边栏'"
    :class="{ 'is-open': uiStore.isLeftOpen }"
  >
    <Triangle :size="12" fill="currentColor" :style="{ rotate: uiStore.isLeftOpen ? '270deg' : '90deg' }" />
  </button>
</template>

<script setup lang="ts">
import { LEFT_SIDEBAR_WIDTH_PIXEL } from '@/constants';
import { useUiStore } from '@/stores/uiStore';
import LeftFooter from '@/views/sidebar-left/LeftFooter.vue';
import LeftGroupList from '@/views/sidebar-left/LeftGroupList.vue';
import LeftHeader from '@/views/sidebar-left/LeftHeader.vue';
import { Triangle } from '@lucide/vue';

const uiStore = useUiStore();
</script>

<style scoped lang="less">
@import '@/assets/tokens.less';

.panel-left {
  .mixin-panel-base();
  width: 0px;
  opacity: 0;
  margin: 12px 0;
  transition:
    width @duration-slow @bezier-sidebar,
    opacity @duration-base ease,
    margin @duration-slow @bezier-sidebar;

  // 🌟 统一逻辑：脱离行内绑定，拥抱纯 CSS 类名驱动
  &.is-open {
    width: v-bind(LEFT_SIDEBAR_WIDTH_PIXEL);
    opacity: 1;
    margin: 12px;
  }
}

.sidebar-toggle-btn-left {
  .mixin-sidebar-toggle();

  border-radius: 0 10px 10px 0;
  transform: translateY(-50%) scale(1);
  transform-origin: left;
  left: 0px; // 🌟 默认收起时贴紧最左边缘
  transition:
    all 0.2s ease,
    left @duration-slow @bezier-sidebar;

  // 🌟 统一逻辑：动态计算按钮悬浮偏移量（侧边栏宽度 + 12px 外边距）
  &.is-open {
    left: calc(v-bind(LEFT_SIDEBAR_WIDTH_PIXEL) + 13px);
  }

  &:active {
    transform: translateY(-50%) scale(0.93);
  }
}
</style>
