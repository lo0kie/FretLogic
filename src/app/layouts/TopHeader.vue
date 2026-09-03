<template>
  <header
    class="z-header border-glass-border bg-bg-panel/90 @media(display-mode:window-controls-overlay):[-webkit-app-region:drag] @media(display-mode:window-controls-overlay):[app-region:drag] @media(display-mode:window-controls-overlay):min-h-[max(2.5rem,env(titlebar-area-height,2.5rem))] @media(display-mode:window-controls-overlay):pl-[max(env(titlebar-area-inset-left,0px),1rem)] @media(display-mode:window-controls-overlay):pr-[max(env(titlebar-area-inset-right,0px),1rem)] relative box-border flex min-h-10 w-full shrink-0 items-center justify-between border-b px-4 backdrop-blur-lg select-none"
  >
    <div :class="NO_DRAG_REGION_CLASS" class="gap-sm flex min-w-0 flex-1 items-center justify-start">
      <BaseCheckbox
        v-model="uiStore.isLeftOpen"
        v-tooltip="uiStore.isLeftOpen ? '收起侧边栏' : '展开侧边栏'"
        :aria-label="'切换侧边栏'"
        buttonized
        icon="panel-left"
        icon-only
      />

      <div class="bg-glass-border mx-[0.1rem] h-[0.7rem] w-px" />

      <div class="gap-md flex items-center">
        <span class="text-text-title font-features-['ss01'_1] text-xs font-extrabold tracking-tight whitespace-nowrap">
          Fret Logic
        </span>
        <BaseSegmentedControl :model-value="activeNavPath" :options="NAV_OPTIONS" @change="path => router.push(path)" />
      </div>
    </div>

    <div
      :class="[
        NO_DRAG_REGION_CLASS,
        route.path === '/score' ? 'inset-y-0 items-stretch' : 'top-1/2 -translate-y-1/2 items-center',
      ]"
      class="z-inner @media(display-mode:window-controls-overlay):-translate-x-[calc(50%-(env(titlebar-area-inset-left,0px)-env(titlebar-area-inset-right,0px))/2)] pointer-events-auto absolute left-1/2 flex -translate-x-1/2"
    >
      <BaseSegmentedControl
        v-if="route.path === '/score'"
        v-model="scoreEditor.activeTab"
        :disabled="!scoreEditor.activeSong"
        :options="scoreModeOptions"
        @change="handleScoreTabChange"
        full-height
        tabbed
      />
    </div>

    <div :class="NO_DRAG_REGION_CLASS" class="gap-xs flex min-w-0 flex-1 items-center justify-end">
      <!-- 工作台：试听当前和弦（置于右侧操作区最左侧） -->
      <ActionButton
        v-if="route.path === '/workbench'"
        v-tooltip="'播放/试听当前和弦'"
        :disabled="editorStore.isFretBoardEmpty || isPlaying"
        @click="playCurrentChord"
        aria-label="播放/试听当前和弦"
        color="primary"
        icon-only
        variant="subtle"
      >
        <BaseIcon :name="isPlaying ? 'square' : 'play'" :size="18" :stroke-width="2.2" />
      </ActionButton>

      <!-- 乐谱预览 tab：复制 / 下载当前乐谱的整曲长图 -->
      <PopoverMenu
        v-if="route.path === '/score' && scoreEditor.activeTab === 'preview'"
        :disabled="!scoreEditor.hasLyrics"
        :items="scoreExportMenuItems"
        aria-label="导出乐谱图片"
        icon="download"
      />

      <BasePopover v-if="showHeaderSettings" placement="bottom-end" trigger="hover">
        <template #trigger="{ isOpen, pinToggle }">
          <ActionButton
            :aria-expanded="isOpen"
            :color="isOpen ? 'primary' : 'default'"
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

      <PopoverMenu :items="syncMenuItems" aria-label="云端同步" icon="cloud" />

      <PopoverMenu
        :icon="themeTriggerIcon"
        :icon-class="themeTriggerIconClass"
        :items="themeMenuItems"
        aria-label="外观设置"
      />

      <ActionButton v-tooltip.interactive="buildInfoTooltip" aria-label="构建信息" icon-only variant="ghost">
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
import { computed, defineAsyncComponent, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import ActionButton from '@/components/ui/ActionButton.vue';
import BaseCheckbox from '@/components/ui/BaseCheckbox.vue';
import BaseIcon from '@/components/ui/BaseIcon.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import BasePopover from '@/components/ui/BasePopover.vue';
import BaseSegmentedControl, { type SegmentOption } from '@/components/ui/BaseSegmentedControl.vue';
import type { ContextMenuItem } from '@/components/ui/context-menu/ContextMenuItems.vue';
import type { IconName } from '@/components/ui/icons.registry';
import PopoverMenu from '@/components/ui/PopoverMenu.vue';
import { useScoreLinesData } from '@/features/score-editor/composables/useScoreLinesData';
import { prepareWorkerExportPayload, runWorkerExport } from '@/services/export/workerExportService';
import type { SyncProviderKind } from '@/services/sync/provider';
import { useAudioPlayer } from '@/shared/composables/useAudioPlayer';
import { useBackupModals } from '@/shared/composables/useBackupModals';
import { useSyncService } from '@/shared/composables/useSyncService';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { globalDarkMode, setThemeMode, themePreference } from '@/stores/globalState';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';
import { buildExportFileName, triggerBlobDownload, writeBlobToClipboard } from '@/utils/score/score-export';

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
const { chordsLookupMap } = useScoreLinesData();

const activeNavPath = computed(() => {
  const matched = NAV_OPTIONS.find(opt => opt.value === route.path);
  return matched?.value ?? '';
});

const NAV_OPTIONS: SegmentOption<string>[] = [
  { label: '和弦', value: '/workbench' },
  { label: '乐谱', value: '/score' },
];

/** 主题按钮触发图标：暗色显示月亮（primary），亮色显示太阳（warning） */
const themeTriggerIcon = computed(() => (globalDarkMode.value ? 'moon' : 'sun'));
const themeTriggerIconClass = computed(() => (globalDarkMode.value ? 'text-color-primary' : 'text-color-warning'));

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
  gitee: 'Gitee',
  webdav: 'WebDAV',
};

const SYNC_TARGET_ICONS: Record<SyncProviderKind, IconName> = {
  server: 'server',
  github: 'github',
  gitee: 'git-branch',
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
        label: 'Gitee',
        icon: 'git-branch',
        checked: settingsStore.syncTarget === 'gitee',
        keepOpen: true,
        action: () => {
          settingsStore.syncTarget = 'gitee';
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

/** 右侧「设置面板」按钮显示范围：工作台已直接放置右侧常驻设置面板；顶部设置按钮仅在乐谱模式「排列和弦」下显示 */
const showHeaderSettings = computed(() => route.path === '/score' && scoreEditor.activeTab === 'interactive');

const scoreModeOptions = computed<SegmentOption<'edit' | 'interactive' | 'preview'>[]>(() => [
  { label: '编辑歌词', value: 'edit' },
  {
    label: '排列和弦',
    value: 'interactive',
    disabled: !scoreEditor.hasLyrics,
  },
  {
    label: '预览',
    value: 'preview',
    disabled: !scoreEditor.hasLyrics,
  },
]);

/** 乐谱模式切换回调：无歌词时切到需要歌词的 tab 给出提示（选项本身已被禁用，双保险） */
const handleScoreTabChange = (val: 'edit' | 'interactive' | 'preview') => {
  if (val !== 'edit' && !scoreEditor.hasLyrics) {
    uiStore.toast.warning('请先在“编辑歌词”模式下输入歌词内容');
  }
};

/** 整曲全部歌词行索引（预览/导出始终覆盖全曲） */
const allLyricsLineIndices = (): number[] => {
  const lyrics = scoreEditor.activeSong?.lyrics;
  if (!lyrics) return [];
  return Array.from({ length: lyrics.split('\n').length }, (_, i) => i);
};

/**
 * 预览 tab 的导出：整曲经 Worker 离屏渲染为一张长图（normal 模式），
 * 再按操作写入剪贴板或触发浏览器下载。
 */
const handleScoreExport = async (op: 'copy' | 'download') => {
  if (uiStore.isCopying) return;
  const song = scoreEditor.activeSong;
  const lineIndices = allLyricsLineIndices();
  if (!song || lineIndices.length === 0) return;

  uiStore.isCopying = true;
  uiStore.toast.info('正在渲染整曲长图...');
  try {
    const payload = prepareWorkerExportPayload(
      song,
      lineIndices,
      chordsLookupMap.value,
      'normal',
      settingsStore.scoreChordShorthand,
      true
    );
    const blobs = await runWorkerExport(payload);
    if (blobs.length === 0) throw new Error('未能生成有效的导出图片');

    if (op === 'copy') {
      await writeBlobToClipboard(blobs[0]!);
      uiStore.toast.success('成功复制至系统剪贴板');
    } else {
      triggerBlobDownload(blobs[0]!, `${buildExportFileName(song.title || '')}.jpg`);
      uiStore.toast.success('已开始下载');
    }
  } catch (err) {
    console.error('Score export error:', err);
    uiStore.toast.error(err instanceof Error ? err.message : '导出失败');
  } finally {
    uiStore.isCopying = false;
  }
};

/** 预览 tab 的导出菜单：复制 / 下载 整曲长图（平级两项，无子菜单） */
const scoreExportMenuItems = computed<ContextMenuItem[]>(() => {
  const hasLyrics = scoreEditor.hasLyrics;
  return [
    {
      label: '复制',
      icon: 'copy',
      disabled: !hasLyrics,
      action: () => {
        void handleScoreExport('copy');
      },
    },
    {
      label: '下载',
      icon: 'download',
      disabled: !hasLyrics,
      action: () => {
        void handleScoreExport('download');
      },
    },
  ];
});

const isSyncModalOpen = ref(false);
/** PWA 窗口控制拖拽拦截类名 */
const NO_DRAG_REGION_CLASS =
  '@media(display-mode:window-controls-overlay):[-webkit-app-region:no-drag] @media(display-mode:window-controls-overlay):[app-region:no-drag]';
const SyncModalContainer = defineAsyncComponent(() => import('@/app/modals/SyncModalContainer.vue'));
const buildInfoTooltip = computed(() => {
  const builtAt = new Date(__BUILD_INFO__.time).toLocaleString('zh-CN', { hour12: false });
  return `Fret Logic\n版本：${__BUILD_INFO__.commit}\n构建时间：${builtAt}`;
});
</script>
