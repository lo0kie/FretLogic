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

      <div class="header-divider" />

      <div class="nav-brand-group">
        <span class="app-brand-title">Fret Logic</span>
        <BaseSegmentedControl
          :model-value="activeNavPath"
          :size="uiSize"
          :options="NAV_OPTIONS"
          @change="path => router.push(path)"
        />
      </div>
    </div>

    <!-- 中部工具栏 -->
    <div class="header-section section-center">
      <!-- 1. 工作台工具 -->
      <div v-if="route.path === '/workbench'" class="segmented-control-capsule">
        <ActionButton
          v-tooltip="'播放/试听当前和弦'"
          size="sm"
          variant="subtle"
          primary
          icon-only
          :disabled="editorStore.isFretBoardEmpty || isPlaying"
          @click="playCurrentChord"
        >
          <component :is="isPlaying ? Square : Play" :size="15" stroke-width="2.5" />
        </ActionButton>

        <div class="capsule-divider" />

        <ActionButton
          v-tooltip="'导出透明背景图片'"
          size="sm"
          icon-only
          variant="ghost"
          :disabled="uiStore.isCopying"
          @click="handleExport(true)"
        >
          <component :is="Image" :size="15" stroke-width="2.5" />
        </ActionButton>

        <ActionButton
          v-tooltip="'导出带背景卡片切图'"
          size="sm"
          icon-only
          variant="ghost"
          :disabled="uiStore.isCopying"
          @click="handleExport(false)"
        >
          <component :is="Copy" :size="15" stroke-width="2.5" />
        </ActionButton>
      </div>

      <!-- 2. 歌词乐谱工具 -->
      <BaseSegmentedControl
        v-else-if="route.path === '/score'"
        v-model="scoreEditor.activeTab"
        :options="scoreModeOptions"
        size="md"
        @change="handleScoreTabChange"
      />
    </div>

    <div class="header-section section-right">
      <ActionButton
        v-if="scoreEditor.activeTab === 'interactive' && route.path === '/score'"
        v-tooltip="isAutoScrolling ? '暂停滚动' : '开始自动滚动'"
        size="sm"
        variant="ghost"
        :title="isAutoScrolling ? '暂停滚动' : '开始自动滚动'"
        @click="toggleAutoScroll"
      >
        <template #suffix>
          {{ scoreEditor.scrollSpeed }}
        </template>
        <component :is="isAutoScrolling ? Pause : Play" :size="15" stroke-width="2.5" />
      </ActionButton>

      <ActionButton
        v-tooltip="isGlobalEditable ? '退出编辑模式' : '进入编辑模式'"
        icon-only
        variant="ghost"
        aria-label="切换编辑模式"
        :size="uiSize"
        @click="toggleEditable"
      >
        <component
          :is="isGlobalEditable ? Pencil : PencilOff"
          :size="17"
          stroke-width="2.2"
          :style="{
            color: isGlobalEditable ? 'var(--color-primary)' : 'var(--text-disabled)',
          }"
        />
      </ActionButton>

      <BasePopover>
        <template #trigger="{ isOpen, toggle }">
          <ActionButton
            ref="triggerBtnRef"
            v-tooltip="computedTooltip"
            icon-only
            :variant="isOpen ? 'subtle' : 'ghost'"
            :primary="isOpen"
            :aria-label="computedTooltip"
            :aria-expanded="isOpen"
            aria-haspopup="true"
            :size="uiSize"
            @click="toggle"
          >
            <SlidersHorizontal :size="18" stroke-width="2.2" aria-hidden="true" />
          </ActionButton>
        </template>

        <HeaderConfigPopover />
      </BasePopover>

      <ActionButton
        v-tooltip="'云端备份与拉取'"
        icon-only
        variant="ghost"
        aria-label="云端同步"
        :size="uiSize"
        @click="isSyncModalOpen = true"
      >
        <Cloud :size="18" stroke-width="2.2" />
      </ActionButton>

      <!-- 主题切换 Popover -->
      <BasePopover trigger="hover" placement="bottom-end">
        <template #trigger="{ isOpen, open }">
          <ActionButton
            icon-only
            :variant="isOpen ? 'subtle' : 'ghost'"
            :primary="isOpen"
            aria-label="外观设置"
            aria-haspopup="menu"
            :size="uiSize"
            @click="open()"
          >
            <component
              :is="globalDarkMode ? Moon : Sun"
              :size="18"
              :stroke-width="2.2"
              :style="{ color: globalDarkMode ? 'var(--color-primary)' : 'var(--color-warning)' }"
            />
          </ActionButton>
        </template>

        <template #default="{ close }">
          <ContextMenuItems
            :items="themeMenuItems"
            @select="
              item => {
                item.action();
                close();
              }
            "
          />
        </template>
      </BasePopover>

      <ActionButton v-tooltip="buildInfoTooltip" icon-only variant="ghost" aria-label="构建信息" :size="uiSize">
        <Info :size="17" stroke-width="2.2" />
      </ActionButton>
    </div>
  </header>

  <SyncModalContainer v-model:is-sync-modal-open="isSyncModalOpen" />
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import BasePopover from '@/components/BasePopover.vue';
import BaseSegmentedControl, { type SegmentOption } from '@/components/BaseSegmentedControl.vue';
import ContextMenuItems, { type ContextMenuItem } from '@/components/ContextMenuItems.vue';
import { useAudioPlayer } from '@/composables/useAudioPlayer';
import { useAutoScroll } from '@/composables/useAutoScroll.ts';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { globalDarkMode, isGlobalEditable, themePreference, toggleEditable } from '@/stores/globalState.ts';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useUiStore } from '@/stores/uiStore';
import { renderElementToBlob, writeBlobToClipboard } from '@/utils/score-export';
import {
  Cloud,
  Copy,
  Image,
  Info,
  Laptop,
  Moon,
  PanelLeft,
  Pause,
  Pencil,
  PencilOff,
  Play,
  SlidersHorizontal,
  Square,
  Sun,
} from '@lucide/vue';
import { computed, defineAsyncComponent, ref, unref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import HeaderConfigPopover from './HeaderConfigPopover.vue';

const emit = defineEmits<{
  (e: 'toggle-theme', mode?: 'light' | 'dark' | 'auto'): void;
}>();

const route = useRoute();
const router = useRouter();
const editorStore = useChordEditorStore();
const scoreEditor = useScoreEditorStore();
const uiStore = useUiStore();
const { isPlaying, playCurrentChord } = useAudioPlayer();
const { isAutoScrolling, toggleAutoScroll } = useAutoScroll();

const activeNavPath = computed(() => {
  const matched = NAV_OPTIONS.find(opt => opt.value === route.path);
  return matched?.value ?? '';
});

const NAV_OPTIONS: SegmentOption<string>[] = [
  { label: '和弦', value: '/workbench' },
  { label: '乐谱', value: '/score' },
];

const themeMenuItems = computed<ContextMenuItem[]>(() => [
  {
    label: '浅色模式',
    icon: Sun,
    color: 'var(--color-warning)',
    checked: themePreference.value === 'light',
    action: () => emit('toggle-theme', 'light'),
  },
  {
    label: '深色模式',
    icon: Moon,
    color: 'var(--color-primary)',
    checked: themePreference.value === 'dark',
    action: () => emit('toggle-theme', 'dark'),
  },
  {
    label: '跟随系统',
    icon: Laptop,
    color: 'var(--text-title)',
    checked: themePreference.value === 'auto',
    action: () => emit('toggle-theme', 'auto'),
  },
]);

const scoreModeOptions = computed<SegmentOption<'edit' | 'interactive'>[]>(() => [
  { label: '编辑歌词', value: 'edit', disabled: !isGlobalEditable.value },
  {
    label: '排列和弦',
    value: 'interactive',
    disabled: !scoreEditor.hasLyrics,
  },
]);

const handleScoreTabChange = (val: 'edit' | 'interactive') => {
  if (val === 'interactive' && !scoreEditor.hasLyrics) {
    uiStore.toast.warning('请先在“编辑歌词”模式下输入歌词内容');
  }
};

const handleExport = async (isTransparent: boolean) => {
  if (uiStore.isCopying) return;
  const el = unref(uiStore.activeExportTarget);
  if (!el) {
    uiStore.toast.error('导出失败：目标 DOM 节点尚未渲染完成');
    return;
  }
  uiStore.isCopying = true;
  uiStore.toast.info(isTransparent ? '正在导出透明底色快照...' : '正在导出带卡片背景快照...');
  try {
    const blob = await renderElementToBlob(el, { isTransparent });
    await writeBlobToClipboard(blob);
    uiStore.toast.success('成功复制至系统剪贴板');
  } catch (err) {
    console.error('Fretboard Exporter Error:', err);
    uiStore.toast.error(err instanceof Error ? err.message : '导出失败');
  } finally {
    uiStore.isCopying = false;
  }
};

const isSyncModalOpen = ref(false);
const uiSize = 'md';
const SyncModalContainer = defineAsyncComponent(() => import('./SyncModalContainer.vue'));
const computedTooltip = computed(() => (route.path === '/score' ? '曲谱配置' : '指板配置'));
const buildInfoTooltip = computed(() => {
  const builtAt = new Date(__BUILD_INFO__.time).toLocaleString('zh-CN', { hour12: false });
  return `Fret Logic\n版本：${__BUILD_INFO__.commit}\n构建时间：${builtAt}`;
});
</script>

<style scoped lang="scss">
.app-top-header {
  min-height: 2.5rem;
  width: 100%;
  padding-left: 1rem;
  padding-right: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  background-color: var(--bg-panel);
  backdrop-filter: var(--blur-lg);
  -webkit-backdrop-filter: var(--blur-lg);
  border-bottom: 1px solid var(--glass-border);
  box-sizing: border-box;
  user-select: none;
  z-index: var(--z-header);
  flex-shrink: 0;
}

.header-section {
  display: flex;
  align-items: center;
}

.section-left {
  flex: 1 1 0;
  min-width: 0;
  justify-content: flex-start;
  gap: $space-sm;
}

.section-center {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: var(--z-inner);
  pointer-events: auto;
}

.section-right {
  flex: 1 1 0;
  min-width: 0;
  justify-content: flex-end;
  gap: $space-xs;
}

.nav-brand-group {
  display: flex;
  align-items: center;
  gap: $space-md;
}

.app-brand-title {
  font-size: $fs-xs;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text-title);
  white-space: nowrap;
  font-feature-settings: 'ss01' 1;
}

.header-divider {
  width: 1px;
  height: 0.7rem;
  background-color: var(--glass-border);
  margin: 0 0.1rem;
}

.segmented-control-capsule {
  display: flex;
  align-items: center;
  gap: $space-xs;
  padding: $space-xs;
}

.capsule-divider {
  width: 1px;
  height: 0.8rem;
  background-color: var(--border-base);
  margin: 0 0.1rem;
  opacity: 0.5;
}

@media (display-mode: window-controls-overlay) {
  .app-top-header {
    -webkit-app-region: drag;
    app-region: drag;
    min-height: max(2.5rem, env(titlebar-area-height, 2.5rem));
    padding-left: max(env(titlebar-area-inset-left, 0px), 1rem);
    padding-right: max(env(titlebar-area-inset-right, 0px), 1rem);
  }

  .section-left,
  .section-center,
  .section-right {
    -webkit-app-region: no-drag;
    app-region: no-drag;
  }

  .section-center {
    transform: translate(
      calc(-50% + (env(titlebar-area-inset-left, 0px) - env(titlebar-area-inset-right, 0px)) / 2),
      -50%
    );
  }
}
</style>
