<template>
  <header
    class="z-header border-glass-border bg-bg-panel/90 @media(display-mode:window-controls-overlay):[-webkit-app-region:drag] @media(display-mode:window-controls-overlay):[app-region:drag] @media(display-mode:window-controls-overlay):min-h-[max(2.5rem,env(titlebar-area-height,2.5rem))] @media(display-mode:window-controls-overlay):pl-[max(env(titlebar-area-inset-left,0px),1rem)] @media(display-mode:window-controls-overlay):pr-[max(env(titlebar-area-inset-right,0px),1rem)] relative box-border flex min-h-10 w-full shrink-0 items-center justify-between border-b px-4 backdrop-blur-lg select-none"
  >
    <div :class="NO_DRAG_REGION_CLASS" class="gap-sm flex min-w-0 flex-1 items-center justify-start">
      <ActionButton
        v-tooltip="uiStore.isLeftOpen ? '收起侧边栏' : '展开侧边栏'"
        :color="uiStore.isLeftOpen ? 'primary' : 'default'"
        :size="uiSize"
        :variant="uiStore.isLeftOpen ? 'subtle' : 'ghost'"
        @click="uiStore.isLeftOpen = !uiStore.isLeftOpen"
        aria-label="切换侧边栏"
        icon-only
      >
        <BaseIcon :size="18" :stroke-width="2.2" name="panel-left" />
      </ActionButton>

      <div class="bg-glass-border mx-[0.1rem] h-[0.7rem] w-px" />

      <div class="gap-md flex items-center">
        <span class="text-text-title font-features-['ss01'_1] text-xs font-extrabold tracking-tight whitespace-nowrap">
          Fret Logic
        </span>
        <BaseSegmentedControl
          :model-value="activeNavPath"
          :options="NAV_OPTIONS"
          :size="uiSize"
          @change="path => router.push(path)"
        />
      </div>
    </div>

    <div
      :class="NO_DRAG_REGION_CLASS"
      class="z-inner @media(display-mode:window-controls-overlay):-translate-x-[calc(50%-(env(titlebar-area-inset-left,0px)-env(titlebar-area-inset-right,0px))/2)] pointer-events-auto absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center"
    >
      <div v-if="route.path === '/workbench'" class="gap-xs p-xs flex items-center">
        <ActionButton
          v-tooltip="'播放/试听当前和弦'"
          :disabled="editorStore.isFretBoardEmpty || isPlaying"
          @click="playCurrentChord"
          aria-label="播放/试听当前和弦"
          color="primary"
          icon-only
          size="sm"
          variant="subtle"
        >
          <BaseIcon :name="isPlaying ? 'square' : 'play'" :size="15" />
        </ActionButton>

        <div class="bg-border-base mx-[0.1rem] h-[0.8rem] w-px opacity-50" />

        <ActionButton
          v-tooltip="'导出透明背景图片'"
          :disabled="uiStore.isCopying"
          @click="handleExport(true)"
          aria-label="导出透明背景图片"
          icon-only
          size="sm"
          variant="ghost"
        >
          <BaseIcon :size="15" name="image" />
        </ActionButton>

        <ActionButton
          v-tooltip="'导出带背景卡片切图'"
          :disabled="uiStore.isCopying"
          @click="handleExport(false)"
          aria-label="导出带背景卡片切图"
          icon-only
          size="sm"
          variant="ghost"
        >
          <BaseIcon :size="15" name="copy" />
        </ActionButton>
      </div>

      <BaseSegmentedControl
        v-else-if="route.path === '/score'"
        v-model="scoreEditor.activeTab"
        :disabled="!scoreEditor.activeSong"
        :options="scoreModeOptions"
        @change="handleScoreTabChange"
        size="md"
      />
    </div>

    <div :class="NO_DRAG_REGION_CLASS" class="gap-xs flex min-w-0 flex-1 items-center justify-end">
      <ActionButton
        v-if="scoreEditor.activeTab === 'interactive' && route.path === '/score'"
        v-tooltip="isAutoScrolling ? '暂停滚动' : '开始滚动'"
        :aria-label="isAutoScrolling ? '暂停滚动' : '开始滚动'"
        :title="isAutoScrolling ? '暂停滚动' : '开始滚动'"
        @click="toggleAutoScroll"
        icon-only
        size="sm"
        variant="ghost"
      >
        <BaseIcon :name="isAutoScrolling ? 'pause' : 'play'" :size="15" />
      </ActionButton>

      <BasePopover placement="bottom-end" trigger="hover">
        <template #trigger="{ isOpen, pinToggle }">
          <ActionButton
            :aria-expanded="isOpen"
            :color="isOpen ? 'primary' : 'default'"
            :size="uiSize"
            :variant="isOpen ? 'subtle' : 'ghost'"
            @click="pinToggle()"
            aria-haspopup="true"
            aria-label="设置面板"
            icon-only
            ref="triggerBtnRef"
          >
            <BaseIcon :size="18" :stroke-width="2.2" aria-hidden="true" name="sliders-horizontal" />
          </ActionButton>
        </template>

        <HeaderConfigPopover />
      </BasePopover>

      <BasePopover placement="bottom-end" trigger="hover">
        <template #trigger="{ isOpen, pinToggle }">
          <ActionButton
            :aria-expanded="isOpen"
            :color="isOpen ? 'primary' : 'default'"
            :size="uiSize"
            :variant="isOpen ? 'subtle' : 'ghost'"
            @click="pinToggle()"
            aria-haspopup="menu"
            aria-label="云端同步"
            icon-only
          >
            <BaseIcon :size="18" :stroke-width="2.2" name="cloud" />
          </ActionButton>
        </template>

        <template #default="{ close }">
          <ContextMenuItems
            :items="syncMenuItems"
            @select="
              item => {
                item.action?.();
                if (!item.keepOpen) close();
              }
            "
          />
        </template>
      </BasePopover>

      <BasePopover placement="bottom-end" trigger="hover">
        <template #trigger="{ isOpen, pinToggle }">
          <ActionButton
            :aria-expanded="isOpen"
            :color="isOpen ? 'primary' : 'default'"
            :size="uiSize"
            :variant="isOpen ? 'subtle' : 'ghost'"
            @click="pinToggle()"
            aria-haspopup="menu"
            aria-label="外观设置"
            icon-only
          >
            <BaseIcon
              :class="globalDarkMode ? 'text-color-primary' : 'text-color-warning'"
              :name="globalDarkMode ? 'moon' : 'sun'"
              :size="18"
            />
          </ActionButton>
        </template>

        <template #default="{ close }">
          <ContextMenuItems :items="themeMenuItems" @select="item => (item.action?.(), close())" />
        </template>
      </BasePopover>

      <ActionButton
        v-tooltip.interactive="buildInfoTooltip"
        :size="uiSize"
        aria-label="构建信息"
        icon-only
        variant="ghost"
      >
        <BaseIcon :size="17" :stroke-width="2.2" name="info" />
      </ActionButton>
    </div>
  </header>

  <BaseModal
    v-model:visible="isSyncConfirmOpen"
    :before-close="() => !isSyncing"
    :cancel-button-disabled="isSyncing"
    :close-on-mask="!isSyncing"
    :confirm-loading="isSyncing"
    :keyboard="!isSyncing"
    :show-close="!isSyncing"
    @confirm="handleConfirmSync"
    cancel-text="取消"
    confirm-text="确认同步"
    title="确认同步到云端"
    width="w-80"
  >
    <div class="py-xs">
      <p class="text-text-body m-0 text-xs leading-relaxed">
        确定要将本地数据（和弦库、乐谱库与设置）同步上传至
        <strong class="text-text-title">{{ currentSchemeName }}</strong> 吗？
      </p>
    </div>
  </BaseModal>

  <BaseModal
    v-model:visible="isPullConfirmOpen"
    :before-close="() => !isPulling"
    :cancel-button-disabled="isPulling"
    :close-on-mask="!isPulling"
    :confirm-loading="isPulling"
    :keyboard="!isPulling"
    :show-close="!isPulling"
    @confirm="handleConfirmPull"
    cancel-text="取消"
    confirm-text="确认拉取"
    title="确认从云端拉取"
    width="w-80"
  >
    <div class="py-xs">
      <p class="text-text-body m-0 text-xs leading-relaxed">
        确定要从
        <strong class="text-text-title">{{ currentSchemeName }}</strong>
        拉取云端备份数据吗？拉取完成后将进入导入面板供您勾选应用。
      </p>
    </div>
  </BaseModal>

  <SyncModalContainer v-model:is-sync-modal-open="isSyncModalOpen" />
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, ref, unref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import ActionButton from '@/components/ui/ActionButton.vue';
import BaseIcon from '@/components/ui/BaseIcon.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import BasePopover from '@/components/ui/BasePopover.vue';
import BaseSegmentedControl, { type SegmentOption } from '@/components/ui/BaseSegmentedControl.vue';
import ContextMenuItems, { type ContextMenuItem } from '@/components/ui/context-menu/ContextMenuItems.vue';
import type { IconName } from '@/components/ui/icons.registry';
import { useAutoScroll } from '@/features/score-editor/composables/useAutoScroll';
import type { SyncProviderKind } from '@/services/sync/provider';
import { useAudioPlayer } from '@/shared/composables/useAudioPlayer';
import { useBackupModals } from '@/shared/composables/useBackupModals';
import { useSyncService } from '@/shared/composables/useSyncService';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { globalDarkMode, setThemeMode, themePreference } from '@/stores/globalState';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';
import { renderElementToBlob, writeBlobToClipboard } from '@/utils/score/score-export';

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
    icon: 'sun',
    color: 'var(--color-warning)',
    checked: themePreference.value === 'light',
    action: () => {
      setThemeMode('light');
      emit('toggle-theme', 'light');
    },
  },
  {
    label: '深色模式',
    icon: 'moon',
    color: 'var(--color-primary)',
    checked: themePreference.value === 'dark',
    action: () => {
      setThemeMode('dark');
      emit('toggle-theme', 'dark');
    },
  },
  {
    label: '跟随系统',
    icon: 'laptop',
    color: 'var(--text-title)',
    checked: themePreference.value === 'auto',
    action: () => {
      setThemeMode('auto');
      emit('toggle-theme', 'auto');
    },
  },
]);

const { triggerGlobalSync, pullFromRemote, isSyncing, isPulling } = useSyncService();
const backupModals = useBackupModals();
const settingsStore = useSettingsStore();

const isSyncConfirmOpen = ref(false);
const isPullConfirmOpen = ref(false);

const SYNC_TARGET_LABELS: Record<SyncProviderKind, string> = {
  server: '线上服务器',
  github: 'GitHub',
  webdav: 'WebDAV',
};

const SYNC_TARGET_ICONS: Record<SyncProviderKind, IconName> = {
  server: 'server',
  github: 'github',
  webdav: 'folder-sync',
};

const currentSchemeName = computed(() => SYNC_TARGET_LABELS[settingsStore.syncTarget] || '线上服务器');

/** 用户确认同步：执行全局同步，成功后关闭确认弹窗 */
const handleConfirmSync = async () => {
  const ok = await triggerGlobalSync();
  if (ok) {
    isSyncConfirmOpen.value = false;
  }
};

/** 用户确认拉取：拉取成功后关闭弹窗，并携带云端数据进入导入面板供勾选应用 */
const handleConfirmPull = async () => {
  const payload = await pullFromRemote();
  isPullConfirmOpen.value = false;
  if (payload) {
    backupModals.openImportWithPayload(payload, '云端同步数据');
  }
};

const syncMenuItems = computed<ContextMenuItem[]>(() => [
  {
    label: isSyncing.value ? '同步中...' : '同步',
    icon: 'cloud-upload',
    disabled: isSyncing.value || isPulling.value,
    action: () => {
      isSyncConfirmOpen.value = true;
    },
  },
  {
    label: isPulling.value ? '拉取中...' : '拉取',
    icon: 'cloud-download',
    disabled: isSyncing.value || isPulling.value,
    action: () => {
      isPullConfirmOpen.value = true;
    },
  },
  {
    label: '配置',
    icon: SYNC_TARGET_ICONS[settingsStore.syncTarget] || 'server',
    children: [
      {
        label: '线上服务器',
        icon: 'server',
        checked: settingsStore.syncTarget === 'server',
        keepOpen: true,
        action: () => {
          settingsStore.syncTarget = 'server';
        },
      },
      {
        label: 'GitHub',
        icon: 'github',
        checked: settingsStore.syncTarget === 'github',
        keepOpen: true,
        action: () => {
          settingsStore.syncTarget = 'github';
        },
      },
      {
        label: 'WebDAV',
        icon: 'folder-sync',
        checked: settingsStore.syncTarget === 'webdav',
        keepOpen: true,
        action: () => {
          settingsStore.syncTarget = 'webdav';
        },
      },
      {
        label: '同步设置...',
        icon: 'settings',
        divided: true,
        action: () => {
          isSyncModalOpen.value = true;
        },
      },
    ],
  },
]);

const scoreModeOptions = computed<SegmentOption<'edit' | 'interactive'>[]>(() => [
  { label: '编辑歌词', value: 'edit' },
  {
    label: '排列和弦',
    value: 'interactive',
    disabled: !scoreEditor.hasLyrics,
  },
]);

/** 乐谱模式切换回调：无歌词时切到"排列和弦"给出提示（选项本身已被禁用，双保险） */
const handleScoreTabChange = (val: 'edit' | 'interactive') => {
  if (val === 'interactive' && !scoreEditor.hasLyrics) {
    uiStore.toast.warning('请先在“编辑歌词”模式下输入歌词内容');
  }
};

/**
 * 用户点击导出：把当前激活区域渲染为图片并写入系统剪贴板
 * @param isTransparent true 导出透明背景图，false 导出带卡片背景的切图
 */
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
const SyncModalContainer = defineAsyncComponent(() => import('@/app/modals/SyncModalContainer.vue'));
const buildInfoTooltip = computed(() => {
  const builtAt = new Date(__BUILD_INFO__.time).toLocaleString('zh-CN', { hour12: false });
  return `Fret Logic\n版本：${__BUILD_INFO__.commit}\n构建时间：${builtAt}`;
});
</script>
