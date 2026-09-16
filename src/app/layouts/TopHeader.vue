<template>
  <header
    class="@media(display-mode:window-controls-overlay):[-webkit-app-region:drag] @media(display-mode:window-controls-overlay):[app-region:drag] @media(display-mode:window-controls-overlay):min-h-[max(2.5rem,env(titlebar-area-height,2.5rem))] @media(display-mode:window-controls-overlay):pl-[max(env(titlebar-area-inset-left,0px),1rem)] @media(display-mode:window-controls-overlay):pr-[max(env(titlebar-area-inset-right,0px),1rem)] relative z-header flex min-h-10 w-full shrink-0 items-center justify-between border-b border-glass-border bg-surface-panel/90 px-4 backdrop-blur-lg select-none"
  >
    <div :class="NO_DRAG_REGION_CLASS" class="flex min-w-0 flex-1 items-center justify-start">
      <BaseCheckbox
        v-model="uiStore.isLeftOpen"
        v-tooltip="uiStore.isLeftOpen ? '收起侧边栏' : '展开侧边栏'"
        :aria-label="'切换侧边栏'"
        buttonized
        icon-only
        icon="panel-left"
      />

      <BaseDivider
        :inset="'1rem'"
        :length="'0.875rem'"
        :thickness="2"
        class="opacity-80"
        color="glass"
        orientation="vertical"
      />

      <div class="flex items-center gap-md">
        <button
          v-tooltip="'回到工作台'"
          @click="router.push(ROUTE_PATHS.WORKBENCH)"
          aria-label="Fret Logic 首页"
          class="group flex cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-primary/70"
          type="button"
        >
          <span
            class="font-features-['ss01'_1] text-xs font-extrabold tracking-tight whitespace-nowrap text-fg-title transition-colors group-hover:text-primary"
          >
            Fret Logic
          </span>
        </button>
        <BaseSegmentedControl
          :model-value="activeNavPath"
          :options="NAV_OPTIONS"
          @change="router.push($event)"
          width="auto"
        />
      </div>
    </div>

    <div
      :class="[
        NO_DRAG_REGION_CLASS,
        route.path === ROUTE_PATHS.SCORE ? 'inset-y-0 items-stretch' : 'top-1/2 -translate-y-1/2 items-center',
      ]"
      class="@media(display-mode:window-controls-overlay):-translate-x-[calc(50%-(env(titlebar-area-inset-left,0px)-env(titlebar-area-inset-right,0px))/2)] pointer-events-auto absolute left-1/2 z-inner flex -translate-x-1/2"
    >
      <BaseSegmentedControl
        v-if="route.path === ROUTE_PATHS.SCORE"
        :disabled="!scoreEditor.activeSong"
        :model-value="scoreEditor.activeTab"
        :options="scoreModeOptions"
        @change="handleScoreTabChange($event)"
        full-height
        tabbed
        size="lg"
      />
    </div>

    <div :class="NO_DRAG_REGION_CLASS" class="flex min-w-0 flex-1 items-center justify-end gap-xs">
      <!-- 工作台：试听当前和弦（置于右侧操作区最左侧） -->
      <ActionButton
        v-if="route.path === ROUTE_PATHS.WORKBENCH"
        v-tooltip="'播放/试听当前和弦（长按持续发声）'"
        :disabled="editorStore.isFretBoardEmpty || isPlaying"
        :hold-delay="300"
        :icon="isPlaying || isSustaining ? 'square' : 'play'"
        @click="playCurrentChord()"
        @hold-end="stopChordSustain()"
        @hold-start="void startChordSustain(editorStore.draftChord)"
        holdable
        icon-only
        aria-label="播放/试听当前和弦（长按持续发声）"
        color="primary"
        icon-size="xl"
        variant="ghost"
      />
      <!-- 复制/粘贴：和弦页与乐谱页共用，按当前路由分派动作与文案；
           乐谱页粘贴乐谱在所有 tab 常驻（导入乐谱与当前 tab 无关）；
           「预览」tab 复制改派为整曲长图，其余 tab（含编辑歌词）为文字复制 -->
      <template v-for="(btn, btnIndex) in transferButtons" :key="btn.key">
        <!-- 下载乐谱：乐谱导出 tab 时插在复制与「剪切板（粘贴）」之间 -->
        <BaseMenu v-if="btnIndex === downloadBeforeIndex" :items="downloadExportMenuItems" :title="downloadMenuTitle">
          <template #trigger="{ isOpen, pinToggle }">
            <ActionButton
              :aria-expanded="isOpen"
              :color="isOpen ? 'primary' : 'default'"
              :disabled="uiStore.isCopying || !scoreEditor.hasLyrics"
              :variant="isOpen ? 'subtle' : 'ghost'"
              @click="pinToggle()"
              icon-only
              aria-haspopup="menu"
              aria-label="导出下载"
              icon="download"
              icon-size="xl"
              icon-stroke="regular"
            />
          </template>
        </BaseMenu>
        <ActionButton
          v-tooltip="btn.tooltip"
          :aria-label="btn.tooltip"
          :disabled="btn.disabled"
          :icon="btn.icon"
          @click="btn.onClick"
          icon-only
          icon-size="xl"
          variant="ghost"
        />
      </template>

      <!-- 分组分隔线：左侧为文档操作（试听/复制/下载/粘贴），右侧为应用偏好（设置/同步/主题/仓库） -->
      <BaseDivider
        :inset="'0.25rem'"
        :length="'0.875rem'"
        :thickness="2"
        class="opacity-80"
        color="glass"
        orientation="vertical"
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
            aria-label="偏好设置"
            icon="settings"
            icon-size="xl"
            icon-stroke="regular"
            ref="triggerBtnRef"
          />
        </template>

        <HeaderConfigPopover />
      </BasePopover>

      <BaseMenu :items="syncMenuItems" :title="`当前选择 ${settingsStore.syncTarget}`">
        <template #trigger="{ isOpen, pinToggle }">
          <ActionButton
            :aria-expanded="isOpen"
            :color="isOpen ? 'primary' : 'default'"
            :variant="isOpen ? 'subtle' : 'ghost'"
            @click="pinToggle()"
            icon-only
            aria-haspopup="menu"
            aria-label="云端同步"
            icon="cloud"
            icon-size="xl"
            icon-stroke="regular"
          />
        </template>
      </BaseMenu>

      <BaseMenu :items="themeMenuItems">
        <template #trigger="{ isOpen, pinToggle }">
          <ActionButton
            :aria-expanded="isOpen"
            :color="isOpen ? 'primary' : 'default'"
            :variant="isOpen ? 'subtle' : 'ghost'"
            @click="pinToggle()"
            icon-only
            aria-haspopup="menu"
            aria-label="外观设置"
            icon-size="xl"
            icon-stroke="regular"
          >
            <BaseIcon :class="themeTriggerIconClass" :name="themeTriggerIcon" icon-size="xl" icon-stroke="regular" />
          </ActionButton>
        </template>
      </BaseMenu>

      <ActionButton
        v-tooltip.interactive="buildRepoTooltip"
        @click="openSourceRepository()"
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
    :close-locked="isSyncing"
    :confirm-loading="isSyncing"
    @confirm="handleConfirmSync()"
    cancel-text="取消"
    confirm-text="确认同步"
    title="确认同步到云端"
  >
    <div class="py-xs">
      <p class="m-0 text-xs/relaxed text-fg-body">
        确定要将本地数据（和弦库、乐谱库与设置）同步上传至
        <strong class="text-fg-title">{{ currentSchemeName }}</strong> 吗？
      </p>
    </div>
  </BaseModal>

  <BaseModal
    v-model:visible="isPullConfirmOpen"
    :close-locked="isPulling"
    :confirm-loading="isPulling"
    @confirm="handleConfirmPull()"
    cancel-text="取消"
    confirm-text="确认拉取"
    title="确认从云端拉取"
  >
    <div class="py-xs">
      <p class="m-0 text-xs/relaxed text-fg-body">
        确定要从
        <strong class="text-fg-title">{{ currentSchemeName }}</strong>
        拉取云端备份数据吗？拉取完成后将进入导入面板供您勾选应用。
      </p>
    </div>
  </BaseModal>

  <BaseModal
    v-model:visible="isLyricsImportConfirmOpen"
    @confirm="handleConfirmLyricsImport()"
    cancel-text="取消"
    confirm-text="仍要导入"
    title="导入确认"
  >
    <div class="py-xs">
      <p class="m-0 text-xs/relaxed text-fg-body">
        这段文字未包含可识别的和弦或标题结构，确定仍按
        <strong class="text-fg-title">纯歌词</strong>新建乐谱吗？
      </p>
    </div>
  </BaseModal>

  <SyncModalContainer v-model:is-sync-modal-open="isSyncModalOpen" />
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue';

import { useRoute, useRouter } from 'vue-router';

import ActionButton from '@/platform/ui/button/ActionButton.vue';
import BaseCheckbox from '@/platform/ui/checkbox/BaseCheckbox.vue';
import BaseDivider from '@/platform/ui/divider/BaseDivider.vue';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import BaseMenu from '@/platform/ui/menu/BaseMenu.vue';
import BaseModal from '@/platform/ui/modal/BaseModal.vue';
import BasePopover from '@/platform/ui/popover/BasePopover.vue';
import BaseSegmentedControl from '@/platform/ui/segmented/BaseSegmentedControl.vue';
import { useScoreExportActions } from '@/app/layouts/useScoreExportActions';
import { useBackupModals } from '@/app/modals/useBackupModals';
import { useAudioPlayer } from '@/app/services/audio/useAudioPlayer';
import { useSyncService } from '@/app/services/sync/useSyncService';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { getChordName } from '@/domains/chord/theory/theory';
import { useScoreRouteSync } from '@/domains/score/editor/composables/useScoreRouteSync';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useTextTransfer } from '@/domains/score/transfer/useTextTransfer';
import { useTheme } from '@/platform/composables/useTheme';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { useUiStore } from '@/platform/store/uiStore';
import { ROUTE_PATHS, TOAST_WARNING_DURATION_MS } from '@/platform/utils/constants';

import HeaderConfigPopover from './HeaderConfigPopover.vue';

import type { ScoreActiveTab } from '@/domains/score/editor/store/scoreEditorStore';
import type { PortableSong } from '@/domains/score/transfer/textCodec';
import type { PasteSongOutcome } from '@/domains/score/transfer/useTextTransfer';
import type { SyncProviderKind } from '@/platform/types';
import type { IconName } from '@/platform/ui/icons/icons.registry';
import type { MenuItem } from '@/platform/ui/menu/types';
import type { SegmentOption } from '@/platform/ui/segmented/BaseSegmentedControl.vue';

const route = useRoute();
const router = useRouter();
const editorStore = useChordEditorStore();
const scoreEditor = useScoreEditorStore();
const uiStore = useUiStore();
const { isPlaying, isSustaining, playCurrentChord, startChordSustain, stopChordSustain } = useAudioPlayer();

const { copyChordText, pasteChordFromClipboard, copySongText, pasteSongFromClipboard, importPortableSong } =
  useTextTransfer();
const scoreRouteSync = useScoreRouteSync();

/** 乐谱「预览」导出动作与下载菜单标题（长图/PDF/Zip + 尺寸预估），逻辑见 useScoreExportActions.ts */
const { isPreviewExportMode, handleScoreExport, downloadExportMenuItems, downloadMenuTitle } = useScoreExportActions();

/** 下载菜单插入位：仅预览 tab 时插在「剪切板（粘贴）」按钮之前，其余场景不渲染（-1） */
const downloadBeforeIndex = computed(() => {
  if (!isPreviewExportMode.value) return -1;
  return transferButtons.value.findIndex(btn => btn.key === 'paste');
});

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
  const isScore = route.path === ROUTE_PATHS.SCORE;
  // 乐谱「预览」tab：无文字编辑语义，复制改派为整曲长图（复用预览导出链路 handleScoreExport）；
  // 粘贴保持全 tab 可用（导入乐谱与当前 tab 无关，导入后由导入链路自行选中并切换）
  if (isScore && scoreEditor.activeTab === 'preview') {
    const longImageDisabled = uiStore.isCopying || !scoreEditor.hasLyrics;
    return [
      {
        key: 'copy-long-image',
        icon: 'copy',
        tooltip: '复制整曲长图',
        disabled: longImageDisabled,
        onClick: () => void handleScoreExport('copy'),
      },
      {
        key: 'paste',
        icon: 'clipboard-paste',
        tooltip: '从剪切板粘贴',
        disabled: uiStore.isCopying,
        onClick: handlePasteSong,
      },
    ];
  }
  // 乐谱「编辑歌词」tab：复制/粘贴回落到默认分支（文字复制乐谱），不再特殊处理

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
  { label: '和弦', value: ROUTE_PATHS.WORKBENCH, icon: 'layout-grid' },
  { label: '乐谱', value: ROUTE_PATHS.SCORE, icon: 'music' },
];

const { isDark, setTheme, preference: themePreference } = useTheme();

/** 主题按钮触发图标：暗色显示月亮（primary），亮色显示太阳（warning） */
const themeTriggerIcon = computed(() => (isDark.value ? 'moon' : 'sun'));
const themeTriggerIconClass = computed(() => (isDark.value ? 'text-color-primary' : 'text-color-warning'));

const themeMenuItems = computed<MenuItem[]>(() => [
  {
    label: '浅色模式',
    icon: 'sun',
    color: 'var(--color-warning)',
    checked: themePreference.value === 'light',
    action: () => {
      setTheme('light');
    },
  },
  {
    label: '深色模式',
    icon: 'moon',
    color: 'var(--color-primary)',
    checked: themePreference.value === 'dark',
    action: () => {
      setTheme('dark');
    },
  },
  {
    label: '跟随系统',
    icon: 'laptop',
    color: 'var(--text-title)',
    checked: themePreference.value === 'auto',
    action: () => {
      setTheme('auto');
    },
  },
]);

const { triggerGlobalSync, pullFromRemote, resolvePushCredentialIssue, isSyncing, isPulling } = useSyncService();
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

/** 打开同步设置弹窗，并把弹窗内的方案选择器对齐到当前同步目标（保证看到的就是缺 Token 的那一项） */
const openSyncSettings = () => {
  uiStore.syncModalProvider = settingsStore.syncTarget;
  isSyncModalOpen.value = true;
};

/** 菜单「同步」入口的凭据预检：缺失时不进入确认流程、不发起请求，
 *  改为提示并提供「去配置」入口直接打开对应目标的同步设置弹窗 */
const handleSyncMenuClick = () => {
  const issue = resolvePushCredentialIssue();
  if (issue) {
    uiStore.toast.warning(issue, {
      actionText: '去配置',
      duration: TOAST_WARNING_DURATION_MS,
      onAction: () => {
        openSyncSettings();
      },
    });
    return;
  }
  isSyncConfirmOpen.value = true;
};

const syncMenuItems = computed<MenuItem[]>(() => [
  {
    label: isSyncing.value ? '同步中...' : '同步',
    icon: 'refresh-cw',
    disabled: isSyncing.value || isPulling.value,
    action: handleSyncMenuClick,
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

/** 右侧「设置面板」按钮显示范围：工作台常驻显示；乐谱页仅在已打开乐谱且处于
 *  「排列和弦」「预览」tab 时显示——「编辑歌词」tab 及未打开乐谱时不显示（缩放/对齐等设置对纯歌词编辑无意义） */
const showHeaderSettings = computed(() => {
  if (route.path === ROUTE_PATHS.WORKBENCH) return true;
  if (route.path !== ROUTE_PATHS.SCORE) return false;
  return Boolean(scoreEditor.activeSong) && scoreEditor.activeTab !== 'edit';
});

const scoreModeOptions = computed<SegmentOption<ScoreActiveTab>[]>(() => [
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

/** 乐谱页切 Tab：委托 useScoreRouteSync 统一写 Store 并镜像 URL（push 产生历史，可后退回放） */
const handleScoreTabChange = (val: ScoreActiveTab) => {
  void scoreRouteSync.switchTab(val);
};

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
