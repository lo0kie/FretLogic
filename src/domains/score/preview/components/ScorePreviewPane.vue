<template>
  <div class="relative box-border flex min-h-0 flex-1 flex-col">
    <div v-if="!scoreEditor.activeSong || !hasLyricsText" class="flex flex-1 items-center justify-center">
      <EmptyState
        description="请先在“编辑歌词”模式下输入歌词内容，再查看整曲预览"
        icon="file-text"
        size="lg"
        title="暂无预览内容"
      />
    </div>

    <!-- A4 自动分页预览：整曲渲染为若干 A4 页，横向排开，滚轮左右翻页浏览；
         页面超出视口高度（自定义放大）时切换为纵向浏览：禁用横向翻页滚轮、保留双轴滚动，
         滚轮回归竖向滚动以便阅读超高页 -->
    <template v-else>
      <div
        v-scrollbar="{ onScroll: closeAllPopovers }"
        v-wheel-scroll="{ disabled: isTallerThanViewport, smooth: true }"
        class="no-scrollbar relative box-border min-h-0 flex-1 overflow-auto p-6"
        ref="previewScrollRef"
      >
        <!-- 内容行：够宽时自动水平居中（mx-auto），超宽时 margin 归 0 自然从左侧滚动；
             页面超出视口高度时改为顶部对齐，避免 Flex 居中在负方向裁切掉页面顶部 -->
        <div
          :class="isTallerThanViewport ? 'min-h-full items-start' : 'h-full items-center'"
          class="mx-auto flex w-max gap-xl"
        >
          <!-- 首帧渲染中 -->
          <div
            v-if="isRendering && pages.length === 0"
            class="flex min-w-[320px] items-center justify-center gap-2 text-sm text-fg-disabled"
          >
            <BaseIcon class="size-4 animate-spin text-primary" name="loader-2" />
            <span>正在生成预览...</span>
          </div>

          <!-- 渲染失败（无任何页） -->
          <div
            v-else-if="!isRendering && errorMessage && pages.length === 0"
            class="flex min-w-[320px] flex-col items-center gap-2 text-sm"
          >
            <span class="text-danger">{{ errorMessage }}</span>
            <ActionButton @click="generate(true)" label="重试" size="sm" variant="subtle" />
          </div>

          <!-- 分页页流：按缩放模式决定高度（自适应=fitPercent 换算高，自定义=按百分比等比），横向排列。
               容器首次测量前（containerHeight=0）禁用高度过渡：此时 fitPercent 回退 100% 会先渲染放大尺寸，
               测量完成回落到实际比例——带过渡会回放“从大缩小”的闪动，未测量期禁用后同帧落位无动画 -->
          <div
            v-for="(url, index) in pages"
            :class="[
              menuTargetIndex === index ? 'outline-primary' : 'outline-transparent',
              containerHeight > 0
                ? 'transition-[outline,box-shadow,ring-color,height]'
                : 'transition-[outline,box-shadow,ring-color]',
            ]"
            :key="url"
            :style="{ height: renderedPageHeight }"
            @contextmenu.prevent="handlePageContextMenu($event, index)"
            class="relative block w-auto overflow-hidden rounded-sm shadow-panel ring-1 ring-transparent outline-2 -outline-offset-2 duration-fast ease-out select-none hover:shadow-floating hover:ring-glass-border"
          >
            <img
              :alt="`乐谱预览第 ${index + 1} 页`"
              :src="url"
              class="block h-full w-auto select-none"
              draggable="false"
            />
          </div>
        </div>
      </div>

      <!-- 右下角缩放胶囊：复用 BaseFloatingBar（sm 紧凑形态），适应开关 + 毛玻璃百分比步进器 -->
      <BaseFloatingBar
        :bottom="'1.5rem'"
        :safe-area-inset="false"
        :z-index="'z-float'"
        disabled-teleport
        align="end"
        aria-label="预览缩放控制"
        position="absolute"
        size="sm"
      >
        <template #default="{ divider }">
          <!-- 适应开关：按钮化 checkbox（选中=主色高亮，撑满语义图标），控制自适应满高模式 -->

          <template v-if="!isFitMode">
            <BaseNumberInput
              v-model="customZoomPercent"
              :label-suffix="'%'"
              :max="PREVIEW_MAX_ZOOM_PERCENT"
              :min="PREVIEW_MIN_ZOOM_PERCENT"
              :step="10"
              use-icons
              aria-label="预览缩放百分比"
              size="sm"
              variant="glass"
            />

            <component :is="divider" />
          </template>

          <BaseCheckbox
            v-model="isFitMode"
            v-tooltip="'自适应窗口高度'"
            buttonized
            icon-only
            aria-label="自适应窗口高度"
            icon="scan"
            size="sm"
            title="自适应窗口高度"
          />
        </template>
      </BaseFloatingBar>
    </template>

    <!-- 右键单页的上下文菜单：复制 / 下载当前页（零尺寸挂载于根层，不参与滚动内容） -->
    <ContextMenu :items="pageMenuItems" :title="pageMenuTitle" @close="menuTargetIndex = -1" ref="previewMenuRef" />
  </div>
</template>

<script lang="ts">
/**
 * 模块级记忆的滚动容器高度：预览页 v-if 重挂载（切 tab 回来）时 ResizeObserver 的异步测量
 * 滞后于首帧渲染，若首帧拿到 0 会令 fitPercent 回退 100%——页面先放大再回落产生闪动。
 * 用上次会话的测量值兜底，保证重挂载首帧即为正确比例（组件单实例，模块级即实例级）。
 */
</script>

<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue';

import { useDebounceFn, useElementSize, useEventListener } from '@vueuse/core';

import ActionButton from '@/platform/ui/button/ActionButton.vue';
import BaseCheckbox from '@/platform/ui/checkbox/BaseCheckbox.vue';
import ContextMenu from '@/platform/ui/context-menu/ContextMenu.vue';
import EmptyState from '@/platform/ui/feedback/EmptyState.vue';
import BaseFloatingBar from '@/platform/ui/floating-bar/BaseFloatingBar.vue';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import BaseNumberInput from '@/platform/ui/input/BaseNumberInput.vue';
import { computeChordFingerprint } from '@/domains/chord/theory/theory';
import {
  PREVIEW_FIT_PADDING_PX,
  PREVIEW_MAX_ZOOM_PERCENT,
  PREVIEW_MIN_ZOOM_PERCENT,
  PREVIEW_TALL_MODE_TOLERANCE_PX,
  PREVIEW_WHEEL_ZOOM_SENSITIVITY,
  SCORE_EXPORT_CONFIG,
  SCORE_PREVIEW_DEBOUNCE_MS,
} from '@/domains/score/constants';
import { useScoreLinesData } from '@/domains/score/editor/composables/useScoreLinesData';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import {
  buildExportFileName,
  triggerBlobDownload,
  writeBlobToClipboard,
} from '@/domains/score/preview/services/scoreExportCanvas';
import { prepareWorkerExportPayload, runWorkerExport } from '@/domains/score/preview/services/workerExportService';
import { isDark } from '@/platform/composables/useTheme';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { useUiStore } from '@/platform/store/uiStore';
import { closeAllPopovers } from '@/platform/ui/popover/popoverRegistry';

import type { ContextMenuItem } from '@/platform/ui/context-menu/ContextMenuItems.vue';

defineOptions({ name: 'ScorePreviewPane' });
// ===== 会话级 A4 分页预览缓存（模块作用域，组件卸载/切换标签后仍保留）：内容键 → 各页图 URL =====
let rememberedContainerHeight = 0;
const CACHE_MAX = 4;
const previewCache = new Map<string, string[]>(); // Map 迭代序 = 最近使用序

const revokePages = (urls: string[]) => {
  for (const url of urls) {
    URL.revokeObjectURL(url);
  }
};

/** 命中缓存：按最近使用上浮（LRU），无命中返回 null */
const cacheGet = (key: string): string[] | null => {
  const hit = previewCache.get(key);
  if (!hit) return null;
  previewCache.delete(key);
  previewCache.set(key, hit);
  return hit;
};

/** 写入缓存：超出容量时驱逐最久未用项并释放其 URL */
const cachePut = (key: string, urls: string[]) => {
  const prev = previewCache.get(key);
  if (prev) previewCache.delete(key);
  previewCache.set(key, urls);
  if (previewCache.size > CACHE_MAX) {
    const oldestKey = previewCache.keys().next().value as string | undefined;
    if (oldestKey !== undefined) {
      const oldest = previewCache.get(oldestKey);
      previewCache.delete(oldestKey);
      if (oldest) revokePages(oldest);
    }
  }
};

const scoreEditor = useScoreEditorStore();
const settingsStore = useSettingsStore();
const uiStore = useUiStore();
const { chordsLookupMap } = useScoreLinesData();

const hasLyricsText = computed(() => Boolean(scoreEditor.activeSong?.lyrics?.trim()));

/** 整曲全部行索引：预览始终覆盖全曲（不随选中行变化） */
const allLineIndices = computed<number[]>(() => {
  const lyrics = scoreEditor.activeSong?.lyrics;
  if (!lyrics) return [];
  return Array.from({ length: lyrics.split('\n').length }, (_, i) => i);
});

const pages = ref<string[]>([]);
const isRendering = ref(false);
const errorMessage = ref('');
let runToken = 0;
let currentContentKey = '';
let isPaneActive = true;

/** 「更新中」常驻 LOADING Toast：仅在实际渲染（已有页面）时弹出，渲染结束统一移除。
 *  LOADING 型不自动销毁，故用 id 手动 remove；首次构建（无页）仍由内容区居中加载框承担，不弹 Toast */
let updateToastId: number | null = null;
const showUpdateToast = () => {
  if (updateToastId === null) {
    updateToastId = uiStore.toast.loading('预览更新中…', { closable: false });
  }
};
const dismissUpdateToast = () => {
  if (updateToastId !== null) {
    uiStore.removeToast(updateToastId);
    updateToastId = null;
  }
};

/** 内容缓存键：内容/调式/标题/变调夹/暗色/简写任一变化即视为失效并重新渲染 */
const buildContentKey = () => {
  const song = scoreEditor.activeSong;
  if (!song) return '';

  // 以「当前乐谱各槽位实际引用的和弦渲染指纹」作为和弦维度：任一槽位引用的和弦姿势/名称变化
  // 都使键失效。不能只按 chordsLookupMap（整个和弦库）的数量判定——排列「库中已存在」的和弦时
  // 库数量不变，会命中旧的渲染缓存导致预览不更新。查不到的和弦以 ?<id> 占位兜底。
  const refSignatures: string[] = [];
  for (const chordId of song.chordMap.values()) {
    const chord = chordsLookupMap.value.get(chordId ?? '');
    refSignatures.push(chord ? computeChordFingerprint(chord) : `?${chordId}`);
  }
  refSignatures.sort();

  return `${song.id}_${song.title}_${song.playKey}_c${song.capo}_v${song.version}_${song.lyrics}_d${isDark.value}_sh${settingsStore.scoreChordShorthand}_al${settingsStore.scoreLayoutAlign}_fz${scoreEditor.fontScale}_fb${scoreEditor.fretboardScale}_ref${refSignatures.length}_${refSignatures.join('|')}`;
};

/** 整曲 A4 自动分页渲染：Worker 内部按可用高度装箱分页并逐页绘制表头，返回各页图 */
const generate = async (force = false) => {
  const song = scoreEditor.activeSong;
  if (!song || allLineIndices.value.length === 0) {
    pages.value = [];
    currentContentKey = '';
    return;
  }

  const contentKey = buildContentKey();

  // 命中缓存：直接展示已渲染的页流（同内容来回切换/重进预览标签零重复渲染）
  const cached = cacheGet(contentKey);
  if (!force && cached && cached.length > 0) {
    pages.value = cached;
    currentContentKey = contentKey;
    isRendering.value = false;
    errorMessage.value = '';
    dismissUpdateToast();
    return;
  }

  const token = ++runToken;
  isRendering.value = true;
  errorMessage.value = '';
  // 已有页面的增量更新才弹「更新中」Toast；首次构建（无页）留给内容区居中加载框
  if (pages.value.length > 0) showUpdateToast();
  try {
    const payload = prepareWorkerExportPayload(
      song,
      allLineIndices.value,
      chordsLookupMap.value,
      'a4', // 自动分页模式
      settingsStore.scoreChordShorthand,
      settingsStore.scoreLayoutAlign,
      scoreEditor.fontScale,
      scoreEditor.fretboardScale
    );
    const { blobs: pageBlobs } = await runWorkerExport(payload);
    if (token !== runToken) return;
    if (pageBlobs.length === 0) throw new Error('未能生成有效的预览数据');

    const urls = pageBlobs.map(blob => URL.createObjectURL(blob));
    pages.value = urls;
    currentContentKey = contentKey;
    cachePut(contentKey, urls);
  } catch (err) {
    if (token === runToken) {
      errorMessage.value = err instanceof Error ? err.message : '预览生成失败';
    }
  } finally {
    if (token === runToken) {
      isRendering.value = false;
      dismissUpdateToast();
    }
  }
};

const debouncedGenerate = useDebounceFn(() => generate(), SCORE_PREVIEW_DEBOUNCE_MS);

/** 作废进行中的异步导出：runToken 自增使过期 token 的回写被丢弃；切歌/切走与真卸载共用 */
const cancelPendingExport = () => {
  debouncedGenerate.cancel();
  // 不 revoke：页 URL 已写入模块级缓存，切回预览可复用；内存由 LRU 容量控制
  runToken++;
  isRendering.value = false;
  dismissUpdateToast();
};

// ===== 单页右键菜单：复制 / 下载当前页图 =====
const previewMenuRef = ref<InstanceType<typeof ContextMenu> | null>(null);
const menuTargetIndex = ref(-1);

/** 预览横向滚动容器 */
const previewScrollRef = ref<HTMLElement | null>(null);
/** 滚动位置存档：双轴，纵向浏览（放大超高模式）切 Tab 后同样回位；
 *  本面板以固定 key 跨歌复用实例，切歌时由渲染重置流程归零 */
let savedScroll = { top: 0, left: 0 };

// ===== 缩放控制：自适应满高 + 自定义百分比（Ctrl+滚轮/捏合/步进器三通道） =====
/** 是否为自适应模式：页面满高贴合滚动容器，随窗口缩放 */
const isFitMode = ref(true);
/** 自定义缩放百分比（离开自适应模式后生效，保留上次用户偏好） */
const customZoomPercent = ref(100);

/** 滚动容器可视高度（px）：自适应百分比与超高判定的基准 */
const { height: measuredContainerHeight } = useElementSize(previewScrollRef);
/** 测量结果写回模块级记忆，供下次重挂载的首帧使用 */
watch(measuredContainerHeight, h => {
  if (h > 0) rememberedContainerHeight = h;
});
/** 滚动容器可视高度（px）：自适应百分比与超高判定的基准（重挂载首帧用记忆值兜底） */
const containerHeight = computed(() => measuredContainerHeight.value || rememberedContainerHeight);

/** 自适应模式下的等比百分比：容器可用高度换算为 A4 高度的百分比 */
const fitPercent = computed(() => {
  if (containerHeight.value <= 0) return 100;
  return Math.max(
    PREVIEW_MIN_ZOOM_PERCENT,
    Math.round(((containerHeight.value - PREVIEW_FIT_PADDING_PX) / SCORE_EXPORT_CONFIG.A4_HEIGHT) * 100)
  );
});

/**
 * 当前生效的缩放百分比（供 Ctrl+滚轮读写）：
 * 读：自适应模式实时反映窗口换算值；写：滚轮缩放自动解除自适应并写入自定义值
 */
const activePercent = computed<number>({
  get: () => (isFitMode.value ? fitPercent.value : customZoomPercent.value),
  set: val => {
    isFitMode.value = false;
    customZoomPercent.value = Math.min(PREVIEW_MAX_ZOOM_PERCENT, Math.max(PREVIEW_MIN_ZOOM_PERCENT, val));
  },
});

/** 页面渲染高度：始终用 px 绝对值（适应态 = fitPercent 换算高，自定义态 = 自定义百分比换算高）。
 * 不在适应态用 '100%'——% 与 px 混合插值不可靠会导致切换时高度闪跳；同为 px 后过渡平滑且两态数值同源 */
const renderedPageHeight = computed(
  () => `${Math.round((SCORE_EXPORT_CONFIG.A4_HEIGHT * activePercent.value) / 100)}px`
);

/** 页面是否超出视口可用高度：决定顶部对齐、纵向滚动浏览与禁用横向翻页滚轮。
 *  以「页面渲染高度 > 可视内容高 + 容差」判定，容差覆盖 fitPercent 整数化回放带来的 ~6px 取整溢出，
 *  避免轻微取整就误切换（该态会禁用横滚滚轮） */
const isTallerThanViewport = computed(() => {
  const pageHeight = Math.round((SCORE_EXPORT_CONFIG.A4_HEIGHT * activePercent.value) / 100);
  const available = containerHeight.value - PREVIEW_FIT_PADDING_PX;
  return pageHeight > available + PREVIEW_TALL_MODE_TOLERANCE_PX;
});

/** Ctrl+滚轮 / 触控板捏合：拦截浏览器页面缩放，按 deltaY 平滑换算预览百分比 */
useEventListener(
  previewScrollRef,
  'wheel',
  (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const raw = activePercent.value - e.deltaY * PREVIEW_WHEEL_ZOOM_SENSITIVITY;
    activePercent.value = Math.round(raw);
  },
  { passive: false }
);

/** 右键某页：记录目标页码并在光标处打开上下文菜单 */
const handlePageContextMenu = (e: MouseEvent, index: number) => {
  menuTargetIndex.value = index;
  void previewMenuRef.value?.openMenuAt(e.clientX, e.clientY);
};

/** 读取指定页的原始 Blob（object URL 同源 fetch 可读回，Worker 导出为 image/jpeg） */
const fetchPageBlob = async (index: number): Promise<Blob | null> => {
  const url = pages.value[index];
  if (!url) return null;
  const res = await fetch(url);
  return res.ok ? res.blob() : null;
};

const pageMenuTitle = computed(() => (menuTargetIndex.value >= 0 ? `预览 · 第 ${menuTargetIndex.value + 1} 页` : ''));

/** 复制指定页到系统剪贴板（JPEG 不兼容时自动转 PNG 写入） */
const copyPage = async (index: number) => {
  const blob = await fetchPageBlob(index);
  if (!blob) return;
  try {
    await writeBlobToClipboard(blob);
    uiStore.toast.success('已复制当前页到剪贴板');
  } catch (err) {
    uiStore.toast.error(err instanceof Error ? err.message : '复制失败');
  }
};

/** 下载指定页为独立图片文件 */
const downloadPage = async (index: number) => {
  const blob = await fetchPageBlob(index);
  if (!blob) return;
  const baseName = buildExportFileName(scoreEditor.activeSong?.title || '');
  triggerBlobDownload(blob, `${baseName}_${index + 1}.jpg`);
  uiStore.toast.success('已开始下载');
};

const pageMenuItems = computed<ContextMenuItem[]>(() => [
  {
    label: '复制本页',
    icon: 'copy',
    action: () => {
      void copyPage(menuTargetIndex.value);
    },
  },
  {
    label: '下载本页',
    icon: 'download',
    action: () => {
      void downloadPage(menuTargetIndex.value);
    },
  },
]);

/**
 * 监听当前歌曲 ID 切换：
 * 属于离散的用户选择行为，绝不走 150ms 防抖；
 * - 若目标歌曲命中缓存：立即同步切图，实现 0ms 瞬间切换；
 * - 若未命中缓存：立即清空旧图进入 loading 态，绝不带着上一张乐谱等待异步渲染；
 * - 同步重置翻页滚动位置至起始点。
 */
watch(
  () => scoreEditor.activeSong?.id,
  (newId, oldId) => {
    if (newId === oldId) return;
    cancelPendingExport();
    savedScroll = { top: 0, left: 0 };
    // 缩放回归自适应：新歌页数/内容高度未知，保留旧的自定义缩放易产生违和的初始视野
    isFitMode.value = true;
    if (previewScrollRef.value) {
      previewScrollRef.value.scrollTop = 0;
      previewScrollRef.value.scrollLeft = 0;
    }

    if (!scoreEditor.activeSong || !hasLyricsText.value) {
      pages.value = [];
      currentContentKey = '';
      return;
    }

    // 仅在当前处于预览标签激活状态时，切歌才同步触发导出生成；
    // 若在编辑歌词或排列和弦标签休眠（已失活），绝不在后台抢跑 Worker 耗能，待切回预览标签时（onActivated）由唤醒守卫按需生成
    if (!isPaneActive) {
      pages.value = [];
      currentContentKey = '';
      return;
    }

    const contentKey = buildContentKey();
    const cached = cacheGet(contentKey);
    if (cached && cached.length > 0) {
      pages.value = cached;
      currentContentKey = contentKey;
      isRendering.value = false;
      errorMessage.value = '';
    } else {
      pages.value = [];
      currentContentKey = '';
      void generate();
    }
  }
);

/**
 * 监听当前歌曲内部内容与排版微调：
 * 走 150ms 防抖重渲染，避免用户编辑歌词/切换开关时高频触发导出
 */
watch(
  [
    () => scoreEditor.activeSong?.title,
    () => scoreEditor.activeSong?.playKey,
    () => scoreEditor.activeSong?.capo,
    () => scoreEditor.activeSong?.version,
    () => scoreEditor.activeSong?.lyrics,
    () => scoreEditor.activeSong?.chordMap,
    () => allLineIndices.value.length,
    isDark,
    () => settingsStore.scoreChordShorthand,
    () => settingsStore.scoreLayoutAlign,
    () => scoreEditor.fontScale,
    () => scoreEditor.fretboardScale,
  ],
  () => {
    if (!isPaneActive) return;
    debouncedGenerate();
  },
  { immediate: false }
);

onActivated(async () => {
  isPaneActive = true;
  const contentKey = buildContentKey();
  // 唤醒守卫：如果休眠（在其他 Tab）期间切过歌或改过内容，先与已渲染内容比对
  if (contentKey !== currentContentKey) {
    const cached = contentKey ? cacheGet(contentKey) : null;
    if (cached && cached.length > 0) {
      pages.value = cached;
      currentContentKey = contentKey;
      isRendering.value = false;
      errorMessage.value = '';
    } else {
      pages.value = [];
      currentContentKey = '';
      await generate();
    }
  } else if (pages.value.length === 0 && hasLyricsText.value) {
    await generate();
  }

  await nextTick();
  // 恢复滚动位置（双轴）：浏览器在 detach→attach 时清零 scrollTop/scrollLeft，与「排列」区同源问题
  const el = previewScrollRef.value;
  if (el && (savedScroll.top !== 0 || savedScroll.left !== 0)) {
    el.scrollTop = savedScroll.top;
    el.scrollLeft = savedScroll.left;
  }
});

onDeactivated(() => {
  isPaneActive = false;
  cancelPendingExport();
  // 保存双轴滚动位置（实例级变量，跨歌复用实例，切歌时随渲染重置归零）
  const el = previewScrollRef.value;
  if (el) savedScroll = { top: el.scrollTop, left: el.scrollLeft };
});

onBeforeUnmount(cancelPendingExport);
</script>
