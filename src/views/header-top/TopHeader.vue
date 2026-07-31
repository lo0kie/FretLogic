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
        <div class="header-nav-tabs">
          <router-link to="/" class="nav-item" active-class="is-active">工作台</router-link>
          <router-link to="/score" class="nav-item" active-class="is-active">乐谱库</router-link>
        </div>
      </div>
    </div>

    <!-- 2. 中间：工作台试听/导出胶囊 -->
    <div class="header-section section-center">
      <div v-if="route.path === '/'" class="segmented-control-capsule">
        <GlobalTooltip content="播放/试听当前和弦" placement="bottom">
          <ActionButton
            size="sm"
            variant="subtle"
            icon-only
            :disabled="editorStore.isFretBoardEmpty || isPlaying"
            @click="playCurrentChord"
          >
            <component :is="isPlaying ? Square : Play" :size="15" stroke-width="2.5" />
          </ActionButton>
        </GlobalTooltip>

        <div class="capsule-divider"></div>

        <GlobalTooltip content="导出透明背景图片" placement="bottom">
          <ActionButton
            size="sm"
            icon-only
            variant="ghost"
            :disabled="uiStore.isCopying"
            @click="$emit('export-image', true)"
          >
            <Image :size="16" stroke-width="2" />
          </ActionButton>
        </GlobalTooltip>

        <GlobalTooltip content="导出带背景卡片切图" placement="bottom" class="hidden-mobile">
          <ActionButton
            size="sm"
            icon-only
            variant="ghost"
            :disabled="uiStore.isCopying"
            @click="$emit('export-image', false)"
          >
            <Copy :size="16" stroke-width="2" />
          </ActionButton>
        </GlobalTooltip>
      </div>
    </div>

    <!-- 3. 右侧：指板配置 Popover / 曲谱配置 Popover -->
    <div class="header-section section-right">
      <HeaderConfigPopover v-if="route.path === '/'" />
      <ScoreConfigPopover v-else-if="route.path === '/score' && songStore.activeSong" />

      <!-- 云端同步按钮 -->
      <GlobalTooltip content="云端备份与拉取" placement="bottom">
        <ActionButton icon-only variant="ghost" @click="isSyncModalOpen = true">
          <Cloud :size="18" stroke-width="2.2" />
        </ActionButton>
      </GlobalTooltip>

      <!-- 主题切换按钮 -->
      <GlobalTooltip :content="settingsStore.isDarkMode ? '切换至浅色模式' : '切换至深色模式'" placement="bottom">
        <ActionButton icon-only variant="ghost" @click="$emit('toggle-theme', $event)">
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

  <!-- Modal 部分 -->
  <BaseModal v-model:visible="isSyncModalOpen" title="云端同步设置" :show-footer="false" width="w-80">
    <SyncSettingsCard
      :is-syncing="isSyncing"
      :is-pulling="isPulling"
      @pull-request="isPullConfirmOpen = true"
      @push-request="triggerGlobalSync"
    />
  </BaseModal>

  <BaseModal
    v-model:visible="isPullConfirmOpen"
    title="操作确认"
    confirm-type="danger"
    confirm-text="确认覆盖"
    @confirm="confirmPull"
  >
    <p class="modal-text">从云端拉取数据将完全覆盖您本地的所有和弦与分组记录，且此操作不可撤销！确定要继续吗？</p>
  </BaseModal>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import BaseModal from '@/components/BaseModal.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { useAudioPlayer } from '@/services/useAudioPlayer';
import { useGithubSyncService } from '@/services/useGithubSyncService';
import { useEditorStore } from '@/stores/editorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import { Cloud, Copy, Image, Moon, PanelLeft, Play, Square, Sun } from '@lucide/vue';
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import HeaderConfigPopover from './HeaderConfigPopover.vue';
import ScoreConfigPopover from './ScoreConfigPopover.vue';
import SyncSettingsCard from './SyncSettingsCard.vue';

defineEmits<{
  (e: 'export-image', isTransparent: boolean): void;
  (e: 'toggle-theme', event: MouseEvent): void;
}>();

const route = useRoute();
const editorStore = useEditorStore();
const settingsStore = useSettingsStore();
const uiStore = useUiStore();
const songStore = useSongStore();
const { isPlaying, playCurrentChord } = useAudioPlayer();
const { triggerGlobalSync, pullFromGithub, isSyncing, isPulling } = useGithubSyncService();

const isSyncModalOpen = ref(false);
const isPullConfirmOpen = ref(false);

const confirmPull = () => {
  pullFromGithub();
  isPullConfirmOpen.value = false;
  isSyncModalOpen.value = false;
};
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
  min-width: 0;
}

.nav-brand-group {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.header-nav-tabs {
  display: flex;
  gap: 0.15rem;
  background-color: var(--bg-body);
  padding: 0.12rem;
  border-radius: 9999px;
  border: 1px solid var(--border-light);
}

.nav-item {
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--text-disabled);
  text-decoration: none;
  padding: 0.12rem 0.55rem;
  border-radius: 9999px;
  transition: @transition-fast;

  &:hover {
    color: var(--text-title);
  }

  &.is-active {
    background-color: var(--bg-panel);
    color: var(--color-primary);
    font-weight: 700;
    box-shadow: @shadow-sm;
  }
}

.section-center {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
}

.segmented-control-capsule {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.25rem;
  border-radius: 9999px;
  border: 1px solid var(--glass-border);
  box-sizing: border-box;
}

.capsule-divider {
  width: 1px;
  height: 0.8rem;
  background-color: var(--border-base);
  margin: 0 0.1rem;
  opacity: 0.5;
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

.modal-text {
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.6;
  color: var(--text-body);
  margin: 0;
}
</style>
