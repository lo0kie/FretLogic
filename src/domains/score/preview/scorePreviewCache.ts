/**
 * 乐谱预览渲染结果共享缓存。
 *
 * 统一保存 A4 分页预览图的渲染产物，供多处 UI 直接读取，避免重复触发 Worker 渲染：
 * - 预览面板（ScorePreviewPane）：展示 A4 分页页流；
 * - 右键菜单：读 A4 各页字节数（单页大小）与原始 Blob（复制/下载本页）；
 * - TopHeader 下载菜单：读 A4 各页字节数累加（标题展示「预估文件尺寸」），并复用已渲染的
 *   Blob 做 PDF / ZIP 导出（长图下载按需另渲，不在此缓存）。
 *
 * 页面栅格不含页脚页码：页脚是独立合成层（services/footerOverlay），展示时由组件叠一层画布，
 * 导出/复制时按开关在渲染线程合成——因此「显示页脚」不进内容键，同一首歌不会因该开关多存一份。
 *
 * 以内容键（content key）为索引做 LRU 容量驱逐（复用 platform/utils/cache），
 * 另设「每首歌最多 MAX_VERSIONS_PER_SONG 个版本」的子上限，避免连续编辑把容量占成单曲历史；
 * 驱逐时回收所有 object URL；currentRenderData 为响应式当前乐谱渲染数据，UI 层订阅即可。
 */
import { ref, shallowRef } from 'vue';

import { createLruCache } from '@/platform/utils/cache';

export interface PreviewRenderData {
  /** A4 分页各页 image/jpeg 的 object URL（预览展示用） */
  a4Urls: string[];
  /** A4 分页各页字节数（右键菜单单页大小 / 下载菜单总体积读数） */
  a4Sizes: number[];
  /** 渲染时实际使用的纸张档位：页脚合成必须按它（而非实时设置）取纸型，
   *  否则改档位的在途窗口内下载会把新纸型页脚贴到旧尺寸页图上 */
  pageSize: string;
  /** 渲染时实际使用的页边距（px）：页脚合成同 pageSize 口径，必须与页图同边距 */
  pageMargin: number;
  /** A4 分页各页原始 Blob（与 a4Urls 同序）：PDF / ZIP 导出与「复制本页」直接取用，
   *  免去对 blob: URL 再发一次 fetch。object URL 本身已持有该 Blob，这里只是多存一份引用，不增加内存 */
  a4Blobs: Blob[];
}

/** 缓存容量：按乐谱内容键保留最近渲染的预览结果。单首 A4 预览（每页一张 JPEG）内存占用不大
 * （实测约 0.3~3MB/首，随曲长与页数变化），48 首合计约 15~140MB；放宽到 48 让「来回翻几十首」
 * 也不再重渲染 Worker。另有每首 MAX_VERSIONS_PER_SONG 的子上限兜住「连续编辑同一首」的占用。 */
const CACHE_MAX = 48;

/** 同一首歌（按 song.id 归组）最多保留的渲染版本数。
 *  编辑过程中每改一次内容就产生一个新内容键，若不加限制，连续编辑一小时能把这 48 个坑
 *  全占成同一首歌的历史版本，反而把别的歌挤出去——「来回翻几十首」的初衷就落空了。
 *  留 3 份足够覆盖「撤销一步 / 来回切换两种排版」这类回退，其余容量让给别的歌。 */
const MAX_VERSIONS_PER_SONG = 3;

/** 回收一条渲染数据的全部 object URL（LRU 驱逐 / 覆盖 / 清空时统一由 onEvict 触发） */
const revokeAll = (data: PreviewRenderData) => {
  for (const url of data.a4Urls) URL.revokeObjectURL(url);
};

/** 内容键 → 所属歌曲 id（子上限记账用；条目被驱逐/覆盖/清空时同步摘除） */
const songIdByKey = new Map<string, string>();
/** 歌曲 id → 该歌当前在缓存中的内容键（按写入先后） */
const keysBySong = new Map<string, string[]>();

const forgetKey = (key: string) => {
  const songId = songIdByKey.get(key);
  if (songId === undefined) return;
  songIdByKey.delete(key);
  const list = keysBySong.get(songId);
  if (!list) return;
  const index = list.indexOf(key);
  if (index >= 0) list.splice(index, 1);
  if (list.length === 0) keysBySong.delete(songId);
};

/** 内容键 → 渲染数据（LRU：get/set 均刷新最近使用序，超限驱逐最旧项并回收其 URL） */
const cache = createLruCache<PreviewRenderData>(CACHE_MAX, {
  name: '预览渲染页',
  // 字节读数 = 各页 JPEG 字节数之和（object URL 背后的 blob 即内存占用主体）
  weigh: (_, data) => data.a4Sizes.reduce((sum, bytes) => sum + bytes, 0),
  onEvict: (key, data) => {
    revokeAll(data);
    forgetKey(key);
  },
});

/** 当前展示乐谱的渲染数据（响应式）：预览面板在切歌/生成时更新，UI 直接订阅 */
export const currentRenderData = shallowRef<PreviewRenderData | null>(null);

/** 预览是否正在渲染（A4 分页）：供 Header 下载菜单区分「计算中 / 待计算」 */
export const isPreviewRendering = ref(false);

/** 命中缓存并上浮为最近使用（LRU）；无命中返回 null */
export const getCachedRender = (key: string): PreviewRenderData | null => cache.get(key) ?? null;

/**
 * 写入缓存：超出容量时驱逐最久未用项并回收其 object URL；
 * 同一首歌另有「最多保留 MAX_VERSIONS_PER_SONG 个版本」的子上限（超出即淘汰该歌最旧版本）。
 * @param songId 内容键所属乐谱 id（仅用于子上限归组）
 */
export const putCachedRender = (key: string, data: PreviewRenderData, songId: string) => {
  cache.set(key, data);
  // set 覆盖同键时可能已先触发一次 onEvict（把本键的记账摘掉），故记账在 set 之后重建
  songIdByKey.set(key, songId);
  const keys = keysBySong.get(songId) ?? [];
  if (!keys.includes(key)) keys.push(key);
  keysBySong.set(songId, keys);

  while (keys.length > MAX_VERSIONS_PER_SONG) {
    const oldest = keys.shift()!;
    // 先摘记账再 delete：delete 触发的 onEvict 里 forgetKey 便成空操作
    songIdByKey.delete(oldest);
    cache.delete(oldest);
  }
};

/** 清空全部渲染缓存（开发面板用）：回收所有 object URL 并复位当前渲染数据 */
export const clearPreviewCache = () => {
  cache.clear();
  currentRenderData.value = null;
};

/** 设定当前展示乐谱的渲染数据（同步 pages 与 UI 订阅） */
export const setCurrentRender = (data: PreviewRenderData | null) => {
  currentRenderData.value = data;
};

/**
 * 读回缓存页的原始 Blob。
 * 优先命中条目内自带的 a4Blobs（写入时与 URL 同批存入，零成本）；未命中（例如调用方持有的是
 * 上一轮渲染遗留的 URL）再回退对 object URL 发同源 fetch（Worker 导出为 image/jpeg，
 * URL 由同页面的 createObjectURL 产出，无跨域问题）。
 * @returns 页面 Blob；两条路径都拿不到（URL 已被驱逐回收等）返回 null
 */
export const readA4PageBlob = async (url: string): Promise<Blob | null> => {
  const data = currentRenderData.value;
  if (data) {
    const index = data.a4Urls.indexOf(url);
    if (index >= 0) {
      const blob = data.a4Blobs[index];
      if (blob) return blob;
    }
  }
  try {
    const res = await fetch(url);
    return res.ok ? res.blob() : null;
  } catch {
    return null;
  }
};
