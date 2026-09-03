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
          <ActionButton @click="generate(true)" size="sm" variant="subtle"> 重试 </ActionButton>
        </div>

        <!-- 分页页流：每页满高、A4 等比宽，横向排列；右键单页可复制/下载该页图 -->
        <img
          v-for="(url, index) in pages"
          :alt="`乐谱预览第 ${index + 1} 页`"
          :class="menuTargetIndex === index ? 'outline-primary' : 'outline-transparent'"
          :key="url"
          :src="url"
          @contextmenu.prevent="handlePageContextMenu($event, index)"
          class="shadow-panel block h-full w-auto cursor-context-menu rounded-sm outline-2 -outline-offset-2 transition-[outline]"
          draggable="false"
        />
      </div>

      <!-- 后台重新渲染指示：已有页时右上角轻提示，不打断阅读 -->
      <div
        v-if="isRendering && pages.length > 0"
        class="text-text-muted absolute top-4 right-4 z-20 flex items-center gap-1.5 rounded-full px-2 py-1 text-xs backdrop-blur-md"
      >
        <BaseIcon class="h-3 w-3 animate-spin" name="loader-2" />
        更新中
      </div>
    </div>

    <!-- 右键单页的上下文菜单：复制 / 下载当前页（零尺寸挂载于根层，不参与滚动内容） -->
    <ContextMenu :items="pageMenuItems" :title="pageMenuTitle" @close="menuTargetIndex = -1" ref="previewMenuRef" />
  </div>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { useDebounceFn } from '@vueuse/core';

import ActionButton from '@/components/ui/ActionButton.vue';
import BaseIcon from '@/components/ui/BaseIcon.vue';
import ContextMenu from '@/components/ui/context-menu/ContextMenu.vue';
import type { ContextMenuItem } from '@/components/ui/context-menu/ContextMenuItems.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import { useScoreLinesData } from '@/features/score-editor/composables/useScoreLinesData';
import { prepareWorkerExportPayload, runWorkerExport } from '@/services/export/workerExportService';
import { globalDarkMode } from '@/stores/globalState';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';
import { buildExportFileName, triggerBlobDownload, writeBlobToClipboard } from '@/utils/score/score-export';

// ===== 会话级 A4 分页预览缓存（模块作用域，组件卸载/切换标签后仍保留）：内容键 → 各页图 URL =====
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
  if (!force && cached && cached.length > 0) {
    pages.value = cached;
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
      settingsStore.scoreChordShorthand,
      true
    );
    const pageBlobs = await runWorkerExport(payload);
    if (token !== runToken) return;
    if (pageBlobs.length === 0) throw new Error('未能生成有效的预览数据');

    const urls = pageBlobs.map(blob => URL.createObjectURL(blob));
    pages.value = urls;
    cachePut(contentKey, urls);
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

const debouncedGenerate = useDebounceFn(() => generate(), 150);

// ===== 单页右键菜单：复制 / 下载当前页图 =====
const previewMenuRef = ref<InstanceType<typeof ContextMenu> | null>(null);
const menuTargetIndex = ref(-1);

/** 右键某页：记录目标页码并在光标处打开上下文菜单 */
const handlePageContextMenu = (e: MouseEvent, index: number) => {
  menuTargetIndex.value = index;
  void previewMenuRef.value?.openMenuAt(e.clientX, e.clientY);
};

/** 还原右键目标页的原始 Blob（object URL 同源 fetch 可读回，Worker 导出为 image/jpeg） */
const fetchMenuTargetBlob = async (): Promise<Blob | null> => {
  const url = pages.value[menuTargetIndex.value];
  if (!url) return null;
  const res = await fetch(url);
  return res.ok ? res.blob() : null;
};

const pageMenuTitle = computed(() => (menuTargetIndex.value >= 0 ? `预览 · 第 ${menuTargetIndex.value + 1} 页` : ''));

const pageMenuItems = computed<ContextMenuItem[]>(() => [
  {
    label: '复制',
    icon: 'copy',
    action: () => {
      void copyPreviewPage();
    },
  },
  {
    label: '下载',
    icon: 'download',
    action: () => {
      void downloadPreviewPage();
    },
  },
]);

/** 复制右键目标页到系统剪贴板（JPEG 不兼容时自动转 PNG 写入） */
const copyPreviewPage = async () => {
  const blob = await fetchMenuTargetBlob();
  if (!blob) return;
  try {
    await writeBlobToClipboard(blob);
    uiStore.toast.success('已复制当前页到剪贴板');
  } catch (err) {
    uiStore.toast.error(err instanceof Error ? err.message : '复制失败');
  }
};

/** 下载右键目标页为独立图片文件 */
const downloadPreviewPage = async () => {
  const blob = await fetchMenuTargetBlob();
  if (!blob) return;
  const baseName = buildExportFileName(scoreEditor.activeSong?.title || '');
  triggerBlobDownload(blob, `${baseName}_${menuTargetIndex.value + 1}.jpg`);
  uiStore.toast.success('已开始下载');
};

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
    debouncedGenerate();
  },
  { immediate: false }
);

onMounted(() => generate());

onBeforeUnmount(() => {
  debouncedGenerate.cancel();
  // 不 revoke：页 URL 已写入模块级缓存，切回预览可复用；内存由 LRU 容量控制
  runToken++;
  isRendering.value = false;
});
</script>
