<template>
  <div
    class="panel-right h-[calc(100vh-24px)] flex flex-col shrink-0 justify-between"
    :class="{ 'is-open': uiStore.isRightOpen }"
  >
    <div class="h-[76px] border-b border-control p-4 flex items-center shrink-0">
      <h2 class="panel-main-title text-sm font-black tracking-widest uppercase text-title">指板配置</h2>
    </div>

    <div class="scroll-container flex-1 overflow-y-auto no-scrollbar p-4 flex flex-col gap-4">
      <RightFretSlider />
      <RightCapoWheel />
      <RightHelper />
    </div>

    <div class="shrink-0">
      <RightPanelFooter />
    </div>
  </div>

  <button
    @click="uiStore.isRightOpen = !uiStore.isRightOpen"
    class="sidebar-toggle-btn sidebar-toggle-btn-right text-[9px] font-black"
    :style="{ right: uiStore.isRightOpen ? '347px' : '0px' }"
  >
    {{ uiStore.isRightOpen ? '▶' : '◀' }}
  </button>
</template>

<script setup lang="ts">
import { useUiStore } from '@/stores/uiStore';
import RightCapoWheel from '@/views/sidebar-right/RightCapoWheel.vue';
import RightFretSlider from '@/views/sidebar-right/RightFretSlider.vue';
import RightHelper from '@/views/sidebar-right/RightHelper.vue';
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
    width 0.35s @bezier-sidebar,
    opacity 0.25s ease,
    margin 0.35s @bezier-sidebar;
  overflow: hidden; // 关键：隐藏溢出部分

  &.is-open {
    width: 335px;
    opacity: 1;
    margin: 12px;
  }
}

.scroll-container {
  min-height: 0; // 关键：在 flex 容器中，必须设置 min-height 才能让子项溢出滚动生效

  // 隐藏滚动条但保留滚动功能
  &.no-scrollbar {
    scrollbar-width: none;
    &::-webkit-scrollbar {
      display: none;
    }
  }
}

.sidebar-toggle-btn {
  .mixin-sidebar-toggle();
  position: absolute; // 确保是绝对定位
  top: 50%;

  // 必须添加 right 的过渡，否则无法跟随面板位移
  transition:
    all 0.2s ease,
    right 0.35s @bezier-sidebar;

  &-right {
    border-radius: 10px 0 0 10px;
    transform: translateY(-50%) scale(1);
    transform-origin: right;

    &:active {
      transform: translateY(-50%) scale(0.93);
    }
  }
}
</style>
