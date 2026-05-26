<template>
  <div
    class="panel-right h-[calc(100vh-24px)] flex flex-col shrink-0 justify-between overflow-hidden"
    :class="{ 'is-open': uiStore.isRightOpen }"
  >
    <div class="flex flex-col flex-1 min-w-[335px]">
      <div class="h-[76px] border-b border-control p-4 flex items-center">
        <h2 class="panel-main-title text-sm font-black tracking-widest uppercase text-title">指板配置</h2>
      </div>

      <div class="p-4 flex flex-col gap-4">
        <RightFretSlider />
        <RightCapoWheel />
        <RightHelper />
      </div>
    </div>

    <RightPanelFooter />
  </div>

  <button
    @click="uiStore.isRightOpen = !uiStore.isRightOpen"
    class="sidebar-toggle-btn sidebar-toggle-btn-right text-[9px] font-black"
    :class="{ 'is-open': uiStore.isRightOpen }"
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

.border-control {
  border-color: var(--control-border);
}

.panel-right {
  // 🌟 1. 绝对继承：一键混入面板骨架！此时 background-color: var(--bg-panel) 权重安全归位
  .mixin-panel-base();

  // 🌟 2. 默认关闭状态（纯 Less 编写，防止和行内产生死锁）
  width: 0px;
  opacity: 0;
  margin: 12px 0;
  transition:
    width 0.35s @bezier-sidebar,
    opacity 0.25s ease,
    margin 0.35s @bezier-sidebar,
    border-color 0.2s ease; // 连边框变色也一起走标准时钟

  // 🌟 3. 展开状态激活
  &.is-open {
    width: 335px;
    opacity: 1;
    margin: 12px;
  }

  // 🌟 4. 像素级暗色微调：14% 微光空气线
  :global(.dark) & {
    border-color: rgba(255, 255, 255, 0.14);
  }
}

.sidebar-toggle-btn {
  // 🌟 核心复用：提取侧边栏把手通用规范
  .mixin-sidebar-toggle();

  // 按钮默认靠右边缘（关闭时状态）
  right: 0px;

  transition:
    all 0.2s ease,
    right 0.35s @bezier-sidebar;

  &-right {
    border-radius: 10px 0 0 10px;
    transform: translateY(-50%) scale(1);
    transform-origin: right;

    // 当面板打开时，按钮根据状态平移
    &.is-open {
      right: 347px;
    }

    &:active {
      transform: translateY(-50%) scale(0.93);
    }
  }
}
</style>
