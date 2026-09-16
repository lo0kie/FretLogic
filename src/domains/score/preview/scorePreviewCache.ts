/**
 * 乐谱预览渲染结果共享缓存。
 *
 * 统一保存 A4 分页预览图的渲染产物，供多处 UI 直接读取，避免重复触发 Worker 渲染：
 * - 预览面板（ScorePreviewPane）：展示 A4 分页页流；
 * - 右键菜单：读 A4 各页字节数（单页大小）与原始 Blob（复制/下载本页）；
 * - TopHeader 下载菜单：读 A4 各页字节数累加（标题展示「预估文件尺寸」），并复用已渲染的
 *   Blob 做 PDF / ZIP 导出（长图下载按需另渲，不在此缓存）。
 *
 * 以内容键（content key）为索引做 LRU 容量驱逐（复用 platform/utils/lruCache），
 * 驱逐时回收所有 object URL；currentRenderData 为响应式当前乐谱渲染数据，UI 层订阅即可。
 */
import { ref, shallowRef } from 'vue';

import { createLruCache } from '@/platform/utils/lruCache';

export interface PreviewRenderData {
  /** A4 分页各页 image/jpeg 的 object URL（预览展示用） */
  a4Urls: string[];
  /** A4 分页各页字节数（右键菜单单页大小 / 下载菜单总体积读数） */
  a4Sizes: number[];
}

/** 缓存容量：按乐谱内容键保留最近渲染的预览结果。单首 A4 预览（每页一张 JPEG）内存占用很小
 * （通常 1~3MB），8 首合计约 10~25MB；放宽到 8 可覆盖「来回切几首歌」场景，避免反复重渲染 Worker */
const CACHE_MAX = 8;

/** 回收一条渲染数据的全部 object URL（LRU 驱逐 / 覆盖 / 清空时统一由 onEvict 触发） */
const revokeAll = (data: PreviewRenderData) => {
  for (const url of data.a4Urls) URL.revokeObjectURL(url);
};

/** 内容键 → 渲染数据（LRU：get/set 均刷新最近使用序，超限驱逐最旧项并回收其 URL） */
const cache = createLruCache<PreviewRenderData>(CACHE_MAX, { onEvict: (_, data) => revokeAll(data) });

/** 当前展示乐谱的渲染数据（响应式）：预览面板在切歌/生成时更新，UI 直接订阅 */
export const currentRenderData = shallowRef<PreviewRenderData | null>(null);

/** 预览是否正在渲染（A4 分页）：供 Header 下载菜单区分「计算中 / 待计算」 */
export const isPreviewRendering = ref(false);

/** 命中缓存并上浮为最近使用（LRU）；无命中返回 null */
export const getCachedRender = (key: string): PreviewRenderData | null => cache.get(key) ?? null;

/** 写入缓存：超出容量时驱逐最久未用项并回收其 object URL */
export const putCachedRender = (key: string, data: PreviewRenderData) => {
  cache.set(key, data);
};

/** 设定当前展示乐谱的渲染数据（同步 pages 与 UI 订阅） */
export const setCurrentRender = (data: PreviewRenderData | null) => {
  currentRenderData.value = data;
};

/**
 * 读回缓存页的原始 Blob：对 object URL 发起同源 fetch（Worker 导出为 image/jpeg，
 * URL 由同页面的 createObjectURL 产出，无跨域问题）。缓存中 object URL 的读回语义归缓存模块统一提供。
 * @returns 页面 Blob；fetch 失败（URL 已被驱逐回收等）返回 null
 */
export const fetchA4PageBlob = async (url: string): Promise<Blob | null> => {
  try {
    const res = await fetch(url);
    return res.ok ? res.blob() : null;
  } catch {
    return null;
  }
};
