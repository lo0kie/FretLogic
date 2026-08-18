<template>
  <header class="app-top-header">
    <div class="header-section section-left">
      <ActionButton
        v-tooltip="uiStore.isLeftOpen ? '收起侧边栏' : '展开侧边栏'"
        aria-label="切换侧边栏"
        icon-only
        :size="uiSize"
        :variant="uiStore.isLeftOpen ? 'subtle' : 'ghost'"
        :primary="uiStore.isLeftOpen"
        @click="uiStore.isLeftOpen = !uiStore.isLeftOpen"
      >
        <PanelLeft :size="18" stroke-width="2.2" />
      </ActionButton>

      <div class="header-divider" data-hidden-mobile></div>

      <div class="nav-brand-group">
        <span class="app-brand-title" data-hidden-mobile>Fret Logic</span>
        <BaseSegmentedControl
          :model-value="activeNavPath"
          :size="uiSize"
          :options="NAV_OPTIONS"
          @change="path => router.push(path)"
          :compact="uiStore.isMobile"
        />
      </div>
    </div>

    <div class="header-section section-center">
      <HeaderWorkbenchTools v-if="route.path === '/workbench'" />
      <HeaderScoreTools v-else-if="route.path === '/score'" />
    </div>

    <div class="header-section section-right">
      <ActionButton
        v-if="scoreEditor.activeTab === 'interactive'"
        size="sm"
        variant="ghost"
        :title="isAutoScrolling ? '暂停滚动' : '开始自动滚动'"
        @click="toggleAutoScroll"
        v-tooltip="isAutoScrolling ? '暂停滚动' : '开始自动滚动'"
      >
        <template #suffix> {{ scoreEditor.scrollSpeed }} </template>
        <component :is="isAutoScrolling ? Pause : Play" :size="15" stroke-width="2.5" />
      </ActionButton>

      <ActionButton
        icon-only
        variant="ghost"
        aria-label="切换编辑模式"
        @click="toggleEditable"
        :size="uiSize"
        v-tooltip="isGlobalEditable ? '退出编辑模式' : '进入编辑模式'"
      >
        <component
          :is="isGlobalEditable ? Pencil : PencilOff"
          :size="17"
          stroke-width="2.2"
          :style="{ color: isGlobalEditable ? 'var(--color-primary)' : 'var(--text-disabled)' }"
        />
      </ActionButton>

      <HeaderConfigPopover v-if="route.path === '/workbench'" />
      <ScoreConfigPopover
        v-else-if="route.path === '/score' && scoreEditor.activeSong && scoreEditor.activeTab === 'interactive'"
      />

      <ActionButton
        icon-only
        variant="ghost"
        aria-label="云端同步"
        @click="isSyncModalOpen = true"
        :size="uiSize"
        v-tooltip="'云端备份与拉取'"
      >
        <Cloud :size="18" stroke-width="2.2" />
      </ActionButton>

      <ActionButton
        icon-only
        variant="ghost"
        :aria-label="globalDarkMode ? '切换至浅色模式' : '切换至深色模式'"
        @click="emit('toggle-theme')"
        :size="uiSize"
        v-tooltip="globalDarkMode ? '切换至浅色模式' : '切换至深色模式'"
      >
        <component
          :is="globalDarkMode ? Moon : Sun"
          :size="18"
          :stroke-width="2.2"
          :style="{ color: globalDarkMode ? 'var(--color-primary)' : 'var(--color-warning)' }"
          class="theme-toggle-icon"
        />
      </ActionButton>
    </div>
  </header>

  <SyncModalContainer v-model:is-sync-modal-open="isSyncModalOpen" />
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import BaseSegmentedControl, { type SegmentOption } from '@/components/BaseSegmentedControl.vue';
import { useAutoScroll } from '@/services/useAutoScroll.ts';
import { globalDarkMode, isGlobalEditable, toggleEditable } from '@/stores/globalState.ts';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useUiStore } from '@/stores/uiStore';
import { Cloud, Moon, PanelLeft, Pause, Pencil, PencilOff, Play, Sun } from '@lucide/vue';
import { computed, defineAsyncComponent, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import HeaderConfigPopover from './HeaderConfigPopover.vue';
import HeaderScoreTools from './HeaderScoreTools.vue';
import HeaderWorkbenchTools from './HeaderWorkbenchTools.vue';
import ScoreConfigPopover from './ScoreConfigPopover.vue';
// 同步弹窗链会拉入 js-base64 等依赖，异步加载以移出首屏 chunk
const SyncModalContainer = defineAsyncComponent(() => import('./SyncModalContainer.vue'));

const emit = defineEmits<{
  (e: 'toggle-theme'): void;
}>();
const route = useRoute();
const router = useRouter();
const activeNavPath = computed(() => {
  const matched = NAV_OPTIONS.find(opt => opt.value === route.path);
  return matched?.value ?? '';
});
const { isAutoScrolling, toggleAutoScroll } = useAutoScroll();
const NAV_OPTIONS: SegmentOption<string>[] = [
  { label: '和弦', value: '/workbench' },
  { label: '乐谱', value: '/score' },
];
const scoreEditor = useScoreEditorStore();
const uiStore = useUiStore();
const isSyncModalOpen = ref(false);
const uiSize = computed(() => (uiStore.isMobile ? 'sm' : 'md'));

watch(activeNavPath, () => {
  if (uiStore.isMobile && uiStore.isLeftOpen) uiStore.isLeftOpen = false;
});
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';
.app-top-header {
  min-height: calc(2.5rem + env(safe-area-inset-top, 0px));
  padding-top: env(safe-area-inset-top, 0px);
  width: 100%;
  padding-left: 1rem;
  padding-right: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  background-color: var(--bg-panel);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--glass-border);
  box-sizing: border-box;
  user-select: none;
  z-index: 1000;
  flex-shrink: 0;
}
.header-section {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.section-left {
  flex: 1 1 0;
  min-width: 0;
  justify-content: flex-start;
}
.section-center {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 2;
  pointer-events: auto;
}
.section-right {
  flex: 1 1 0;
  min-width: 0;
  justify-content: flex-end;
}
.nav-brand-group {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}
.app-brand-title {
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text-title);
  white-space: nowrap;
  margin-left: 0.2rem;
}
.header-divider {
  width: 1px;
  height: 0.7rem;
  background-color: var(--glass-border);
  margin: 0 0.1rem;
}
@media (max-width: 768px) {
  .app-top-header {
    height: calc(52px + env(safe-area-inset-top, 0px)) !important;
    min-height: calc(52px + env(safe-area-inset-top, 0px)) !important;
    padding-top: env(safe-area-inset-top, 0px);
    padding-left: 0.4rem;
    padding-right: 0.4rem;
  }
  .header-section {
    gap: 0.5rem;
  }
  .section-center {
    position: static;
    transform: none;
    flex: 0 1 auto;
    min-width: 0;
  }
  .nav-brand-group {
    gap: 0.25rem;
  }
}
</style>
