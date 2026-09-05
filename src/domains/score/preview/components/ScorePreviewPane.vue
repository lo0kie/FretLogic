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
      ref="previewScrollRef"
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

        <!-- 分页页流：每页满高、A4 等比宽，横向排列；右键单页可复制/下载该页图 -->
        <div
          v-for="(url, index) in pages"
          :class="menuTargetIndex === index ? 'outline-primary' : 'outline-transparent'"
          :key="url"
          @contextmenu.prevent="handlePageContextMenu($event, index)"
          class="shadow-panel hover:shadow-floating hover:ring-glass-border duration-fast relative block h-full w-auto overflow-hidden rounded-sm ring-1 ring-transparent outline-2 -outline-offset-2 transition-[outline,box-shadow,ring-color] ease-out select-none"
        >
          <img
            :alt="`乐谱预览第 ${index + 1} 页`"
            :src="url"
            class="block h-full w-auto select-none"
            draggable="false"
          />
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
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue';

import { useDebounceFn } from '@vueuse/core';

import { computeChordFingerprint } from '@/domains/chord/theory/theory';
import { SCORE_PREVIEW_DEBOUNCE_MS } from '@/domains/score/constants';
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
import ActionButton from '@/platform/ui/button/ActionButton.vue';
import ContextMenu from '@/platform/ui/context-menu/ContextMenu.vue';
import type { ContextMenuItem } from '@/platform/ui/context-menu/ContextMenuItems.vue';
import EmptyState from '@/platform/ui/feedback/EmptyState.vue';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';

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
let currentContentKey = '';

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

  return `${song.id}_${song.title}_${song.playKey}_c${song.capo}_v${song.version}_${song.lyrics}_d${isDark.value}_sh${settingsStore.scoreChordShorthand}_al${settingsStore.scoreLayoutAlign}_ref${refSignatures.length}_${refSignatures.join('|')}`;
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
      settingsStore.scoreLayoutAlign
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
};

// ===== 单页右键菜单：复制 / 下载当前页图 =====
const previewMenuRef = ref<InstanceType<typeof ContextMenu> | null>(null);
const menuTargetIndex = ref(-1);

/** 预览横向滚动容器 */
const previewScrollRef = ref<HTMLElement | null>(null);
/** 横向翻页位置存档（实例级，切歌新建实例归零） */
let savedScrollLeft = 0;

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
    savedScrollLeft = 0;
    if (previewScrollRef.value) {
      previewScrollRef.value.scrollLeft = 0;
    }

    if (!scoreEditor.activeSong || !hasLyricsText.value) {
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
  ],
  () => {
    debouncedGenerate();
  },
  { immediate: false }
);

onActivated(async () => {
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
  // 恢复横向翻页位置：浏览器在 detach→attach 时清零 scrollLeft，与「排列」区同源问题，激活后回位
  const el = previewScrollRef.value;
  if (el && savedScrollLeft !== 0) {
    el.scrollLeft = savedScrollLeft;
  }
});

onDeactivated(() => {
  cancelPendingExport();
  // 保存横向翻页位置（实例级变量，切歌新建实例天然归零）
  const el = previewScrollRef.value;
  if (el) savedScrollLeft = el.scrollLeft;
});

onBeforeUnmount(cancelPendingExport);
</script>
