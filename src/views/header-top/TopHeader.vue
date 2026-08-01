<template>
  <header class="app-top-header">
    <!-- 1. 左侧：侧边栏开关 + 品牌导航 -->
    <div class="header-section section-left">
      <GlobalTooltip :content="uiStore.isLeftOpen ? '收起侧边栏' : '展开侧边栏'" placement="bottom">
        <ActionButton
          icon-only
          variant="ghost"
          :size="uiStore.isMobile ? 'md' : 'sm'"
          :active="uiStore.isLeftOpen"
          @click="uiStore.isLeftOpen = !uiStore.isLeftOpen"
        >
          <PanelLeft :size="18" stroke-width="2.2" />
        </ActionButton>
      </GlobalTooltip>

      <div class="header-divider hidden-mobile"></div>

      <div class="nav-brand-group hidden-mobile">
        <span class="app-brand-title">Fret Logic</span>

        <BaseSegmentedControl :model-value="route.path" :options="NAV_OPTIONS" @change="path => router.push(path)" />
      </div>
    </div>

    <!-- 2. 中间：试听 / 导出胶囊 / 模式切换工具栏 -->
    <div class="header-section section-center">
      <HeaderWorkbenchTools v-if="route.path === '/'" @export-image="isTrans => emit('export-image', isTrans)" />
      <HeaderScoreTools v-else-if="route.path === '/score'" />
    </div>

    <!-- 3. 右侧：指板配置 Popover / 曲谱配置 Popover -->
    <div class="header-section section-right">
      <HeaderConfigPopover v-if="route.path === '/'" />
      <ScoreConfigPopover v-else-if="route.path === '/score' && scoreEditor.activeSong" />

      <!-- 云端同步按钮 -->
      <GlobalTooltip content="云端备份与拉取" placement="bottom">
        <ActionButton icon-only variant="ghost" @click="isSyncModalOpen = true">
          <Cloud :size="18" stroke-width="2.2" />
        </ActionButton>
      </GlobalTooltip>

      <!-- 主题切换按钮 -->
      <GlobalTooltip :content="settingsStore.isDarkMode ? '切换至浅色模式' : '切换至深色模式'" placement="bottom">
        <ActionButton icon-only variant="ghost" @click="emit('toggle-theme', $event)">
          <component
            :is="settingsStore.isDarkMode ? Moon : Sun"
            :size="18"
            :stroke-width="2.2"
            :style="{ color: settingsStore.isDarkMode ? '#64d2ff' : '#ff9500' }"
            class="theme-toggle-icon"
          />
        </ActionButton>
      </GlobalTooltip>
    </div>
  </header>

  <!-- 4. 云端同步弹窗容器 -->
  <SyncModalContainer v-model:is-sync-modal-open="isSyncModalOpen" />
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import BaseSegmentedControl, { type SegmentOption } from '@/components/BaseSegmentedControl.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';
import { Cloud, Moon, PanelLeft, Sun } from '@lucide/vue';
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import HeaderConfigPopover from './HeaderConfigPopover.vue';
import HeaderScoreTools from './HeaderScoreTools.vue';
import HeaderWorkbenchTools from './HeaderWorkbenchTools.vue';
import ScoreConfigPopover from './ScoreConfigPopover.vue';
import SyncModalContainer from './SyncModalContainer.vue';

const emit = defineEmits<{
  (e: 'export-image', isTransparent: boolean): void;
  (e: 'toggle-theme', event: MouseEvent): void;
}>();

const route = useRoute();
const router = useRouter();

const NAV_OPTIONS: SegmentOption<string>[] = [
  { label: '工作台', value: '/' },
  { label: '乐谱库', value: '/score' },
];

const scoreEditor = useScoreEditorStore();
const settingsStore = useSettingsStore();
const uiStore = useUiStore();

const isSyncModalOpen = ref(false);
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.app-top-header {
  height: 2.5rem;
  width: 100%;
  padding: 0 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  background-color: var(--bg-panel);
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(28px);
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
    padding: 0 0.75rem;
  }
}
</style>
