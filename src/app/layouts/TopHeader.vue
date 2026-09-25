<template>
  <header
    class="relative z-header flex min-h-10 w-full shrink-0 items-center justify-between border-b border-glass-border bg-surface-panel px-4 select-none wco:min-h-[max(2.5rem,env(titlebar-area-height,2.5rem))] wco:pr-[max(env(titlebar-area-inset-right,0px),1rem)] wco:pl-[max(env(titlebar-area-inset-left,0px),1rem)] wco:[-webkit-app-region:drag] wco:[app-region:drag]"
  >
    <div :class="NO_DRAG_REGION_CLASS" class="flex min-w-0 flex-1 items-center justify-start">
      <BaseCheckbox
        v-model="uiStore.isLeftOpen"
        v-tooltip="uiStore.isLeftOpen ? '收起侧边栏' : '展开侧边栏'"
        buttonized
        icon-only
        aria-label="切换侧边栏"
        icon="panel-left"
      />

      <BaseDivider
        :thickness="2"
        class="opacity-80"
        color="glass"
        inset="1rem"
        length="0.875rem"
        orientation="vertical"
      />

      <div class="flex items-center gap-md">
        <!-- 品牌文字恒为纯展示：右侧分段导航已常驻「和弦 / 乐谱」两个入口，
             再让 logo 可点去工作台就与导航项完全重复（同一个目的地两套入口）。
             纯展示也顺带去掉了它自己那层焦点环与 aria 语义（不再是一个可操作控件）。 -->
        <span
          class="font-features-['ss01'_1] text-xs font-extrabold tracking-tight whitespace-nowrap text-fg-title select-none"
        >
          Fret Logic
        </span>
        <BaseSegmentedControl
          :model-value="activeNavPath"
          :options="NAV_OPTIONS"
          @change="router.push(navTarget($event))"
          width="auto"
        />
      </div>
    </div>

    <!-- 居中 Tab 栏：整行绝对铺满 + 内部 justify-center —— 居中锚点只取决于 header 自己的盒宽，
         与左右两组节点的宽窄 / 内容增减完全无关（既不占 flex 流，也不靠左右分栏均分来「凑」居中，
         所以两侧节点怎么变都不会把它顶偏，也不需要 -translate-x-1/2 那层位移）。
         整行铺满故自身不吃指针事件（pointer-events-none），交互与 PWA 拖拽豁免都交给其上的 Tab 栏控件；
         titlebar 左右留白以 padding 让出，居中落在窗口按钮之外的可用区内 -->
    <div
      v-if="route.path === ROUTE_PATHS.SCORE"
      :class="route.path === ROUTE_PATHS.SCORE ? 'items-stretch' : 'items-center'"
      class="pointer-events-none absolute inset-0 z-inner flex justify-center wco:pr-[env(titlebar-area-inset-right,0px)] wco:pl-[env(titlebar-area-inset-left,0px)]"
    >
      <BaseSegmentedControl
        :class="[NO_DRAG_REGION_CLASS, 'pointer-events-auto']"
        :disabled="!scoreEditor.activeSong"
        :model-value="scoreEditor.activeTab"
        :options="scoreModeOptions"
        @change="handleScoreTabChange($event)"
        full-height
        tabbed
        size="lg"
        width="auto"
      />
    </div>

    <div :class="NO_DRAG_REGION_CLASS" class="flex min-w-0 flex-1 items-center justify-end gap-xs">
      <!-- 文档操作区：工作台与乐谱页各由一块独立 template 承载，用 v-if / v-else-if 显式切换。
           两侧的按钮数量、顺序、禁用判据互不相干 —— 增删任一侧不必去读另一侧的条件，
           也不再需要「一份配置数组 + 插入位 + 按 key 把菜单插进 v-for」那套间接层。

           两条贯穿本区的约定：
           1) 一个按钮只做一件事、只用一个图标 —— 「复制文字」与「复制长图」是两个独立按钮，
              不按 tab 改派同一个按钮的动作；
           2) tooltip 是按钮的**唯一说明位**，可用时说「点下去会做什么」、禁用时说「为什么做不了」
              —— 禁用不是把提示摘掉，而是换成原因。此前只有 SyncModalContainer 这么做，现为本区通例；
              原因按判据的先后顺序逐条列出、只报**当前真正触发**的那一条，故不会出现
              「按钮已禁用、提示还写着点它会怎样」的自相矛盾。 -->

      <!-- 工作台：试听当前和弦（置于本区最左侧），随后复制 / 粘贴当前和弦 -->
      <template v-if="route.path === ROUTE_PATHS.WORKBENCH">
        <ActionButton
          v-tooltip="playChordTooltip"
          :disabled="isPlayDisabled"
          :hold-delay="300"
          :icon="isPlayActive ? 'square' : 'play'"
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

        <ActionButton
          v-tooltip="copyChordTooltip"
          :disabled="isCopyChordDisabled"
          @click="handleCopyChord()"
          icon-only
          aria-label="复制当前和弦"
          icon="copy"
          icon-size="xl"
          variant="ghost"
        />

        <ActionButton
          v-tooltip="pasteChordTooltip"
          :disabled="isPasteChordDisabled"
          @click="handlePasteChord()"
          icon-only
          aria-label="从剪切板粘贴"
          icon="clipboard-paste"
          icon-size="xl"
          variant="ghost"
        />
      </template>

      <template v-else-if="route.path === ROUTE_PATHS.SCORE">
        <!-- 乐谱页：文本进出（复制文字 / 粘贴）在前，导出产物（复制长图 / 下载）在后 ——
             同组动作相邻、中间不夹异类按钮。
             四个按钮在三个 tab 都常驻显示，用「互斥的禁用态」表达当前 tab 支持哪一种，
             不做 tab 级显隐 —— 切 tab 时按钮不会左右横跳 -->
        <!-- 复制文字：读写的是乐谱文本本身，与当前看的是编辑视图还是导出预览无关，故三个 tab 常驻可用。
             唯一例外是「预览正在渲染」时暂禁 —— 与粘贴同源（isPreviewBusy），避免与导出链路竞态。
             （历史：拆分前曾按 tab 禁用，注释留了「删掉 isPreviewExportMode 即可放开」的说明；
             该项已按此说明移除，现改为按渲染态禁用，避免注释与 isCopyScoreTextDisabled 的实际判据矛盾） -->
        <ActionButton
          v-tooltip="copyScoreTextTooltip"
          :disabled="isCopyScoreTextDisabled"
          @click="handleCopySong()"
          icon-only
          aria-label="复制乐谱文字"
          icon="copy"
          icon-size="xl"
          variant="ghost"
        />

        <!-- 粘贴：紧邻复制文字 —— 文本进出是同一组动作。
             导入乐谱与当前 tab 无关，全 tab 可用；仅「预览渲染中」（分页图尚未出全）暂禁，
             避免与导出链路竞态 -->
        <ActionButton
          v-tooltip="pasteScoreTooltip"
          :disabled="isPasteScoreDisabled"
          @click="handlePasteSong()"
          icon-only
          aria-label="从剪切板粘贴"
          icon="clipboard-paste"
          icon-size="xl"
          variant="ghost"
        />

        <!-- 复制长图：走预览导出链路，依赖预览渲染产物，故仅「预览」tab 且产物就绪时可用。
             判据与下载菜单同源（canExportScore）—— 两者依赖同一份产物，
             分开写才会冒出「长图能复制、下载却禁用」这类不一致 -->
        <ActionButton
          v-tooltip="copyScoreImageTooltip"
          :disabled="!canExportScore"
          @click="void handleScoreExport('copy')"
          icon-only
          aria-label="复制整曲长图"
          icon="image"
          icon-size="xl"
          variant="ghost"
        />

        <!-- 下载：菜单与触发按钮必须共用 canExportScore。只禁按钮不禁菜单时，hover 仍会展开面板
             并给按钮套上「打开中」的强调样式（禁用元素却表现成可交互）。
             提示只在禁用时挂原因 —— 该菜单是 hover 展开的，可用时再弹一层提示会与面板叠在一起 -->
        <BaseMenu :disabled="!canExportScore" :items="downloadExportMenuItems" :title="downloadMenuTitle">
          <template #trigger="{ isOpen, pinToggle }">
            <ActionButton
              v-tooltip="downloadScoreTooltip"
              :aria-expanded="isOpen"
              :color="isOpen ? 'primary' : 'default'"
              :disabled="!canExportScore"
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
      </template>

      <!-- 分组分隔线：左侧为文档操作（工作台：试听 / 复制 / 粘贴；乐谱：复制文字 / 粘贴 / 复制长图 / 下载），
           右侧为应用偏好（设置 / 同步 / 主题 / 仓库） -->
      <BaseDivider
        :thickness="2"
        class="opacity-80"
        color="glass"
        inset="0.25rem"
        length="0.875rem"
        orientation="vertical"
      />

      <BasePopover
        :disabled="!canUseHeaderSettings"
        :trigger="canHover ? 'hover' : 'click'"
        placement="bottom-end"
        ref="settingsPopoverRef"
      >
        <template #trigger="{ isOpen, pinToggle }">
          <ActionButton
            :aria-expanded="isOpen"
            :color="isOpen ? 'primary' : 'default'"
            :disabled="!canUseHeaderSettings"
            :variant="isOpen ? 'subtle' : 'ghost'"
            @click="canHover && pinToggle()"
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

      <BaseMenu :items="syncMenuItems" :title="`当前选择 ${currentSchemeName}`">
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

      <BaseMenu :items="themeMenuItems" :model="themePreference" @pick="pickTheme($event)">
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

      <template v-if="IS_DEV">
        <BaseDivider
          :thickness="2"
          class="opacity-80"
          color="glass"
          inset="0.25rem"
          length="0.875rem"
          orientation="vertical"
        />

        <!-- 开发面板：仅开发构建渲染，线上产物不含此按钮 -->
        <ActionButton
          v-tooltip="'打开开发面板'"
          @click="isDevPanelOpen = true"
          icon-only
          aria-label="打开开发面板"
          icon="wrench"
          icon-size="xl"
          variant="ghost"
        />
      </template>
    </div>
  </header>

  <!-- 判据用 DevPanel 而非 IS_DEV：该绑定在生产构建被摇成 undefined，两者等价（见脚本内注释） -->
  <DevPanel v-if="DevPanel" v-model:visible="isDevPanelOpen" />

  <BaseModal
    v-model:visible="isSyncConfirmOpen"
    :close-locked="isSyncing"
    :confirm-loading="isSyncing"
    @confirm="handleConfirmSync()"
    cancel-text="取消"
    confirm-text="确认上传"
    title="确认上传至云端"
  >
    <p class="m-0 py-xs text-xs/relaxed text-fg-body">
      确定要将本地数据（和弦库、乐谱库与设置）上传至
      <strong class="text-fg-title">{{ currentSchemeName }}</strong> 吗？
    </p>
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
    <p class="m-0 py-xs text-xs/relaxed text-fg-body">
      确定要从
      <strong class="text-fg-title">{{ currentSchemeName }}</strong>
      拉取云端备份数据吗？拉取完成后将进入导入面板供您勾选应用。
    </p>
    <p v-if="pullAuthorNotice" class="m-0 py-xs text-xs/relaxed text-fg-muted">{{ pullAuthorNotice }}</p>
  </BaseModal>

  <BaseModal
    v-model:visible="isLyricsImportConfirmOpen"
    @confirm="handleConfirmLyricsImport()"
    cancel-text="取消"
    confirm-text="仍要导入"
    title="导入确认"
  >
    <p class="m-0 py-xs text-xs/relaxed text-fg-body">
      这段文字未包含可识别的和弦或标题结构，确定仍按
      <strong class="text-fg-title">纯歌词</strong>新建乐谱吗？
    </p>
  </BaseModal>

  <SyncModalContainer v-model:is-sync-modal-open="isSyncModalOpen" />
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, useTemplateRef, watch } from 'vue';

import { useMediaQuery } from '@vueuse/core';
import { useRoute, useRouter } from 'vue-router';

import ActionButton from '@/platform/ui/button/ActionButton.vue';
import BaseCheckbox from '@/platform/ui/checkbox/BaseCheckbox.vue';
import BaseDivider from '@/platform/ui/divider/BaseDivider.vue';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import BaseMenu from '@/platform/ui/menu/BaseMenu.vue';
import BaseModal from '@/platform/ui/modal/BaseModal.vue';
import BasePopover from '@/platform/ui/popover/BasePopover.vue';
import BaseSegmentedControl from '@/platform/ui/segmented/BaseSegmentedControl.vue';
import { preloadExportActions, useScoreExport } from '@/app/layouts/useScoreExport';
import { useBackupModals } from '@/app/modals/useBackupModals';
import { preloadAudioPlayback, useAudioPlayer } from '@/app/services/audio/useAudioPlayer';
import {
  getSyncProviderLabel,
  getSyncProviderMeta,
  SYNC_PROVIDER_META,
  SYNC_PROVIDER_ORDER,
} from '@/app/services/sync/providerMeta';
import { getBuiltinAuthorTargetNotice } from '@/app/services/sync/syncTargetConfig';
import { preloadSyncActions, useSyncService } from '@/app/services/sync/useSyncService';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { getChordName } from '@/domains/chord/theory/theory';
import { buildScoreQuery, useScoreRouteSync } from '@/domains/score/editor/composables/useScoreRouteSync';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { isPreviewRendering } from '@/domains/score/preview/scorePreviewCache';
import { preloadTextTransferActions, useTextTransfer } from '@/domains/score/transfer/useTextTransfer';
import { useTheme } from '@/platform/composables/useTheme';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { useUiStore } from '@/platform/store/uiStore';
import { MENU_COLOR_PRIMARY, MENU_COLOR_TITLE, MENU_COLOR_WARNING } from '@/platform/ui/menu/menuRowStyle';
import { ROUTE_PATHS } from '@/platform/utils/constants';
import { prefetch } from '@/platform/utils/prefetch';

import HeaderConfigPopover from './HeaderConfigPopover.vue';

import type { ScoreActiveTab } from '@/domains/score/editor/store/scoreEditorStore';
import type { PortableSong } from '@/domains/score/transfer/textCodec';
import type { PasteSongOutcome } from '@/domains/score/transfer/useTextTransfer';
import type { ThemePreference } from '@/platform/composables/useTheme';
import type { MenuItem } from '@/platform/ui/menu/types';
import type { SegmentOption } from '@/platform/ui/segmented/segmentOption';

const route = useRoute();
const router = useRouter();

/**
 * 设置浮层的触发方式：仅在设备**有悬停能力**时才用 hover。
 * 触屏上不存在 hover 态，hover 触发只能靠浏览器在 tap 时合成的 mouseenter 侥幸生效，
 * 而"钉住/关闭"还依赖合成的 mouseleave——不同内核表现不一致，设置入口可能根本进不去。
 * 用 (hover: hover) 而不是 (pointer: coarse)：二合一设备接上鼠标后是 hover，不会误降级。
 */
const canHover = useMediaQuery('(hover: hover)');

const editorStore = useChordEditorStore();
const scoreEditor = useScoreEditorStore();
const uiStore = useUiStore();
const { isPlaying, isSustaining, isAudioPreparing, playCurrentChord, startChordSustain, stopChordSustain } =
  useAudioPlayer();

const { copyChordText, pasteChordFromClipboard, copySongText, pasteSongFromClipboard, importPortableSong } =
  useTextTransfer();
const scoreRouteSync = useScoreRouteSync();

/** 乐谱「预览」导出动作与下载菜单标题（长图/PDF/Zip + 尺寸预估），逻辑见 useScoreExport.ts */
const { isPreviewExportMode, handleScoreExport, downloadExportMenuItems, downloadMenuTitle } = useScoreExport();

/** 「预览导出产物已就绪」判据：预览 tab、非渲染中 / 复制中、有歌词。
 *  由乐谱页三个出口共用 —— 复制长图按钮、下载菜单、下载触发按钮：三者依赖的是同一份产物，
 *  判据分开写迟早会出现「长图能复制、下载却禁用」这类不一致。
 *  菜单侧漏禁更糟：按钮已禁用而菜单仍可 hover 展开时，会弹出面板并给按钮套上「打开中」的强调样式 */
const canExportScore = computed(
  () => isPreviewExportMode.value && !uiStore.isCopying && !isPreviewRendering.value && scoreEditor.hasLyrics
);

/**
 * 预览渲染中（且当前就在预览 tab）：复制乐谱文字 / 粘贴乐谱都与导出链路共用同一条渲染线程，
 * 分页图尚未出全时暂禁，避免与导出竞态。
 * 判据只在此处写一份、两个按钮共用 —— 分开写迟早冒出「粘贴能用、复制却禁用」这类不一致。
 * 注意渲染标记只在预览 tab 参与判断：后台残留的渲染不该禁用其他 tab 的动作。
 */
const isPreviewBusy = computed(() => isPreviewExportMode.value && isPreviewRendering.value);

/** 无结构纯歌词「确认兜底」：待确认的载荷 + 确认弹窗开关 */
const pendingLyricsImport = ref<PortableSong | null>(null);
const isLyricsImportConfirmOpen = ref(false);

/** 工作台可复制条件：指板非空且已解析出和弦名 */
const canCopyChord = computed(() => !editorStore.isFretBoardEmpty && Boolean(getChordName(editorStore.draftChord)));

// ===== 文档操作区各按钮的禁用判据与提示 =====
// 每个按钮一对 computed：禁用判据（驱动 :disabled）+ 提示（驱动 v-tooltip）。
// 提示按「原因 → 动作」两段写，原因分支与判据的分支**同序同数** —— 判据加一条、提示就跟着加一条，
// 两处永远对得上，不会出现「按钮已经禁用、提示还写着点它会怎样」的自相矛盾。

/** 试听按钮的图标判据：已受理 / 正在播放 / 正在持续发声都显示「停止」形。
 *  受理窗口（isAudioPreparing）必须在内 —— 首次点击要等懒加载的音频实现 chunk 到位才翻转
 *  isPlaying，不含它则点击后按钮毫无变化，整段等待看起来就像页面卡住。 */
const isPlayActive = computed(() => isPlaying.value || isSustaining.value || isAudioPreparing.value);

/** 工作台·试听：指板为空（无可试听的内容）或已进入播放态。
 *  「已受理但尚未起音」的那一小段窗口按播放态处理，不给中间文案 —— 点击当刻就是播放态的样子。
 *  禁用判据刻意**不含 isSustaining**：长按持续发声期间按钮必须保持可用 —— 一旦被禁用，
 *  ActionButton 的「禁用即中止长按」会当场补发 hold-end，持续发声刚起就被自己掐掉。
 *  同理 isAudioPreparing 只由点击路径置位、延音路径不碰它（见 useAudioPlayer 的 runPlayback）。 */
const isPlayDisabled = computed(() => editorStore.isFretBoardEmpty || isAudioPreparing.value || isPlaying.value);

/** 工作台·试听提示（原因分支与禁用判据同序同数：指板为空 → 播放中） */
const playChordTooltip = computed(() => {
  if (editorStore.isFretBoardEmpty) return '指板为空，暂无可试听的和弦';
  if (isAudioPreparing.value || isPlaying.value) return '正在播放中';
  return '播放/试听当前和弦（长按持续发声）';
});

/** 工作台·复制当前和弦：防重入锁期间，或指板为空 / 解不出和弦名 */
const isCopyChordDisabled = computed(() => uiStore.isCopying || !canCopyChord.value);

/** 工作台·复制当前和弦提示（`!canCopyChord` 的两种情形各自给原因） */
const copyChordTooltip = computed(() => {
  if (uiStore.isCopying) return '正在复制中';
  if (editorStore.isFretBoardEmpty) return '指板为空，没有可复制的和弦';
  if (!getChordName(editorStore.draftChord)) return '当前指板识别不出和弦名';
  return '复制当前和弦';
});

/** 工作台·粘贴和弦：仅防重入锁（剪贴板内容在读取时才知道是否可用，不预先禁用） */
const isPasteChordDisabled = computed(() => uiStore.isCopying);

/** 工作台·粘贴和弦提示 */
const pasteChordTooltip = computed(() => (uiStore.isCopying ? '正在复制中' : '从剪切板粘贴'));

/** 乐谱·复制文字：防重入锁 + 未打开乐谱 + 预览渲染中（与粘贴同源，见 isPreviewBusy）。
 *  判据与 tab 无关（含「预览」tab 也可用），只有「正在渲染」这一条临时禁用 */
const isCopyScoreTextDisabled = computed(() => uiStore.isCopying || !scoreEditor.activeSong || isPreviewBusy.value);

/** 乐谱·复制文字提示 */
const copyScoreTextTooltip = computed(() => {
  if (uiStore.isCopying) return '正在复制中';
  if (!scoreEditor.activeSong) return '请先打开一首乐谱';
  if (isPreviewBusy.value) return '预览渲染中，暂不可复制';
  return '复制乐谱文字';
});

/** 乐谱·粘贴乐谱：防重入锁 + 预览渲染中（与复制文字同源，见 isPreviewBusy） */
const isPasteScoreDisabled = computed(() => uiStore.isCopying || isPreviewBusy.value);

/** 乐谱·粘贴乐谱提示 */
const pasteScoreTooltip = computed(() => {
  if (uiStore.isCopying) return '正在复制中';
  if (isPreviewBusy.value) return '预览渲染中，暂不可粘贴';
  return '从剪切板粘贴';
});

/** 乐谱·导出产物不可用的原因（空串 = 可用）。
 *  复制长图与下载依赖同一份产物、共用同一条判据 canExportScore，故原因文案也只写一份 ——
 *  分开写迟早冒出「长图能复制、下载却禁用」时两处提示各说各话。
 *  原因分支与 canExportScore 的四项同序同数。 */
const exportScoreBlockReason = computed(() => {
  if (!isPreviewExportMode.value) return '切换到「预览」标签页后可用';
  if (uiStore.isCopying) return '正在复制中';
  if (isPreviewRendering.value) return '预览渲染中，请稍候';
  if (!scoreEditor.hasLyrics) return '乐谱暂无歌词，无可导出的内容';
  return '';
});

/** 乐谱·复制长图提示 */
const copyScoreImageTooltip = computed(() => exportScoreBlockReason.value || '复制整曲长图');

/** 乐谱·下载提示：**仅在禁用时**给原因 —— 该菜单 hover 即展开面板，
 *  可用时再弹一层提示会与面板叠在一起（其余按钮没有这层顾虑，可用时照常说明动作） */
const downloadScoreTooltip = computed(() => (canExportScore.value ? '' : exportScoreBlockReason.value));

/** 工作台：复制当前编辑的和弦文字到剪贴板 */
const handleCopyChord = () => void copyChordText(editorStore.draftChord);

/** 工作台：从剪贴板文字载入编辑器草稿（切「新建」态） */
const handlePasteChord = () => void pasteChordFromClipboard();

/** 乐谱：复制当前乐谱文字到剪贴板 */
const handleCopySong = () => void copySongText(scoreEditor.activeSong);

/** 乐谱：从剪贴板文字导入（始终新建一首乐谱）；无结构纯歌词先弹「确认兜底」交给用户决定。
 *  互斥由动作实现负责（重入时返回 none，不会落地也不会确认） */
const handlePasteSong = async (): Promise<void> => {
  const outcome: PasteSongOutcome = await pasteSongFromClipboard();
  if (outcome.status !== 'needsConfirm') return;
  pendingLyricsImport.value = outcome.portable;
  isLyricsImportConfirmOpen.value = true;
};

/** 用户确认「仍按纯歌词导入」后落地建谱 */
const handleConfirmLyricsImport = () => {
  const portable = pendingLyricsImport.value;
  if (portable) importPortableSong(portable);
  isLyricsImportConfirmOpen.value = false;
  pendingLyricsImport.value = null;
};

/** 打开开源仓库主页（GitHub），使用 noopener 安全新标签页 */
const openSourceRepository = () =>
  void window.open('https://github.com/lo0kie/FretLogic', '_blank', 'noopener,noreferrer');

const activeNavPath = computed(() => {
  const matched = NAV_OPTIONS.find(opt => opt.value === route.path);
  return matched?.value ?? '';
});

/**
 * 顶栏导航目标：进乐谱页时直接落到带参完整 URL（选中乐谱 + 主 Tab），而不是推裸路径。
 *
 * 裸路径会让乐谱页的镜像 watcher 立刻回写补参数，产生一次多余导航；更糟的是「已在乐谱页时
 * 再点乐谱」会先把 URL 打回裸路径（丢掉 id/tab）再由镜像恢复，等于自己把可寻址状态抖掉一次。
 * URL 形状规则与镜像共用 buildScoreQuery，避免两处各写一遍「edit 省略」逻辑而漂移。
 */
const navTarget = (path: string) =>
  path === ROUTE_PATHS.SCORE && scoreEditor.activeSongId
    ? { path, query: buildScoreQuery(scoreEditor.activeSongId, scoreEditor.activeTab) }
    : path;

const NAV_OPTIONS: SegmentOption<string>[] = [
  { label: '和弦', value: ROUTE_PATHS.WORKBENCH, icon: 'layout-grid' },
  { label: '乐谱', value: ROUTE_PATHS.SCORE, icon: 'music' },
];

const { isDark, setTheme, preference: themePreference } = useTheme();

/** 主题按钮触发图标：暗色显示月亮（primary），亮色显示太阳（warning） */
const themeTriggerIcon = computed(() => (isDark.value ? 'moon' : 'sun'));
const themeTriggerIconClass = computed(() => (isDark.value ? 'text-primary' : 'text-warning'));

/** 主题菜单：勾选态与点击都由菜单层的 `model` / `pick` 派生，这里只描述「有哪些项」 */
const themeMenuItems: MenuItem[] = [
  { label: '浅色模式', icon: 'sun', color: MENU_COLOR_WARNING, value: 'light' },
  { label: '深色模式', icon: 'moon', color: MENU_COLOR_PRIMARY, value: 'dark' },
  { label: '跟随系统', icon: 'laptop', color: MENU_COLOR_TITLE, value: 'auto' },
];

/** 菜单项 value 是 string，这里收窄回主题偏好联合类型 */
const pickTheme = (value: string): void => void setTheme(value as ThemePreference);

const { triggerGlobalSync, pullFromRemote, resolvePushCredentialIssue, isSyncing, isPulling } = useSyncService();
// 空闲时预取各懒加载动作链的 chunk（同步/导出/试听/复制粘贴）：
// 首次点击不再经历「chunk 下载 → 模块求值」的反馈死区，busy/loading 状态立即翻转。
// 经 prefetch 统一吞掉失败：弱网/断网下 chunk 拉不到是常态，不能让它变成未处理 rejection，
// 也不能让上面这句承诺在失败时静默失真（详见 platform/utils/prefetch）。
onMounted(() => {
  const idle = (cb: () => void): void => {
    if ('requestIdleCallback' in window) requestIdleCallback(cb, { timeout: 5000 });
    else setTimeout(cb, 2000);
  };
  idle(() => {
    prefetch(preloadSyncActions, 'TopHeader');
    prefetch(preloadExportActions, 'TopHeader');
    prefetch(preloadAudioPlayback, 'TopHeader');
    prefetch(preloadTextTransferActions, 'TopHeader');
  });
});
const backupModals = useBackupModals();
const settingsStore = useSettingsStore();

const isSyncConfirmOpen = ref(false);
const isPullConfirmOpen = ref(false);

const currentSchemeName = computed(() => getSyncProviderLabel(settingsStore.syncTarget));

/**
 * 拉取确认里的数据归属提示：目标仍是出厂默认的 gitee + 作者仓库时非空。
 * 与启动检测、首访引导、同步设置弹窗共用同一判据——否则用户会把作者示例数据当成自己的基线拉进来。
 */
const pullAuthorNotice = computed(() => getBuiltinAuthorTargetNotice());

/** 用户确认上传：执行全局同步，成功后关闭确认弹窗 */
const handleConfirmSync = async () => {
  const ok = await triggerGlobalSync();
  if (ok) isSyncConfirmOpen.value = false;
};

/** 用户确认拉取：拉取成功后关闭弹窗，并携带云端数据进入导入面板供勾选应用 */
const handleConfirmPull = async () => {
  const payload = await pullFromRemote();
  isPullConfirmOpen.value = false;
  if (payload) backupModals.openImportWithPayload(payload, '云端同步数据');
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
    // 通知而非常驻 Message：「去配置」入口随 toast 飘走就没了，用户得记住自己去顶栏找设置
    uiStore.notice.warning({
      title: issue,
      actionText: '去配置',
      onAction: () => void openSyncSettings(),
    });
    return;
  }
  isSyncConfirmOpen.value = true;
};

const syncMenuItems = computed<MenuItem[]>(() => [
  {
    label: isSyncing.value ? '推送中...' : '推送到云端',
    icon: 'refresh-cw',
    disabled: isSyncing.value || isPulling.value,
    action: handleSyncMenuClick,
  },
  {
    label: isPulling.value ? '拉取中...' : '从云端拉取',
    icon: 'cloud-download',
    disabled: isSyncing.value || isPulling.value,
    action: () => {
      isPullConfirmOpen.value = true;
    },
  },
  {
    label: '同步目标',
    icon: getSyncProviderMeta(settingsStore.syncTarget).icon,
    // 子菜单是单选组：勾选态与点击由本层的 model / onPick 派生，子项只描述 label/icon/value。
    // 收窄用 find 而非 as 断言 —— 非法值直接忽略，不会静默写坏 syncTarget
    model: settingsStore.syncTarget,
    onPick: value => {
      const kind = SYNC_PROVIDER_ORDER.find(k => k === value);
      if (kind !== undefined) settingsStore.syncTarget = kind;
    },
    children: SYNC_PROVIDER_ORDER.map(kind => ({
      label: SYNC_PROVIDER_META[kind].label,
      icon: SYNC_PROVIDER_META[kind].icon,
      value: kind,
      keepOpen: true,
    })),
  },
  // 同步设置入口放在一级：「同步目标」子菜单只负责切换「推送 / 拉取」使用的云端方案，
  // 真正填写凭据的弹窗不该再藏进子菜单里多绕一层
  {
    label: '同步设置',
    icon: 'settings',
    divided: true,
    // 走 openSyncSettings 而非直接置位：弹窗内的方案选择器需对齐当前同步目标，
    // 保证看到的就是缺凭据的那一项
    action: openSyncSettings,
  },
]);

/** 右侧「设置面板」按钮的可用判据（按钮本身常驻显示，条件不满足时禁用而非隐藏）：
 *  工作台可用；乐谱页需已打开乐谱且处于「排列和弦」「预览」tab ——
 *  「编辑歌词」tab 及未打开乐谱时禁用（缩放/对齐等设置对纯歌词编辑无意义） */
const canUseHeaderSettings = computed(() => {
  if (route.path === ROUTE_PATHS.WORKBENCH) return true;
  if (route.path !== ROUTE_PATHS.SCORE) return false;
  return Boolean(scoreEditor.activeSong) && scoreEditor.activeTab !== 'edit';
});

/** 设置面板改为常驻后，可用性失效时要显式收起已展开的面板：
 *  原先是靠 v-if 卸载整个 BasePopover 达成的，常驻后不会再有那次卸载
 *  （例：预览 tab 上面板开着时，后退到「编辑歌词」tab） */
const settingsPopoverRef = useTemplateRef<InstanceType<typeof BasePopover>>('settingsPopoverRef');
watch(canUseHeaderSettings, canUse => {
  if (!canUse) settingsPopoverRef.value?.close('settings-unavailable');
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
const handleScoreTabChange = (val: ScoreActiveTab) => void scoreRouteSync.switchTab(val);

const isSyncModalOpen = ref(false);
/** 开发面板（仅 dev 构建挂载）：构建信息 / 数据概览 / 缓存与存储操作 */
const IS_DEV = import.meta.env.DEV;
const isDevPanelOpen = ref(false);
// DEV 判据必须落在**模块顶层**，否则这块 dev-only 代码摇不掉：`defineAsyncComponent(() => import(...))`
// 是不透明调用，Rollup 不能假设它无副作用，顶层无条件执行时那条动态 import 边必然保留 —— dist 里会
// 白多出一个永不被请求的 chunk（DevPanel + devSeedData，约 20KB）。写成下面的三元后，构建期
// `import.meta.env.DEV` 被 vite:define 换成字面量 false，整个调用连同 import 边一起被摇掉。
// （已用本项目实装的 rollup 4.60.4 + @vue/compiler-sfc 3.5.11 跑单进程探针验证：三元式不产出该 chunk，
// 无条件式产出；不必为了复核它去跑一次全量构建。）
// 代价是类型为 `DefineComponent | undefined`，故模板侧用 `v-if="DevPanel"` 而非 `v-if="IS_DEV"`：生产
// 构建下两者恒等（字面量 false 同样只剩 undefined 分支），但判据与「组件是否存在」不会再各说各话。
const DevPanel = IS_DEV ? defineAsyncComponent(() => import('@/app/modals/DevPanel.vue')) : undefined;
/** PWA 窗口控制拖拽拦截类名 */
const NO_DRAG_REGION_CLASS = 'wco:[-webkit-app-region:no-drag] wco:[app-region:no-drag]';
const SyncModalContainer = defineAsyncComponent(() => import('@/app/modals/SyncModalContainer.vue'));
/** GitHub 按钮 tooltip：构建信息 + 点击跳转仓库提示（交互式，字符串数组多行换行） */
const buildRepoTooltip = computed(() => {
  const builtAt = new Date(__BUILD_INFO__.time).toLocaleString('zh-CN', { hour12: false });
  return ['Fret Logic', `版本：${__BUILD_INFO__.commit}`, `构建时间：${builtAt}`, '点击图标打开 GitHub 查看项目源码'];
});
</script>
