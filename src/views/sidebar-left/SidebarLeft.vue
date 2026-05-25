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
import LeftFooter from './LeftFooter.vue';
import LeftGroupList from './LeftGroupList.vue';
import LeftHeader from './LeftHeader.vue';

const uiStore = useUiStore();
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

.panel-left {
  background-color: var(--bg-panel);
  border: 1px solid var(--control-border);
  box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.04);
  border-radius: 16px;
  transition:
    width 0.35s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.25s ease,
    margin 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.sidebar-toggle-btn {
  position: absolute;
  top: 50%;
  width: 20px;
  height: 60px;
  background-color: var(--bg-panel);
  border: 1px solid var(--control-border);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  color: #94a3b8;
  cursor: pointer;
  transition:
    all 0.2s ease,
    left 0.35s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    color: @brand-primary;
    border-color: rgba(37, 99, 235, 0.25);
    background-color: var(--bg-main);
  }

  &-left {
    border-radius: 0 10px 10px 0;
    transform: translateY(-50%) scale(1);
    transform-origin: left;
    &:active {
      transform: translateY(-50%) scale(0.93);
    }
  }
}

.dark {
  .panel-left {
    box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.14);
  }
  .sidebar-toggle-btn:hover {
    background-color: #1e293b;
  }
}
</style>
