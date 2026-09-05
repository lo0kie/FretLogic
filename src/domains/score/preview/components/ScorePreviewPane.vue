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

    <!-- A4 自动分页预览：整曲渲染为若干 A4 页，横向排开，左右滑动翻页浏览 -->
    <div
      v-else
      v-wheel-scroll.smooth
      @click.self="clearSelection"
      class="no-scrollbar px-xl py-xl relative box-border min-h-0 flex-1 overflow-x-auto overflow-y-hidden"
    >
      <!-- 内容行：够宽时自动水平居中（mx-auto），超宽时 margin 归 0 自然从左侧滚动 -->
      <div class="gap-xl mx-auto flex h-full w-max items-center">
        <!-- 首帧渲染中 -->
        <div
          v-if="isRendering && pages.length === 0"
          class="text-text-disabled flex min-w-[320px] items-center justify-center gap-2 text-sm"
        >
          <BaseIcon class="text-primary h-4 w-4 animate-spin" name="loader-2" />
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

        <!-- 分页页流：每页满高、A4 等比宽，横向排列；点击选中（v-wave 涟漪）浮出操作栏，右键单页可复制/下载该页图 -->
        <!-- v-wave 涟漪需向目标内插入子元素，img 无法容纳，故以 wrapper 承载选中态/波纹/点击 -->
        <div
          v-wave
          v-for="(url, index) in pages"
          :class="menuTargetIndex === index || selectedPages.has(index) ? 'outline-primary' : 'outline-transparent'"
          :key="url"
          @click="handlePageClick(index)"
          @contextmenu.prevent="handlePageContextMenu($event, index)"
          class="shadow-panel hover:shadow-floating hover:ring-glass-border duration-fast relative block h-full w-auto cursor-pointer overflow-hidden rounded-sm ring-1 ring-transparent outline-2 -outline-offset-2 transition-[outline,box-shadow,ring-color] ease-out"
        >
          <img :alt="`乐谱预览第 ${index + 1} 页`" :src="url" class="block h-full w-auto" draggable="false" />
        </div>
      </div>

      <!-- 后台重新渲染指示：已有页时右上角轻提示，不打断阅读 -->
      <div
        v-if="isRendering && pages.length > 0"
        class="text-text-muted z-float absolute top-4 right-4 flex items-center gap-1.5 rounded-full px-2 py-1 text-xs backdrop-blur-md"
      >
        <BaseIcon class="h-3 w-3 animate-spin" name="loader-2" />
        更新中
      </div>
    </div>

    <!-- 右键单页的上下文菜单：复制 / 下载当前页（零尺寸挂载于根层，不参与滚动内容） -->
    <ContextMenu :items="pageMenuItems" :title="pageMenuTitle" @close="menuTargetIndex = -1" ref="previewMenuRef" />

    <!-- 点选页的浮动操作栏：复制/下载（多选时自动拼接为长图） -->
    <BaseFloatingBar #="{ divider }" :visible="selectedPages.size > 0" aria-label="预览页操作栏">
      <span class="text-text-muted px-1 text-xs whitespace-nowrap">已选 {{ selectedPages.size }} 页</span>
      <component :is="divider" />

      <ActionButton @click="copySelectedPage" compacted icon="copy" label="复制" variant="ghost" />
      <ActionButton @click="downloadSelectedPage" compacted icon="download" label="下载" variant="ghost" />
    </BaseFloatingBar>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue';

import { useDebounceFn } from '@vueuse/core';

import { SCORE_PREVIEW_DEBOUNCE_MS } from '@/domains/score/constants';
import { useScoreLinesData } from '@/domains/score/editor/composables/useScoreLinesData';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import {
  buildExportFileName,
  triggerBlobDownload,
  writeBlobToClipboard,
} from '@/domains/score/preview/services/scoreExportCanvas';
import { prepareWorkerExportPayload, runWorkerExport } from '@/domains/score/preview/services/workerExportService';
import { globalDarkMode } from '@/platform/store/globalState';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { useUiStore } from '@/platform/store/uiStore';
import ActionButton from '@/platform/ui/button/ActionButton.vue';
import ContextMenu from '@/platform/ui/context-menu/ContextMenu.vue';
import type { ContextMenuItem } from '@/platform/ui/context-menu/ContextMenuItems.vue';
import EmptyState from '@/platform/ui/feedback/EmptyState.vue';
import BaseFloatingBar from '@/platform/ui/floating-bar/BaseFloatingBar.vue';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';

// ===== 会话级 A4 分页预览缓存（模块作用域，组件卸载/切换标签后仍保留）：内容键 → 各页图 URL + 每页行范围 =====
const CACHE_MAX = 4;
interface PreviewCacheEntry {
  urls: string[];
  /** 每页覆盖的原始歌词行序号（与 urls 一一对应），供多选重组长图使用 */
  ranges: number[][];
}
const previewCache = new Map<string, PreviewCacheEntry>(); // Map 迭代序 = 最近使用序

const revokePages = (entry: PreviewCacheEntry) => {
  for (const url of entry.urls) {
    URL.revokeObjectURL(url);
  }
};

/** 命中缓存：按最近使用上浮（LRU），无命中返回 null */
const cacheGet = (key: string): PreviewCacheEntry | null => {
  const hit = previewCache.get(key);
  if (!hit) return null;
  previewCache.delete(key);
  previewCache.set(key, hit);
  return hit;
};

/** 写入缓存：超出容量时驱逐最久未用项并释放其 URL */
const cachePut = (key: string, entry: PreviewCacheEntry) => {
  const prev = previewCache.get(key);
  if (prev) previewCache.delete(key);
  previewCache.set(key, entry);
  if (previewCache.size > CACHE_MAX) {
    const oldestKey = previewCache.keys().next().value as string | undefined;
    if (oldestKey !== undefined) {
      const oldest = previewCache.get(oldestKey);
      previewCache.delete(oldestKey);
      if (oldest) revokePages(oldest);
    }
  }
};

defineOptions({ name: 'ScorePreviewPane' });

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
/** 当前页流各页覆盖的原始歌词行序号（与 pages 一一对应），供多选重组长图 */
const pageLineRanges = ref<number[][]>([]);
const isRendering = ref(false);
const errorMessage = ref('');
let runToken = 0;

/** 内容缓存键：内容/暗色/简写任一变化即视为失效并重新渲染（导出质量设置已移除，编码走引擎默认值） */
const buildContentKey = () => {
  const song = scoreEditor.activeSong;
  if (!song) return '';
  return `${song.id}_${song.lyrics}_d${globalDarkMode.value}_sh${settingsStore.scoreChordShorthand}_ref${chordsLookupMap.value.size}`;
};

/** 整曲 A4 自动分页渲染：Worker 内部按可用高度装箱分页并逐页绘制表头，返回各页图 */
const generate = async (force = false) => {
  const song = scoreEditor.activeSong;
  if (!song || allLineIndices.value.length === 0) return;

  const contentKey = buildContentKey();

  // 命中缓存：直接展示已渲染的页流（同内容来回切换/重进预览标签零重复渲染）
  const cached = cacheGet(contentKey);
  if (!force && cached && cached.urls.length > 0) {
    pages.value = cached.urls;
    pageLineRanges.value = cached.ranges;
    return;
  }

  const token = ++runToken;
  isRendering.value = true;
  errorMessage.value = '';
  try {
    const payload = prepareWorkerExportPayload(
      song,
      allLineIndices.value,
      chordsLookupMap.value,
      'a4', // 自动分页模式
      settingsStore.scoreChordShorthand
    );
    const { blobs: pageBlobs, pageLineRanges: ranges } = await runWorkerExport(payload);
    if (token !== runToken) return;
    if (pageBlobs.length === 0) throw new Error('未能生成有效的预览数据');

    const urls = pageBlobs.map(blob => URL.createObjectURL(blob));
    pages.value = urls;
    pageLineRanges.value = ranges;
    cachePut(contentKey, { urls, ranges });
  } catch (err) {
    if (token === runToken) {
      errorMessage.value = err instanceof Error ? err.message : '预览生成失败';
    }
  } finally {
    if (token === runToken) {
      isRendering.value = false;
    }
  }
};

const debouncedGenerate = useDebounceFn(() => generate(), SCORE_PREVIEW_DEBOUNCE_MS);

// ===== 单页右键菜单：复制 / 下载当前页图 =====
const previewMenuRef = ref<InstanceType<typeof ContextMenu> | null>(null);
const menuTargetIndex = ref(-1);

/** 右键某页：记录目标页码并在光标处打开上下文菜单 */
const handlePageContextMenu = (e: MouseEvent, index: number) => {
  menuTargetIndex.value = index;
  void previewMenuRef.value?.openMenuAt(e.clientX, e.clientY);
};

// ===== 单页点选：点击切换选中（可多选）→ 底部浮动条提供复制/下载 =====
const selectedPages = ref(new Set<number>());

/** 点击某页：切换选中状态（再点一次取消选中） */
const handlePageClick = (index: number) => {
  const next = new Set(selectedPages.value);
  if (next.has(index)) {
    next.delete(index);
  } else {
    next.add(index);
  }
  selectedPages.value = next;
};

/** 点击页间空隙/背景：清空选中并收起操作栏 */
const clearSelection = () => {
  selectedPages.value = new Set();
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

/**
 * 多选重组：取选中页覆盖的原始歌词行并集，交由 Worker 以 normal 长图模式重新排版为单张连续长图。
 * 与逐页像素拼接不同——无页眉重复、无页边距与分页留白，内容像整曲导出一样自然衔接。
 */
const buildMergedLongImage = async (): Promise<Blob | null> => {
  const song = scoreEditor.activeSong;
  if (!song || selectedPages.value.size === 0) return null;

  // 选中页的行序号并集（页码升序 → 行号升序去重）
  const lineSet = new Set<number>();
  for (const pageIndex of [...selectedPages.value].sort((a, b) => a - b)) {
    for (const lineIdx of pageLineRanges.value[pageIndex] ?? []) {
      lineSet.add(lineIdx);
    }
  }
  if (lineSet.size === 0) return null;

  const payload = prepareWorkerExportPayload(
    song,
    [...lineSet].sort((a, b) => a - b),
    chordsLookupMap.value,
    'normal', // 连续长图模式：自适应宽度、单一表头、无分页留白
    settingsStore.scoreChordShorthand
  );
  const { blobs } = await runWorkerExport(payload);
  return blobs[0] ?? null;
};

/** 浮动条动作：以当前选中页集合为目标（单选取原页，多选重组为长图） */
const copySelectedPage = async () => {
  const list = [...selectedPages.value].sort((a, b) => a - b);
  const [first] = list;
  if (first === undefined) return;
  const blob = list.length === 1 ? await fetchPageBlob(first) : await buildMergedLongImage();
  if (!blob) return;
  try {
    await writeBlobToClipboard(blob);
    uiStore.toast.success(list.length > 1 ? '已重组为连续长图并复制到剪贴板' : '已复制当前页到剪贴板');
  } catch (err) {
    uiStore.toast.error(err instanceof Error ? err.message : '复制失败');
  }
};
const downloadSelectedPage = async () => {
  const list = [...selectedPages.value].sort((a, b) => a - b);
  const [first] = list;
  if (first === undefined) return;
  if (list.length === 1) {
    await downloadPage(first);
    return;
  }
  const merged = await buildMergedLongImage();
  if (!merged) return;
  const baseName = buildExportFileName(scoreEditor.activeSong?.title || '');
  triggerBlobDownload(merged, `${baseName}_${first + 1}-${list[list.length - 1]! + 1}_长图.jpg`);
  uiStore.toast.success('已重组为连续长图，开始下载');
};

const pageMenuItems = computed<ContextMenuItem[]>(() => [
  {
    label: '复制',
    icon: 'copy',
    action: () => {
      void copyPage(menuTargetIndex.value);
    },
  },
  {
    label: '下载',
    icon: 'download',
    action: () => {
      void downloadPage(menuTargetIndex.value);
    },
  },
]);

// 歌曲/歌词/和弦表/暗色/简写任一变化 → 命中缓存直接换图，否则防抖重渲染
watch(
  [
    () => scoreEditor.activeSong,
    () => scoreEditor.activeSong?.lyrics,
    () => scoreEditor.activeSong?.chordMap,
    () => allLineIndices.value.length,
    globalDarkMode,
    () => settingsStore.scoreChordShorthand,
  ],
  () => {
    clearSelection();
    debouncedGenerate();
  },
  { immediate: false }
);

onActivated(() => generate());

/** 作废进行中的异步导出：runToken 自增使过期 token 的回写被丢弃；切走与真卸载共用 */
const cancelPendingExport = () => {
  debouncedGenerate.cancel();
  // 不 revoke：页 URL 已写入模块级缓存，切回预览可复用；内存由 LRU 容量控制
  runToken++;
  isRendering.value = false;
};

onDeactivated(cancelPendingExport);
onBeforeUnmount(cancelPendingExport);
</script>
