<template>
  <div
    class="panel-right h-[calc(100%-24px)] flex flex-col shrink-0 justify-between relative z-10 rounded-xl box-border"
    :class="{ 'is-open': uiStore.isRightOpen }"
  >
    <div class="h-[76px] border-b border-[var(--control-border)] p-4 flex items-center shrink-0">
      <h2 class="text-sm font-black tracking-widest uppercase text-title">指板配置</h2>
    </div>

    <div class="scroll-container flex-1 overflow-y-auto no-scrollbar p-4 flex flex-col gap-4">
      <RightFretSlider />
      <RightTuningSelector />
      <RightCapoWheel />
      <RightHelper @pull-request="modals.pullConfirm = true" @push-request="handleManualPush" />
    </div>

    <RightPanelFooter @save="chordService.persistCurrentChord()" @reset="editorStore.resetEditor()" />
  </div>

  <button
    @click="uiStore.isRightOpen = !uiStore.isRightOpen"
    class="sidebar-toggle-btn-right text-[9px] font-black"
    :title="uiStore.isRightOpen ? '收起右侧边栏' : '展开右侧边栏'"
    :class="{ 'is-open': uiStore.isRightOpen }"
  >
    <Triangle :size="12" fill="currentColor" :style="{ rotate: uiStore.isRightOpen ? '90deg' : '270deg' }" />
  </button>

  <BaseModal
    v-model:visible="modals.pullConfirm"
    title="操作确认"
    confirm-type="danger"
    confirm-text="确认"
    @confirm="confirmPull"
  >
    <p class="text-sm font-semibold opacity-80 leading-relaxed text-body">
      从云端拉取数据将<span class="text-[var(--color-danger)] font-black">完全覆盖</span
      >您本地的所有和弦与分组记录，且此操作不可撤销！ <br /><br />您确定要继续吗？
    </p>
  </BaseModal>
</template>

<script setup lang="ts">
import { RIGHT_SIDEBAR_WIDTH_PIXEL } from '@/constants';
import { useChordService } from '@/services/useChordService';
import { useGithubSyncService } from '@/services/useGithubSyncService';
import { useEditorStore } from '@/stores/editorStore';
import { useUiStore } from '@/stores/uiStore';
import { reactive } from 'vue';

// 直接引入原 RightContent 中的核心配置组件
import RightCapoWheel from '@/views/sidebar-right/RightCapoWheel.vue';
import RightFretSlider from '@/views/sidebar-right/RightFretSlider.vue';
import RightHelper from '@/views/sidebar-right/RightHelper.vue';
import RightPanelFooter from '@/views/sidebar-right/RightPanelFooter.vue';
import RightTuningSelector from '@/views/sidebar-right/RightTuningSelector.vue';

import BaseModal from '@/components/BaseModal.vue';
import { Triangle } from '@lucide/vue';

const uiStore = useUiStore();
const editorStore = useEditorStore();
const chordService = useChordService();
const { triggerGlobalSync, pullFromGithub } = useGithubSyncService();

const modals = reactive({
  pullConfirm: false,
});

// ================= 操作调度方法 =================
const handleManualPush = () => {
  triggerGlobalSync();
};

const confirmPull = () => {
  pullFromGithub();
  modals.pullConfirm = false;
};
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
  border-radius: 6px 0 0 6px;
  transform: translateY(-50%) scale(1);
  transform-origin: right;
  right: 0px;
  transition:
    all 0.2s ease,
    right @duration-slow @bezier-sidebar;
  &.is-open {
    right: calc(v-bind(RIGHT_SIDEBAR_WIDTH_PIXEL) + 12px);
  }

  &:active {
    transform: translateY(-50%) scale(0.93);
  }
}

.text-title {
  color: var(--text-title);
}

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
