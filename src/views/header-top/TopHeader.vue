<template>
  <header
    class="relative z-header flex min-h-10 w-full shrink-0 select-none items-center justify-between border-b border-glass-border bg-bg-panel/90 backdrop-blur-lg px-4 box-border @media(display-mode:window-controls-overlay):[-webkit-app-region:drag] @media(display-mode:window-controls-overlay):[app-region:drag] @media(display-mode:window-controls-overlay):min-h-[max(2.5rem,env(titlebar-area-height,2.5rem))] @media(display-mode:window-controls-overlay):pl-[max(env(titlebar-area-inset-left,0px),1rem)] @media(display-mode:window-controls-overlay):pr-[max(env(titlebar-area-inset-right,0px),1rem)]"
  >
    <div class="flex flex-1 min-w-0 items-center justify-start gap-sm" :class="NO_DRAG_REGION_CLASS">
      <ActionButton
        v-tooltip="uiStore.isLeftOpen ? '收起侧边栏' : '展开侧边栏'"
        aria-label="切换侧边栏"
        icon-only
        :size="uiSize"
        :variant="uiStore.isLeftOpen ? 'subtle' : 'ghost'"
        :color="uiStore.isLeftOpen ? 'primary' : 'default'"
        @click="uiStore.isLeftOpen = !uiStore.isLeftOpen"
      >
        <PanelLeft :size="18" :stroke-width="2.2" />
      </ActionButton>

      <div class="w-px h-[0.7rem] bg-glass-border mx-[0.1rem]" />

      <div class="flex items-center gap-md">
        <span
          class="text-xs font-extrabold tracking-tight text-text-title whitespace-nowrap [font-feature-settings:'ss01'_1]"
        >
          Fret Logic
        </span>
        <BaseSegmentedControl
          :model-value="activeNavPath"
          :size="uiSize"
          :options="NAV_OPTIONS"
          @change="path => router.push(path)"
        />
      </div>
    </div>

    <div
      class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-inner pointer-events-auto flex items-center @media(display-mode:window-controls-overlay):-translate-x-[calc(50%-(env(titlebar-area-inset-left,0px)-env(titlebar-area-inset-right,0px))/2)]"
      :class="NO_DRAG_REGION_CLASS"
    >
      <div v-if="route.path === '/workbench'" class="flex items-center gap-xs p-xs">
        <ActionButton
          v-tooltip="'播放/试听当前和弦'"
          size="sm"
          variant="subtle"
          color="primary"
          icon-only
          aria-label="播放/试听当前和弦"
          :disabled="editorStore.isFretBoardEmpty || isPlaying"
          @click="playCurrentChord"
        >
          <component :is="isPlaying ? Square : Play" :size="15" :stroke-width="2.5" />
        </ActionButton>

        <div class="w-px h-[0.8rem] bg-border-base mx-[0.1rem] opacity-50" />

        <ActionButton
          v-tooltip="'导出透明背景图片'"
          size="sm"
          icon-only
          variant="ghost"
          aria-label="导出透明背景图片"
          :disabled="uiStore.isCopying"
          @click="handleExport(true)"
        >
          <component :is="Image" :size="15" :stroke-width="2.5" />
        </ActionButton>

        <ActionButton
          v-tooltip="'导出带背景卡片切图'"
          size="sm"
          icon-only
          variant="ghost"
          aria-label="导出带背景卡片切图"
          :disabled="uiStore.isCopying"
          @click="handleExport(false)"
        >
          <component :is="Copy" :size="15" :stroke-width="2.5" />
        </ActionButton>
      </div>

      <BaseSegmentedControl
        v-else-if="route.path === '/score'"
        v-model="scoreEditor.activeTab"
        :options="scoreModeOptions"
        size="md"
        :disabled="!scoreEditor.activeSong"
        @change="handleScoreTabChange"
      />
    </div>

    <div class="flex flex-1 min-w-0 items-center justify-end gap-xs" :class="NO_DRAG_REGION_CLASS">
      <ActionButton
        v-if="scoreEditor.activeTab === 'interactive' && route.path === '/score'"
        v-tooltip="isAutoScrolling ? '暂停滚动' : '开始滚动'"
        size="sm"
        variant="ghost"
        icon-only
        :aria-label="isAutoScrolling ? '暂停滚动' : '开始滚动'"
        :title="isAutoScrolling ? '暂停滚动' : '开始滚动'"
        @click="toggleAutoScroll"
      >
        <component :is="isAutoScrolling ? Pause : Play" :size="15" :stroke-width="2.5" />
      </ActionButton>

      <ActionButton
        v-tooltip="'全局编辑'"
        icon-only
        variant="ghost"
        :aria-label="isGlobalEditable ? '退出全局编辑' : '开启全局编辑'"
        @click="toggleEditable"
      >
        <component
          :is="isGlobalEditable ? Pencil : PencilOff"
          :size="17"
          :stroke-width="2.2"
          :class="isGlobalEditable ? 'text-color-primary' : 'text-text-disabled'"
        />
      </ActionButton>

      <BasePopover trigger="hover" placement="bottom-end">
        <template #trigger="{ isOpen, pinToggle }">
          <ActionButton
            ref="triggerBtnRef"
            icon-only
            :variant="isOpen ? 'subtle' : 'ghost'"
            :color="isOpen ? 'primary' : 'default'"
            aria-label="设置面板"
            :aria-expanded="isOpen"
            aria-haspopup="true"
            :size="uiSize"
            @click="pinToggle()"
          >
            <SlidersHorizontal :size="18" :stroke-width="2.2" aria-hidden="true" />
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
        <Cloud :size="18" :stroke-width="2.2" />
      </ActionButton>

      <BasePopover trigger="hover" placement="bottom-end">
        <template #trigger="{ isOpen, pinToggle }">
          <ActionButton
            icon-only
            :variant="isOpen ? 'subtle' : 'ghost'"
            :color="isOpen ? 'primary' : 'default'"
            aria-label="外观设置"
            aria-haspopup="menu"
            :aria-expanded="isOpen"
            :size="uiSize"
            @click="pinToggle()"
          >
            <component
              :is="globalDarkMode ? Moon : Sun"
              :size="18"
              ::stroke-width="2.2"
              :class="globalDarkMode ? 'text-color-primary' : 'text-color-warning'"
            />
          </ActionButton>
        </template>

        <template #default="{ close }">
          <ContextMenuItems :items="themeMenuItems" @select="item => (item.action?.(), close())" />
        </template>
      </BasePopover>

      <ActionButton
        v-tooltip.interactive="buildInfoTooltip"
        icon-only
        variant="ghost"
        aria-label="构建信息"
        :size="uiSize"
      >
        <Info :size="17" :stroke-width="2.2" />
      </ActionButton>
    </div>
  </header>

  <SyncModalContainer v-model:is-sync-modal-open="isSyncModalOpen" />
</template>

<script setup lang="ts">
import ActionButton from '@/components/base/ActionButton.vue';
import BasePopover from '@/components/base/BasePopover.vue';
import BaseSegmentedControl, { type SegmentOption } from '@/components/base/BaseSegmentedControl.vue';
import ContextMenuItems, { type ContextMenuItem } from '@/components/context-menu/ContextMenuItems.vue';
import { useAudioPlayer } from '@/composables/fretboard/useAudioPlayer';
import { useAutoScroll } from '@/composables/score/useAutoScroll';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { globalDarkMode, isGlobalEditable, setThemeMode, themePreference, toggleEditable } from '@/stores/globalState';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useUiStore } from '@/stores/uiStore';
import { renderElementToBlob, writeBlobToClipboard } from '@/utils/score/score-export';
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
    action: () => {
      setThemeMode('light');
      emit('toggle-theme', 'light');
    },
  },
  {
    label: '深色模式',
    icon: Moon,
    color: 'var(--color-primary)',
    checked: themePreference.value === 'dark',
    action: () => {
      setThemeMode('dark');
      emit('toggle-theme', 'dark');
    },
  },
  {
    label: '跟随系统',
    icon: Laptop,
    color: 'var(--text-title)',
    checked: themePreference.value === 'auto',
    action: () => {
      setThemeMode('auto');
      emit('toggle-theme', 'auto');
    },
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
  const el =
    unref(uiStore.activeExportTarget) ||
    document.querySelector<HTMLElement>('.workbench-card, .score-lyrics-interactive');
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
/** PWA 窗口控制拖拽拦截类名 */
const NO_DRAG_REGION_CLASS =
  '@media(display-mode:window-controls-overlay):[-webkit-app-region:no-drag] @media(display-mode:window-controls-overlay):[app-region:no-drag]';
const SyncModalContainer = defineAsyncComponent(() => import('./SyncModalContainer.vue'));
const buildInfoTooltip = computed(() => {
  const builtAt = new Date(__BUILD_INFO__.time).toLocaleString('zh-CN', { hour12: false });
  return `Fret Logic\n版本：${__BUILD_INFO__.commit}\n构建时间：${builtAt}`;
});
</script>
