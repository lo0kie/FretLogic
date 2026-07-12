<template>
  <div class="panel-right" :class="{ 'is-open': uiStore.isRightOpen }">
    <div class="panel-header">
      <h2 class="header-title">指板配置</h2>

      <GlobalTooltip :content="settingsStore.isDarkMode ? '切换至浅色模式' : '切换至深色模式'" placement="bottom">
        <button @click="executeToggleThemeWithAnimation($event)" class="header-theme-btn">
          <component :is="settingsStore.isDarkMode ? Moon : Sun" :size="18" stroke-width="3" />
        </button>
      </GlobalTooltip>
    </div>

    <div class="scroll-container no-scrollbar">
      <RightFretSlider />
      <RightTuningSelector />
      <RightCapoWheel />

      <div class="panel-divider"></div>

      <RightHelper
        :is-syncing="isSyncing"
        :is-pulling="isPulling"
        @pull-request="modals.pullConfirm = true"
        @push-request="handleManualPush"
      />
    </div>

    <RightPanelFooter @save="chordService.persistCurrentChord()" @reset="editorStore.resetEditor()" />
  </div>

  <button
    @click="uiStore.isRightOpen = !uiStore.isRightOpen"
    class="sidebar-toggle-btn-right"
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
    <p class="modal-text">
      从云端拉取数据将完全覆盖您本地的所有和弦与分组记录，且此操作不可撤销！ <br /><br />您确定要继续吗？
    </p>
  </BaseModal>
</template>

<script setup lang="ts">
import { RIGHT_SIDEBAR_WIDTH_PIXEL } from '@/constants';
import { useChordService } from '@/services/useChordService';
import { useGithubSyncService } from '@/services/useGithubSyncService';
import { useEditorStore } from '@/stores/editorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';
import { reactive } from 'vue';

import RightCapoWheel from '@/views/sidebar-right/RightCapoWheel.vue';
import RightFretSlider from '@/views/sidebar-right/RightFretSlider.vue';
import RightHelper from '@/views/sidebar-right/RightHelper.vue';
import RightPanelFooter from '@/views/sidebar-right/RightPanelFooter.vue';
import RightTuningSelector from '@/views/sidebar-right/RightTuningSelector.vue';

import BaseModal from '@/components/BaseModal.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { Moon, Sun, Triangle } from '@lucide/vue';

const uiStore = useUiStore();
const editorStore = useEditorStore();
const settingsStore = useSettingsStore();
const chordService = useChordService();

const { triggerGlobalSync, pullFromGithub, isSyncing, isPulling } = useGithubSyncService();

const modals = reactive({
  pullConfirm: false,
});

const executeToggleThemeWithAnimation = (event?: MouseEvent) => {
  const rootEl = document.documentElement;
  rootEl.setAttribute('theme-changing', 'true');

  const disableChangingAttribute = () => {
    setTimeout(() => {
      rootEl.removeAttribute('theme-changing');
    }, 350);
  };

  if (!document.startViewTransition || !event) {
    settingsStore.isDarkMode = !settingsStore.isDarkMode;
    disableChangingAttribute();
    return;
  }

  const x = event.clientX;
  const y = event.clientY;
  const endRadius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

  const transition = document.startViewTransition(() => {
    settingsStore.isDarkMode = !settingsStore.isDarkMode;
  });

  transition.ready.then(() => {
    document.documentElement.animate(
      {
        clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`],
      },
      {
        duration: 350,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        pseudoElement: '::view-transition-new(root)',
      }
    );
  });

  transition.finished.then(() => {
    disableChangingAttribute();
  });
};

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
  background-color: var(--bg-panel);
  border: @border-solid-light;
  box-shadow: @shadow-panel;
  height: calc(100% - 24px);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: relative;
  z-index: 10;
  border-radius: @radius-xl;
  box-sizing: border-box;
  flex-shrink: 0;
  width: 0px;
  opacity: 0;
  overflow: hidden;
  margin: 12px 0;
  transition:
    width @duration-slow @bezier-sidebar,
    opacity @duration-base ease,
    margin @duration-slow @bezier-sidebar;

  :global(.dark) & {
    box-shadow: @shadow-panel-dark;
  }

  &.is-open {
    width: v-bind(RIGHT_SIDEBAR_WIDTH_PIXEL);
    opacity: 1;
    margin: 12px;
  }
}

.panel-header {
  height: 76px;
  border-bottom: 1px solid var(--control-border);
  padding: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  flex-shrink: 0;
}

.header-title {
  font-size: 1rem;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-title);
  margin: 0;
}

.header-theme-btn {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: @border-solid-base;
  border-radius: 100%;
  cursor: pointer;
  color: var(--theme-btn-color);
  background-color: var(--theme-btn-bg);
  transition: @transition-fast;

  &:hover {
    background-color: var(--bg-panel-hover);
    transform: rotate(15deg);
  }

  &:active {
    background-color: var(--bg-body);
    transform: scale(0.9);
  }
}

.scroll-container {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 0;
  box-sizing: border-box;

  &.no-scrollbar {
    scrollbar-width: none;
    &::-webkit-scrollbar {
      display: none;
    }
  }
}

.panel-divider {
  width: 100%;
  height: 1px;
  background-color: var(--control-border);
  margin: 0.5rem 0;
  opacity: 0.5;
}

.sidebar-toggle-btn-right {
  position: absolute;
  top: 50%;
  width: 20px;
  height: 60px;
  background-color: var(--bg-panel);
  border: @border-solid-base;
  box-shadow: @shadow-sm;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  color: var(--text-disabled);
  cursor: pointer;
  transition: @transition-base;
  font-size: 9px;
  font-weight: 900;
  border-radius: 6px 0 0 6px;
  transform: translateY(-50%) scale(1);
  transform-origin: right;
  right: 0px;

  &:hover {
    color: @primary;
    border-color: color-mix(in srgb, @primary, transparent 75%);
    background-color: var(--bg-main);
  }

  :global(.dark) & {
    &:hover {
      background-color: var(--bg-panel-hover);
    }
  }

  &.is-open {
    right: calc(v-bind(RIGHT_SIDEBAR_WIDTH_PIXEL) + 12px);
  }

  &:active {
    transform: translateY(-50%) scale(0.93);
  }
}

.modal-text {
  font-size: 0.75rem;
  font-weight: 600;
  opacity: 0.8;
  line-height: 1.625;
  color: var(--text-body);
  margin: 0;
}
</style>
