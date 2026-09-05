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
        icon-only
        icon="panel-left"
      />

      <div class="bg-glass-border mx-0.5 h-3.5 w-px shrink-0 opacity-80" />

      <div class="gap-md flex items-center">
        <button
          v-tooltip="'回到工作台'"
          @click="router.push('/workbench')"
          aria-label="Fret Logic 首页"
          class="group focus-visible:ring-primary/70 flex cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors outline-none select-none focus-visible:ring-2"
          type="button"
        >
          <span
            class="text-text-title group-hover:text-primary font-features-['ss01'_1] text-xs font-extrabold tracking-tight whitespace-nowrap transition-colors"
          >
            Fret Logic
          </span>
        </button>
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
        size="lg"
      />
    </div>

    <div :class="NO_DRAG_REGION_CLASS" class="gap-xs flex min-w-0 flex-1 items-center justify-end">
      <!-- 工作台：试听当前和弦（置于右侧操作区最左侧） -->
      <ActionButton
        v-if="route.path === '/workbench'"
        v-tooltip="'播放/试听当前和弦'"
        :disabled="editorStore.isFretBoardEmpty || isPlaying"
        :icon="isPlaying ? 'square' : 'play'"
        @click="playCurrentChord"
        icon-only
        aria-label="播放/试听当前和弦"
        color="primary"
        icon-size="xl"
        variant="ghost"
      />
      <!-- 复制/粘贴：和弦页与乐谱页共用，按当前路由分派动作与文案 -->
      <ActionButton
        v-for="btn in transferButtons"
        v-tooltip="btn.tooltip"
        :aria-label="btn.tooltip"
        :disabled="btn.disabled"
        :icon="btn.icon"
        :key="btn.key"
        @click="btn.onClick"
        icon-only
        icon-size="xl"
        variant="ghost"
      />

      <!-- 乐谱预览 tab：复制 / 下载当前乐谱的整曲长图 -->
      <PopoverMenu
        v-if="route.path === '/score' && scoreEditor.activeTab === 'preview'"
        :disabled="!scoreEditor.hasLyrics"
        :items="scoreExportMenuItems"
        aria-label="导出整曲长图"
        icon="download"
        title="导出整曲长图"
      />

      <BasePopover v-if="showHeaderSettings" placement="bottom-end" trigger="hover">
        <template #trigger="{ isOpen, pinToggle }">
          <ActionButton
            :aria-expanded="isOpen"
            :color="isOpen ? 'primary' : 'default'"
            :variant="isOpen ? 'subtle' : 'ghost'"
            @click="pinToggle()"
            icon-only
            aria-haspopup="true"
            aria-label="设置面板"
            icon="sliders-horizontal"
            icon-size="xl"
            icon-stroke="regular"
            ref="triggerBtnRef"
          />
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

      <ActionButton
        v-tooltip.interactive="buildRepoTooltip"
        @click="openSourceRepository"
        icon-only
        aria-label="GitHub 仓库与构建信息"
        icon="github"
        icon-size="xl"
        variant="ghost"
      />
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

  <BaseModal
    v-model:visible="isLyricsImportConfirmOpen"
    @confirm="handleConfirmLyricsImport"
    cancel-text="取消"
    confirm-text="仍要导入"
    title="导入确认"
    width="w-80"
  >
    <div class="py-xs">
      <p class="text-text-body m-0 text-xs leading-relaxed">
        这段文字未包含可识别的和弦或标题结构，确定仍按
        <strong class="text-text-title">纯歌词</strong>新建乐谱吗？
      </p>
    </div>
  </BaseModal>

  <SyncModalContainer v-model:is-sync-modal-open="isSyncModalOpen" />
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useBackupModals } from '@/app/modals/useBackupModals';
import { useAudioPlayer } from '@/app/services/audio/useAudioPlayer';
import { useSyncService } from '@/app/services/sync/useSyncService';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { getChordName } from '@/domains/chord/theory/theory';
import { useScoreLinesData } from '@/domains/score/editor/composables/useScoreLinesData';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { prepareWorkerExportPayload, runWorkerExport } from '@/domains/score/preview/services/workerExportService';
import type { PortableSong } from '@/domains/score/transfer/textCodec';
import { useTextTransfer, type PasteSongOutcome } from '@/domains/score/transfer/useTextTransfer';
import { useTheme } from '@/platform/composables/useTheme';
import { writeBlobToClipboard } from '@/platform/services/clipboard/clipboard';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { useUiStore } from '@/platform/store/uiStore';
import type { SyncProviderKind } from '@/platform/types';
import ActionButton from '@/platform/ui/button/ActionButton.vue';
import BaseCheckbox from '@/platform/ui/checkbox/BaseCheckbox.vue';
import type { ContextMenuItem } from '@/platform/ui/context-menu/ContextMenuItems.vue';
import type { IconName } from '@/platform/ui/icons/icons.registry';
import BaseModal from '@/platform/ui/modal/BaseModal.vue';
import BasePopover from '@/platform/ui/popover/BasePopover.vue';
import PopoverMenu from '@/platform/ui/popover/PopoverMenu.vue';
import BaseSegmentedControl, { type SegmentOption } from '@/platform/ui/segmented/BaseSegmentedControl.vue';
import { buildExportFileName, triggerBlobDownload } from '@/platform/utils/canvas';

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
const { copyChordText, pasteChordFromClipboard, copySongText, pasteSongFromClipboard, importPortableSong } =
  useTextTransfer();

/** 无结构纯歌词「确认兜底」：待确认的载荷 + 确认弹窗开关 */
const pendingLyricsImport = ref<PortableSong | null>(null);
const isLyricsImportConfirmOpen = ref(false);

/** 复制/粘贴按钮配置项：由 transferButtons 统一描述，供模板 v-for 渲染 */
interface TransferButton {
  key: string;
  icon: IconName;
  tooltip: string;
  disabled: boolean;
  onClick: () => void;
}

/** 复制/粘贴防重入锁：包装异步动作，执行期间禁用按钮 */
const withTransferLock = (fn: () => Promise<void>): void => {
  if (uiStore.isCopying) return;
  uiStore.isCopying = true;
  void fn().finally(() => {
    uiStore.isCopying = false;
  });
};

/** 工作台可复制条件：指板非空且已解析出和弦名 */
const canCopyChord = computed(() => !editorStore.isFretBoardEmpty && Boolean(getChordName(editorStore.draftChord)));

/** 工作台：复制当前编辑的和弦文字到剪贴板 */
const handleCopyChord = () => withTransferLock(() => copyChordText(editorStore.draftChord));

/** 工作台：从剪贴板文字载入编辑器草稿（切「新建」态） */
const handlePasteChord = () => withTransferLock(pasteChordFromClipboard);

/** 乐谱：复制当前乐谱文字到剪贴板 */
const handleCopySong = () => withTransferLock(() => copySongText(scoreEditor.activeSong));

/** 乐谱：从剪贴板文字导入（始终新建一首乐谱）；无结构纯歌词先弹「确认兜底」交给用户决定 */
const handlePasteSong = () =>
  withTransferLock(async () => {
    const outcome: PasteSongOutcome = await pasteSongFromClipboard();
    if (outcome.status !== 'needsConfirm') return;
    pendingLyricsImport.value = outcome.portable;
    isLyricsImportConfirmOpen.value = true;
  });

/** 用户确认「仍按纯歌词导入」后落地建谱 */
const handleConfirmLyricsImport = () => {
  const portable = pendingLyricsImport.value;
  if (portable) importPortableSong(portable);
  isLyricsImportConfirmOpen.value = false;
  pendingLyricsImport.value = null;
};

/** 打开开源仓库主页（GitHub），使用 noopener 安全新标签页 */
const openSourceRepository = () => {
  window.open('https://github.com/lo0kie/FretLogic', '_blank', 'noopener,noreferrer');
};

/** 复制/粘贴按钮配置：和弦页与乐谱页共用，按当前路由分派动作、文案与禁用态 */
const transferButtons = computed<TransferButton[]>(() => {
  const isScore = route.path === '/score';
  return [
    {
      key: 'copy',
      icon: 'copy',
      tooltip: isScore ? '复制当前乐谱' : '复制当前和弦',
      disabled: uiStore.isCopying || (isScore ? !scoreEditor.activeSong : !canCopyChord.value),
      onClick: isScore ? handleCopySong : handleCopyChord,
    },
    {
      key: 'paste',
      icon: 'clipboard-paste',
      tooltip: isScore ? '从剪切板粘贴' : '从剪切板粘贴',
      disabled: uiStore.isCopying,
      onClick: isScore ? handlePasteSong : handlePasteChord,
    },
  ];
});

const activeNavPath = computed(() => {
  const matched = NAV_OPTIONS.find(opt => opt.value === route.path);
  return matched?.value ?? '';
});

const NAV_OPTIONS: SegmentOption<string>[] = [
  { label: '和弦', value: '/workbench', icon: 'layout-grid' },
  { label: '乐谱', value: '/score', icon: 'music' },
];

const { isDark, setTheme, preference: themePreference } = useTheme();

/** 主题按钮触发图标：暗色显示月亮（primary），亮色显示太阳（warning） */
const themeTriggerIcon = computed(() => (isDark.value ? 'moon' : 'sun'));
const themeTriggerIconClass = computed(() => (isDark.value ? 'text-color-primary' : 'text-color-warning'));

const themeMenuItems = computed<ContextMenuItem[]>(() => [
  {
    label: '浅色模式',
    icon: 'sun',
    color: 'var(--color-warning)',
    checked: themePreference.value === 'light',
    action: () => {
      setTheme('light');
      emit('toggle-theme', 'light');
    },
  },
  {
    label: '深色模式',
    icon: 'moon',
    color: 'var(--color-primary)',
    checked: themePreference.value === 'dark',
    action: () => {
      setTheme('dark');
      emit('toggle-theme', 'dark');
    },
  },
  {
    label: '跟随系统',
    icon: 'laptop',
    color: 'var(--text-title)',
    checked: themePreference.value === 'auto',
    action: () => {
      setTheme('auto');
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
    icon: 'refresh-cw',
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
      settingsStore.scoreLayoutAlign
    );
    const { blobs } = await runWorkerExport(payload);
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
      label: '复制整曲长图',
      icon: 'copy',
      disabled: !hasLyrics,
      action: () => {
        void handleScoreExport('copy');
      },
    },
    {
      label: '下载整曲长图',
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
/** GitHub 按钮 tooltip：构建信息 + 点击跳转仓库提示（交互式，字符串数组多行换行） */
const buildRepoTooltip = computed(() => {
  const builtAt = new Date(__BUILD_INFO__.time).toLocaleString('zh-CN', { hour12: false });
  return ['Fret Logic', `版本：${__BUILD_INFO__.commit}`, `构建时间：${builtAt}`, '点击图标打开 GitHub 查看项目源码'];
});
</script>
