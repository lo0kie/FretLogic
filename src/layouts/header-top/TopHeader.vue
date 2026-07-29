<template>
  <header class="app-top-header">
    <!-- 1. 左侧：侧边栏开关 + 品牌 -->
    <div class="header-section section-left">
      <GlobalTooltip :content="uiStore.isLeftOpen ? '收起侧边栏' : '展开侧边栏'" placement="bottom">
        <ActionButton
          icon-only
          variant="ghost"
          size="sm"
          :active="uiStore.isLeftOpen"
          @click="uiStore.isLeftOpen = !uiStore.isLeftOpen"
        >
          <PanelLeft :size="16" stroke-width="2.2" />
        </ActionButton>
      </GlobalTooltip>

      <div class="header-divider"></div>

      <span class="app-brand-title">Fret Logic</span>
    </div>

    <!-- 2. 中间：分段胶囊型工具组 -->
    <div class="header-section section-center">
      <div class="segmented-control-capsule">
        <GlobalTooltip content="播放/试听当前和弦" placement="bottom">
          <ActionButton
            size="sm"
            variant="subtle"
            icon-only
            :disabled="editorStore.isFretBoardEmpty || isPlaying"
            @click="playCurrentChord"
          >
            <component :is="isPlaying ? Square : Play" :size="13" stroke-width="2.5" />
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
            <Image :size="15" stroke-width="2" />
          </ActionButton>
        </GlobalTooltip>

        <GlobalTooltip content="导出带背景卡片切图" placement="bottom">
          <ActionButton
            size="sm"
            icon-only
            variant="ghost"
            :disabled="uiStore.isCopying"
            @click="$emit('export-image', false)"
          >
            <Copy :size="15" stroke-width="2" />
          </ActionButton>
        </GlobalTooltip>
      </div>
    </div>

    <!-- 3. 右侧：指板配置 Popover + 更多设置 (已移除顶部保存/重置) -->
    <div class="header-section section-right">
      <!-- 指板属性配置 Popover -->
      <div class="popover-wrapper" ref="configPopoverRef">
        <GlobalTooltip content="指板配置 (品数 / Capo / 调音)" placement="bottom">
          <ActionButton icon-only variant="ghost" :active="isConfigOpen" @click="isConfigOpen = !isConfigOpen">
            <SlidersHorizontal :size="16" stroke-width="2.2" />
          </ActionButton>
        </GlobalTooltip>

        <!-- 透明点击拦截层 -->
        <Teleport to="body">
          <div v-if="isConfigOpen" class="popover-backdrop-mask" @pointerdown="isConfigOpen = false"></div>
        </Teleport>

        <Transition name="dropdown-fade">
          <div v-if="isConfigOpen" class="config-popover-card">
            <div class="config-row">
              <label class="config-label">显示品数</label>
              <div class="fret-segmented-picker">
                <button
                  v-for="f in FRET_COUNTS"
                  :key="f"
                  @click="editorStore.fretCount = f"
                  class="fret-picker-item"
                  :class="{ 'is-selected': editorStore.fretCount === f }"
                >
                  {{ f }}品
                </button>
              </div>
            </div>

            <div class="config-row">
              <label class="config-label">变调夹 (Capo)</label>
              <div class="capo-quick-picker" @wheel="handleCapoWheel">
                <button
                  @click="editorStore.capo = Math.max(0, editorStore.capo - 1)"
                  class="capo-step-btn"
                  :disabled="editorStore.capo === 0"
                >
                  -
                </button>
                <span class="capo-readout-text">
                  {{ editorStore.capo === 0 ? 'CAPO 0' : `CAPO ${editorStore.capo}` }}
                </span>
                <button
                  @click="editorStore.capo = Math.min(12, editorStore.capo + 1)"
                  class="capo-step-btn"
                  :disabled="editorStore.capo === 12"
                >
                  +
                </button>
              </div>
            </div>

            <div class="config-row">
              <label class="config-label">调音方案</label>
              <div class="tuning-select-wrapper">
                <BaseSelector
                  v-model="editorStore.currentTuning"
                  :options="tuningOptions"
                  :default-value="TuningEnum.STANDARD"
                >
                  <template #label="{ selected }">
                    {{ TUNING_PRESETS[selected]?.name || TuningEnum.STANDARD }}
                  </template>

                  <template #option="{ option }">
                    <span class="option-text-truncate">{{ TUNING_PRESETS[option]?.name }}</span>
                  </template>
                </BaseSelector>
              </div>
            </div>
          </div>
        </Transition>
      </div>

      <!-- 云端同步 Modal 触发按钮 -->
      <GlobalTooltip content="云端备份与拉取" placement="bottom">
        <ActionButton icon-only variant="ghost" @click="isSyncModalOpen = true">
          <Cloud :size="16" stroke-width="2.2" />
        </ActionButton>
      </GlobalTooltip>

      <!-- 主题切换按钮 -->
      <GlobalTooltip :content="settingsStore.isDarkMode ? '切换至浅色模式' : '切换至深色模式'" placement="bottom">
        <ActionButton icon-only variant="ghost" @click="$emit('toggle-theme', $event)">
          <component
            :is="settingsStore.isDarkMode ? Moon : Sun"
            :size="16"
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
import BaseSelector from '@/components/BaseSelector.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import SyncSettingsCard from '@/layouts/header-top/SyncSettingsCard.vue';
import { useAudioPlayer } from '@/services/useAudioPlayer';
import { useGithubSyncService } from '@/services/useGithubSyncService';
import { useEditorStore } from '@/stores/editorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';
import { FRET_COUNTS } from '@/utils/constants';
import { TUNING_PRESETS, TuningEnum } from '@/utils/musicTheory';
import { Cloud, Copy, Image, Moon, PanelLeft, Play, SlidersHorizontal, Square, Sun } from '@lucide/vue';
import { ref } from 'vue';

defineEmits<{
  (e: 'export-image', isTransparent: boolean): void;
  (e: 'toggle-theme', event: MouseEvent): void;
}>();

const editorStore = useEditorStore();
const settingsStore = useSettingsStore();
const uiStore = useUiStore();
const { isPlaying, playCurrentChord } = useAudioPlayer();
const { triggerGlobalSync, pullFromGithub, isSyncing, isPulling } = useGithubSyncService();

const tuningOptions = Object.values(TuningEnum);
const isConfigOpen = ref(false);
const configPopoverRef = ref<HTMLDivElement | null>(null);
const isSyncModalOpen = ref(false);
const isPullConfirmOpen = ref(false);

const handleCapoWheel = (e: WheelEvent) => {
  e.preventDefault();
  if (e.deltaY < 0) {
    editorStore.capo = Math.max(0, editorStore.capo - 1);
  } else {
    editorStore.capo = Math.min(12, editorStore.capo + 1);
  }
};

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

.popover-wrapper {
  position: relative;
  z-index: 1001;
}

.popover-backdrop-mask {
  position: fixed;
  inset: 0;
  z-index: 999;
  background-color: transparent;
}

.config-popover-card {
  position: absolute;
  top: calc(100% + 1rem);
  right: 0;
  width: 15rem;
  padding: 0.8rem 1rem;
  background-color: var(--bg-panel);
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(28px);
  border: 1px solid var(--glass-border);
  border-radius: @radius-lg;
  box-shadow: @shadow-floating;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  z-index: 1100;
  box-sizing: border-box;
}

.config-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.7rem;
}

.config-label {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-disabled);
}

.fret-segmented-picker {
  display: flex;
  align-items: center;
  padding: 0.12rem;
  background-color: var(--bg-body);
  border: 1px solid var(--border-light);
  border-radius: @radius-md;
  gap: 0.1rem;
}

.fret-picker-item {
  height: 1.35rem;
  padding: 0 0.5rem;
  font-size: 0.68rem;
  font-weight: 600;
  border: none;
  border-radius: @radius-md;
  background: transparent;
  color: var(--text-disabled);
  cursor: pointer;

  &.is-selected {
    background-color: var(--bg-panel);
    color: var(--color-primary);
    font-weight: 700;
    box-shadow: @shadow-sm;
  }
}

.capo-quick-picker {
  display: flex;
  align-items: center;
  background-color: var(--bg-body);
  border: 1px solid var(--border-light);
  border-radius: @radius-md;
  height: 1.5rem;
  padding: 0 0.2rem;
  gap: 0.2rem;
}

.capo-step-btn {
  border: none;
  background: transparent;
  width: 1.1rem;
  height: 1.1rem;
  font-weight: 800;
  font-size: 0.75rem;
  color: var(--text-title);
  cursor: pointer;
  border-radius: @radius-sm;

  &:hover:not(:disabled) {
    background-color: var(--bg-panel-hover);
  }

  &:disabled {
    opacity: 0.3;
  }
}

.capo-readout-text {
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--color-primary);
  min-width: 3.5rem;
  text-align: center;
}

.tuning-select-wrapper {
  min-width: 8rem;
  flex: 1;

  :deep(.selector-trigger-bar) {
    height: 1.5rem;
    padding-left: 0.5rem;
    padding-right: 0.5rem;
  }
}

.option-text-truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-divider {
  width: 1px;
  height: 0.7rem;
  background-color: var(--glass-border);
  margin: 0 0.1rem;
}

.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition:
    opacity @duration-fast @bezier-standard,
    transform @duration-fast @bezier-standard;
}

.dropdown-fade-enter-from,
.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.96);
}

.modal-text {
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.6;
  color: var(--text-body);
  margin: 0;
}
</style>
