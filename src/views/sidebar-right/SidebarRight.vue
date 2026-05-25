<template>
  <div
    class="panel-right h-[calc(100vh-24px)] flex flex-col shrink-0 justify-between overflow-hidden"
    :style="{
      width: uiStore.isRightOpen ? '335px' : '0px',
      opacity: uiStore.isRightOpen ? 1 : 0,
      padding: uiStore.isRightOpen ? '24px' : '0px',
      margin: uiStore.isRightOpen ? '12px' : '12px 0',
    }"
  >
    <div class="flex flex-col gap-4 min-w-[287px]">
      <div
        class="h-[76px] border-b border-slate-100 dark:border-slate-800 flex items-center min-w-[287px] -mx-6 px-6 -mt-6 mb-2"
      >
        <h2 class="panel-main-title text-sm font-black tracking-widest uppercase text-title">指板配置</h2>
      </div>

      <RightFretSlider />
      <RightCapoWheel />
      <RightHelper />
    </div>

    <div class="flex flex-col gap-3 min-w-[287px]">
      <div class="grid grid-cols-2 gap-2">
        <ActionButton @click="uiStore.triggerSaveChord()" primary>
          {{ chordLabStore.editingId ? '更新修改' : '保存和弦' }}
        </ActionButton>

        <ActionButton @click="chordLabStore.resetEditor()" :danger="!chordLabStore.editingId" :warning="!!chordLabStore.editingId">
          {{ chordLabStore.editingId ? '放弃本次修改' : '清空指板' }}
        </ActionButton>
      </div>
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
import ActionButton from '@/components/ActionButton.vue';
import { useChordLabStore } from '@/stores/chordLabStore';
import RightCapoWheel from './RightCapoWheel.vue';
import RightFretSlider from './RightFretSlider.vue';
import RightHelper from './RightHelper.vue';
import { useUiStore } from '@/stores/uiStore';

const uiStore = useUiStore();
const chordLabStore = useChordLabStore();
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

.panel-right {
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
    right 0.35s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    color: @brand-primary;
    border-color: rgba(37, 99, 235, 0.25);
    background-color: var(--bg-main);
  }

  &-right {
    border-radius: 10px 0 0 10px;
    transform: translateY(-50%) scale(1);
    transform-origin: right;
    &:active {
      transform: translateY(-50%) scale(0.93);
    }
  }
}

.dark {
  .panel-right {
    box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.14);
  }
  .sidebar-toggle-btn:hover {
    background-color: #1e293b;
  }
}
</style>
