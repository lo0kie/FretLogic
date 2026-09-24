/**
 * 乐谱预览渲染结果共享缓存。
 *
 * 统一保存 A4 分页预览图的渲染产物，供多处 UI 直接读取，避免重复触发 Worker 渲染：
 * - 预览面板（ScorePreviewPane）：展示 A4 分页页流；
 * - 右键菜单：读各页字节数（单页大小）与原始 Blob（复制/下载本页）；
 * - TopHeader 下载菜单：读各页字节数累加（标题展示「预估文件尺寸」），并复用已渲染的
 *   Blob 做 PDF / ZIP 导出（长图下载按需另渲，不在此缓存）。
 *
 * **最小单元是「页」**：条目内允许有洞（未渲染 / 失败 / 被淘汰的页），页可单独写入。于是
 * 「渲染被中断」不再等于「这一轮的产物全部作废」—— 已画好的页留在条目里，下一轮同键重发时
 * 带上 havePages 跳过它们（见 WorkerExportPayload.havePages）。写入不再是整批原子的一次
 * putCachedRender，而是「排版一结束建骨架 → 每出一页写一格 → complete 补齐读数」。
 *
 * 【跨内容键的按页复用】同键续跑之外还有第二条复用路径：编辑歌词后，**内容键变了**（歌词在键里），
 * 但大多数页其实一个字都没动。条目自带 `pageLevelKey` 与 `lineFingerprints` 两项判据，新键起手时
 * 可在同歌的旧版本里找一版「页级段一致、且只有若干行变了」的条目，把未受影响的页连同页脚合成层
 * 一并转移过来（findInheritSource / inheritableIndexes / movePages），那些页这一轮直接进 havePages
 * 被渲染线程跳过 —— 逐页落账的机制本就支持「只画缺的页」，这一步只是把「缺」的定义从「同键的洞」
 * 扩展到「跨键未受影响的页」。转移是**所有权移交**（来源条目那几格留洞），页 URL 始终只有一个主人。
 *
 * 页面栅格不含页脚页码：页脚是独立合成层（services/footerOverlay），预览展示与导出/复制都按开关
 * 在**渲染线程**把页码合成到页图上（Worker composeFooterPages）——因此「显示页脚」不进内容键，
 * 同一首歌不会因该开关多存一份；合成结果另存为 footerPages（逐页懒生成），关掉即弃用。
 *
 * 以内容键（content key）为索引做 LRU 驱逐：条数（CACHE_MAX）与内存配额（CACHE_MAX_BYTES）
 * 两条上限并列，任一先到即驱逐（复用 platform/utils/cache）；
 * 另设「每首歌最多 MAX_VERSIONS_PER_SONG 个版本」的子上限，避免连续编辑把容量占成单曲历史；
 * 驱逐时回收所有 object URL（正在展示的那条例外，见 onEvict）；currentRenderData 为响应式当前乐谱
 * 渲染数据，UI 层订阅即可。
 */
import { ref, shallowRef } from 'vue';

import { createLruCache } from '@/platform/utils/cache';

/** 单页缓存实体：URL 与 Blob 成对存在、同生共死（分开管理必然出现「URL 在、Blob 被换」）。
 *  写入后视为不可变，替换即换新对象 */
export interface PreviewPage {
  /** 页图 object URL（预览展示 / 下载本页） */
  url: string;
  /** 页图原始 Blob（PDF / ZIP / 复制下载直接取用，免二次 fetch） */
  blob: Blob;
}

export interface PreviewRenderData {
  /** 内容键（创建时定格）：逐页写入与页脚写入要靠它重新登记，故随条目自带而非由调用方另存 */
  key: string;
  /** 所属歌曲 id（创建时定格）：每首版本的子上限记账与重新登记用 */
  songId: string;
  /** 排版得到的总页数：等于 pages.length（a4 分页模式下也等于 pageLineRanges.length；
   *  normal 长图模式恒为 1，行范围给空数组 —— 它不分页，无行序可谈） */
  total: number;
  /** 各页：未就位的页为 undefined（**洞**）。洞是合法状态，消费方一律用 pageUrl / pageBlob 取值。
   *  **恒为稠密数组**（长度＝total、每个下标都有值，只是值可能是 undefined）—— 稀疏数组会让
   *  `every` / `map` 静默跳过洞，见 isComplete 的说明 */
  pages: (PreviewPage | undefined)[];
  /**
   * 每页覆盖的原始歌词行序号（升序去重），下标＝页序。
   *
   * 排版一结束（pages-planned）就由渲染线程给出，此时还没有任何页画出来。两个用途：
   * ① 校验「同键条目的在途页仍属于本次排版」—— 页数相同但分页边界挪了（某行折行数变化）也能当场发现；
   * ② 将来按页做最小重建时的现成依据。
   */
  pageLineRanges: number[][];
  /**
   * 键的**页级段**（scoreRenderCacheKey.buildScorePageLevelKey，创建时定格）：
   * 「上一版能否按页继承」的第一道判据。它不同说明标题 / 设置 / 主题这类**整页共有**的输入变了，
   * 那种情况下每一页都不可信，整谱重画（见 findInheritSource）。
   */
  pageLevelKey: string;
  /**
   * 各原始歌词行的渲染输入指纹（scoreLineFingerprints，创建时定格，下标＝行序号）。
   * 第二道判据：与新版逐行比对得到「哪几行变了」，再与 pageLineRanges 求交即「哪几页必须重画」。
   */
  lineFingerprints: string[];
  /** 渲染时实际使用的纸张档位：页脚合成必须按它（而非实时设置）取纸型，
   *  否则改档位的在途窗口内下载会把新纸型页脚贴到旧尺寸页图上 */
  pageSize: string;
  /** 渲染时实际使用的页边距（px）：页脚合成同 pageSize 口径，必须与页图同边距 */
  pageMargin: number;
  /**
   * 页脚合成后的各页（下标＝页序，与 pages 同序，**懒生成**：仅在「显示页脚」打开时向渲染线程
   * 请求一次合成，结果挂在这里）。预览页流按开关在 pages / footerPages 之间切换展示源，
   * 故开关本身零渲染、零 Worker 调用（首次打开合成一次，之后来回切只是换 URL）。
   *
   * pages 仍是唯一真源：导出与「复制/下载本页」按开关自行合成，不读这里 ——
   * 否则关掉页脚再导出会拿到带页码的图（与设置不符）。
   */
  footerPages?: (PreviewPage | undefined)[];
}

/** 缓存容量：按乐谱内容键保留最近渲染的预览结果。单首 A4 预览（每页一张 JPEG）内存占用不大
 * （实测约 0.3~3MB/首，随曲长与页数变化），48 首合计约 15~140MB；放宽到 48 让「来回翻几十首」
 * 也不再重渲染 Worker。另有每首 MAX_VERSIONS_PER_SONG 的子上限兜住「连续编辑同一首」的占用。 */
const CACHE_MAX = 48;

/**
 * 预览缓存的内存配额（字节）。与 CACHE_MAX 的条数上限**并列**生效，任一先到即驱逐。
 *
 * 为什么条数不够用：单首占用随「页数 × 页图分辨率」变化，而上面那句估出的 15~140MB 是个
 * 五倍以上的区间 —— 真正吃内存的是几十页的长曲，条数完全表达不出这件事。
 * 配额把最坏情况压到 96MiB：典型短曲（约 0.3MB/首，48 首 ≈ 15MB）配额根本不介入，
 * 只有「多首长曲连开」才会提前驱逐。
 *
 * 驱逐即回收页图 object URL（onEvict → revokeEntry）。被驱逐的是最久未用的内容键：
 * 正在看的那首歌刚被 get/set 过、排在队尾最后才会被驱逐。
 */
const CACHE_MAX_BYTES = 96 * 1024 * 1024;

/** 同一首歌（按 song.id 归组）最多保留的渲染版本数。
 *  编辑过程中每改一次内容就产生一个新内容键，若不加限制，连续编辑一小时能把这 48 个坑
 *  全占成同一首歌的历史版本，反而把别的歌挤出去——「来回翻几十首」的初衷就落空了。
 *  留 3 份足够覆盖「撤销一步 / 来回切换两种排版」这类回退，其余容量让给别的歌。 */
const MAX_VERSIONS_PER_SONG = 3;

/** 一条条目的当前占用：在位页 + 已合成的页脚页 + 行指纹，各按字节数求和（与配额口径同源） */
const weightOf = (data: PreviewRenderData): number => entryBytes(data);

/** 回收一条渲染数据的全部 object URL（LRU 驱逐 / 覆盖 / 清空时统一由 onEvict 触发）。
 *  页脚合成层随条目一并回收——它挂在条目上，条目被驱逐后就再无人引用，漏掉即泄漏 */
const revokeEntry = (data: PreviewRenderData): void => {
  for (const page of data.pages) if (page) URL.revokeObjectURL(page.url);
  for (const page of data.footerPages ?? []) if (page) URL.revokeObjectURL(page.url);
};

/** 内容键 → 所属歌曲 id（子上限记账用；条目被驱逐/覆盖/清空时同步摘除） */
const songIdByKey = new Map<string, string>();
/** 歌曲 id → 该歌当前在缓存中的内容键（按写入先后） */
const keysBySong = new Map<string, string[]>();
/**
 * 内容键 → 当前**活着的**条目对象。
 *
 * 与 cache 同步维护，唯一用途是校验调用方手里的条目引用是否仍是活的那一个：逐页写入发生在
 * 「拿到条目引用」之后很久（一轮渲染数秒），期间条目可能已被驱逐、或被同键的新对象取代 ——
 * 把页写进一个已作废的对象，轻则白写，重则把它重新 set 回去、挤掉真正活着的条目。
 */
const liveEntries = new Map<string, PreviewRenderData>();

/** 屏上正在展示的条目：驱逐 / 覆盖 / 清空时**不即刻回收**它的页 URL（否则屏上当场破图）。
 *  它的回收被推迟到「它不再是展示项」那一刻，由 setCurrentRender 补上（见那里的说明）。 */
let heldByDisplay: PreviewRenderData | null = null;
/** 「已被驱逐但仍在展示」的条目：URL 还没撤，等换值那一刻一并回收 */
const orphanedHeld = new WeakSet<PreviewRenderData>();

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
  // 在位页 + 已合成页脚页的字节合计：object URL 背后的 blob 既是大头，也是配额口径。
  // 页脚合成层（若已生成）同样计入——它是同一批页面的第二份 JPEG，不计就等于把最坏情况
  // 按一半报给配额（开关打开过的条目会实际占用两倍）
  weigh: (_, data) => weightOf(data),
  maxBytes: CACHE_MAX_BYTES,
  onEvict: (key, data) => {
    liveEntries.delete(key);
    forgetKey(key);
    // 屏上还在引用它：URL 一撤就是破图。标记为「已驱逐待回收」，由 setCurrentRender 在换值时补收
    if (data === heldByDisplay) {
      orphanedHeld.add(data);
      return;
    }
    revokeEntry(data);
  },
});

/** 当前展示乐谱的渲染数据（响应式）：预览面板在切歌/生成时更新，UI 直接订阅 */
export const currentRenderData = shallowRef<PreviewRenderData | null>(null);

/** 预览是否正在渲染（A4 分页）：供 Header 下载菜单区分「计算中 / 待计算」 */
export const isPreviewRendering = ref(false);

/** 命中缓存并上浮为最近使用（LRU）；无命中返回 null。**有洞也算命中**（洞由调用方继续补齐） */
export const getCachedRender = (key: string): PreviewRenderData | null => cache.get(key) ?? null;

/** 在位页序（升序）：作为 havePages 派发给渲染线程的取值来源，也是导出「缺页」判据 */
export const inPlaceIndexes = (data: PreviewRenderData): number[] => {
  const indexes: number[] = [];
  for (let i = 0; i < data.pages.length; i++) if (data.pages[i]) indexes.push(i);
  return indexes;
};

/** 条目是否完整：页数已定格且每一页都在位。导出取图与「命中即收工」的判据。
 *  刻意用显式循环而不是 `every`：稀疏数组的 `every` / `map` 会**跳过洞**，对 `[,,]` 直接返回真 ——
 *  那会把「一页都没画」判成完整条目，本轮也就再不会去补那几页了。 */
export const isComplete = (data: PreviewRenderData): boolean => {
  if (data.total <= 0 || data.pages.length !== data.total) return false;
  for (const page of data.pages) if (!page) return false;
  return true;
};

/** 页图 URL；该页不在位时为 undefined（消费方据此走骨架 / 提示，不必自己判可选链） */
export const pageUrl = (data: PreviewRenderData, index: number): string | undefined => data.pages[index]?.url;

/** 页图原始 Blob；该页不在位时为 undefined */
export const pageBlob = (data: PreviewRenderData, index: number): Blob | undefined => data.pages[index]?.blob;

/** 在位页图的字节合计（不含页脚合成层）：下载菜单的「预估文件尺寸」与面板明细读数用 */
export const pagesBytes = (data: PreviewRenderData): number => {
  let bytes = 0;
  for (const page of data.pages) if (page) bytes += page.blob.size;
  return bytes;
};

/** 页脚合成层的字节合计（未合成过为 0）：同一批页面的第二份 JPEG，读数与配额都必须算上 */
export const footerBytes = (data: PreviewRenderData): number => {
  let bytes = 0;
  for (const page of data.footerPages ?? []) if (page) bytes += page.blob.size;
  return bytes;
};

/**
 * 行指纹的字节量：字符串按 UTF-16 计（码元数 × 2）。纯文本判据，单首通常几十 KB —— 相对页图
 * 可忽略，但同属条目占用，配额读数与称重一并算上，免得日后有人照着「配额＝页图字节」去估内存。
 */
const lineFingerprintBytes = (data: PreviewRenderData): number => {
  let units = 0;
  for (const fingerprint of data.lineFingerprints) units += fingerprint.length;
  return units * 2;
};

/** 条目当前占用字节（在位页 + 页脚合成层 + 行指纹）：UI 读数与配额口径同源 */
export const entryBytes = (data: PreviewRenderData): number =>
  pagesBytes(data) + footerBytes(data) + lineFingerprintBytes(data);

/**
 * 登记 / 刷新一条条目：写入 LRU（称重、驱逐）、记上「活条目」、维护每首版本的子上限。
 * 内部唯一入口 —— 所有写入路径都经它，才能保证 liveEntries 与 cache 不脱节。
 */
const registerEntry = (key: string, data: PreviewRenderData, songId: string): void => {
  cache.set(key, data);
  // 必须在 set 之后：set 覆盖同键时会先对本键触发一次 onEvict（把 liveEntries 里那条摘掉），
  // 顺序颠倒的话紧接着就被清掉
  liveEntries.set(key, data);
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

/**
 * 建骨架（`pages-planned` 时调用）：页数、逐页行范围、纸张档位在此定格。
 *
 * 纸张档位与页边距**必须此刻就写死**，不能等到 complete —— 中断的条目照样要在屏上展示、
 * 照样可能被导出消费（页脚合成按它们取纸型），而 complete 永远不会来。它们来自派发时的设置，
 * 与页数无关，此刻取值与渲染线程实际用的那份一致。
 *
 * 同键条目已存在则原样返回（它有洞也无妨，那些页正是本轮的续跑起点）。
 *
 * `pageLevelKey` 与 `lineFingerprints` 一并在此定格：它们是「下一版能否按页继承这一条」的判据，
 * 必须与本条目实际渲染的内容同源 —— 事后补写等于拿新一轮的数据去描述旧一轮的产物。
 */
export const ensureEntry = (
  key: string,
  songId: string,
  total: number,
  pageLineRanges: number[][],
  pageSize: string,
  pageMargin: number,
  pageLevelKey: string,
  lineFingerprints: string[]
): PreviewRenderData => {
  const existing = liveEntries.get(key);
  if (existing) return existing;
  // fill(undefined) 只为把它做**稠密**：`new Array(n)` 是稀疏的，其后的 every / map 会跳过洞
  const data: PreviewRenderData = {
    key,
    songId,
    total,
    pages: new Array(total).fill(undefined),
    pageLineRanges,
    pageLevelKey,
    lineFingerprints,
    pageSize,
    pageMargin,
  };
  registerEntry(key, data, songId);
  return data;
};

/**
 * 条目是否还允许写入：它是「账上那一条」，或是「已被驱逐（且此键尚无新主）但仍留在屏上展示的那一条」
 * ——后者的页 URL 被刻意留着未撤（见 onEvict），内容仍然有效。
 * 两种情况之外一律拒绝：条目已被回收（写进去只是把死 URL 当有效页供出去），或此键已归新对象所有
 * （写进去会**挤掉真正活着的那条**，还把它的页 URL 一并撤掉）。
 */
const isWritable = (entry: PreviewRenderData): boolean => {
  const live = liveEntries.get(entry.key);
  return live === entry || (live === undefined && orphanedHeld.has(entry));
};

/**
 * 改写后的重新落账：LRU 把 value 视为不可变快照，原地改写不会更新字节合计 —— 配额会越算越少，
 * 最后等于没有护栏。传同一个对象 ⇒ set 不触发 onEvict（资源并未易主），只重新称重 + 刷新 LRU 位置。
 * 走到 else 分支说明它已被驱逐但仍在展示：URL 未撤、内容有效，重建入账，
 * 否则这些页只活在屏上、无人记账（也再没有任何时机回收它们）。
 */
const touchEntry = (entry: PreviewRenderData): void => {
  if (liveEntries.get(entry.key) === entry) cache.set(entry.key, entry);
  else registerEntry(entry.key, entry, entry.songId);
};

/**
 * 逐页写入（渲染线程每出一页调一次）。调用方手里的条目引用可能已作废（被驱逐、被清空、或被同键
 * 新对象取代）—— isWritable 就是这道闸；被拒绝时**就地回收这一页的 URL**，因为它已没有主人。
 *
 * 覆盖已有页时同样回收被换掉的那个 URL：正常情况下不会发生（调用方声明为 havePages 的页，
 * 渲染线程不会再画），但「按页继承」会把上一版的页预先搬进条目 —— 条目里持有在位页自此是常态，
 * 一旦真的被覆盖，那个 URL 就再没有任何回收时机（原主人已被置洞、也不在屏上）。
 */
export const writePage = (entry: PreviewRenderData, index: number, page: PreviewPage): void => {
  if (!isWritable(entry)) {
    URL.revokeObjectURL(page.url);
    return;
  }
  const replaced = entry.pages[index];
  entry.pages[index] = page;
  if (replaced && replaced !== page) URL.revokeObjectURL(replaced.url);
  touchEntry(entry);
};

/** 写入页脚合成层：与 writePage 同一条「先验可写、被拒即回收」的理由 */
export const writeFooterPages = (entry: PreviewRenderData, footerPages: (PreviewPage | undefined)[]): void => {
  if (!isWritable(entry)) {
    for (const page of footerPages) if (page) URL.revokeObjectURL(page.url);
    return;
  }
  entry.footerPages = footerPages;
  touchEntry(entry);
};

/**
 * 丢弃**非展示项**的页脚合成层（「显示页脚」被关掉时调用）。
 *
 * 【为什么该丢】页脚不进内容键、开关本该零成本来回切（见文件头），代价是那批字节仍计入条目重量 ——
 * `weightOf` 把页图与页脚层相加，于是**开过页脚的条目重量近乎翻倍**。在 CACHE_MAX_BYTES / CACHE_MAX
 * 两条并列上限下，这等于把别的歌挤出去：用户「试开一次页脚再关掉」之后，其余歌的命中率会跟着掉，
 * 而那份合成层他此后多半再也用不到（要用也得先把开关打开）。
 *
 * 【为什么只丢非展示项】展示项留着，开关再打开就是零成本切回（该取舍的另一半）；别的条目真要用到时
 * 重合成一次即可（单页 ~22ms）。只丢这一层、不丢整条：页图仍然有用，而且页图才是「导出 / 复制本页」
 * 与配额的另一半。
 *
 * 丢完必须重新落账（`touchEntry`）：LRU 把 value 视为不可变快照，字节合计只在写入时更新 ——
 * 原地清空而不重新称重，配额就会一直按两层的量算，丢了等于没丢。
 */
export const dropIdleFooterPages = (): void => {
  for (const entry of liveEntries.values()) {
    if (entry === heldByDisplay || !entry.footerPages) continue;
    for (const page of entry.footerPages) if (page) URL.revokeObjectURL(page.url);
    entry.footerPages = undefined;
    // 重新落账可能触发 trim 而淘汰别的条目（onEvict 会从 liveEntries 摘键）—— Map 迭代容忍
    // 遍历期间的删除，未访问到的键被摘掉只是不再出现，不会跳过或重复
    touchEntry(entry);
  }
};

/** 丢弃整条（页 URL 由 onEvict 回收；若它正被展示则延迟到换值那一刻，见 setCurrentRender） */
export const dropEntry = (key: string): void => void cache.delete(key);

// ===== 按页最小重建：编辑歌词后只重画内容真的变了的页 =====

/**
 * 「按页继承」的候选来源：上一版条目 + 内容已变的行序号。
 */
export interface InheritSource {
  /** 上一版的条目（同歌、页级段一致、且有若干行内容变了） */
  entry: PreviewRenderData;
  /** 内容已变的行序号（升序，与 pageLineRanges 同口径） */
  dirtyLines: number[];
}

/**
 * 逐行比对两版行指纹，返回内容已变的行序号（升序）。
 *
 * 行数不同时，**多出来的那些行一律算脏**：末尾追加一行是写歌时最常见的编辑，前面十几页没有理由
 * 重画，而保守地整段作废会让本功能在最需要它的场景下失效。少掉的行不单独产生条目 —— 行号整体
 * 前移那部分由逐位比对自然判脏（第 i 位比的是「新第 i 行 vs 旧第 i 行」，本来就该判脏）。
 */
const diffLineFingerprints = (prev: string[], next: string[]): number[] => {
  const dirty: number[] = [];
  const common = Math.min(prev.length, next.length);
  for (let index = 0; index < common; index++) if (prev[index] !== next[index]) dirty.push(index);
  for (let index = common; index < next.length; index++) dirty.push(index);
  return dirty;
};

/**
 * 在**同一首歌**的其它缓存版本里找一版可作「按页继承」的来源。
 *
 * 三个条件缺一不可：
 * ① 页级段一致（标题 / 设置 / 主题这类整页共有的输入没变）—— 不同则每一页都不可信；
 * ② 行指纹有差异 —— 一行都没变说明键是因 version / 和弦库这类**非行级**维度变化的，
 *    此时无法证明任何一页的页级内容真的没动（标题可能刚改过），一律不继承；
 * ③ 条目仍在账上（或虽被驱逐但仍留在屏上展示、URL 未撤）—— 已被回收的条目手里是死 URL。
 *
 * 多版命中时取**脏行最少**的那一版（血缘最近，能继承的页最多）；同分取最近写入的
 * （keysBySong 按写入先后，逆序遍历天然优先后来者）。
 *
 * @param excludeKey 本轮的内容键（同键条目由「续跑」那条路径接管，不走继承）
 */
export const findInheritSource = (
  songId: string,
  excludeKey: string,
  pageLevelKey: string,
  lineFingerprints: string[]
): InheritSource | null => {
  const keys = keysBySong.get(songId);
  if (!keys || lineFingerprints.length === 0) return null;

  let best: InheritSource | null = null;
  for (let index = keys.length - 1; index >= 0; index--) {
    const key = keys[index]!;
    if (key === excludeKey) continue;
    const entry = liveEntries.get(key);
    // isWritable 的另一种用法：这里问的不是「还能不能往里写」，而是「它手里的页 URL 是否还有效」
    // —— 两种情况下条目都已被回收（URL 已撤），搬过来只会把死 URL 当有效页供出去
    if (!entry || entry.pageLevelKey !== pageLevelKey || !isWritable(entry)) continue;
    const dirtyLines = diffLineFingerprints(entry.lineFingerprints, lineFingerprints);
    if (dirtyLines.length === 0) continue;
    if (!best || dirtyLines.length < best.dirtyLines.length) best = { entry, dirtyLines };
  }
  return best;
};

/**
 * 来源条目里「内容未受影响、可以原样继承」的页序（升序）：该页覆盖的行里没有任何一行变脏，
 * 且这一页在来源条目里确实在位（洞继承不了）。
 *
 * 判据只到「行」这一级：一页里的**其它**内容（页码、页眉、页脚的垂直位置）都由页级段与行集合
 * 共同决定，两者都已被上面的两道判据覆盖。
 */
export const inheritableIndexes = (source: PreviewRenderData, dirtyLines: number[]): number[] => {
  if (dirtyLines.length === 0) return [];
  const dirty = new Set(dirtyLines);
  const indexes: number[] = [];
  source.pageLineRanges.forEach((range, index) => {
    if (!source.pages[index]) return;
    if (range.some(line => dirty.has(line))) return;
    indexes.push(index);
  });
  return indexes;
};

/**
 * 把来源条目的这几页**转移**给目标条目（页 URL 与 Blob 一并易主，来源条目那几格留洞）。
 *
 * 【为什么是转移而不是共享】页 URL 的回收权只能有一个主人。两边都持有的话，来源条目被 LRU 驱逐时
 * revokeEntry 一撤，目标条目手里就是死 URL —— 屏上当场破图，且只在「继承 + 淘汰」同时发生时才复现。
 * 置洞后来源条目自身也要重新落账：LRU 只在写入时更新字节合计，不重新称重等于「页搬走了还在按原重计费」。
 *
 * 页脚合成层同下标一并搬：它是同一页的第二份数据，合成成本（单页 ~22ms）不亚于页图本身，
 * 没有理由让它对一页内容未变的图重算一遍。来源条目没有合成过则跳过，由调用方按需补合成。
 *
 * 目标条目里对应格已有页时**不覆盖**（正常不会发生：这几页正是渲染线程按 havePages 跳过的那些），
 * 遇上了就跳过该格 —— 把已有页悄悄换掉会丢掉它的 URL 回收时机。
 */
export const movePages = (target: PreviewRenderData, source: PreviewRenderData, indexes: number[]): void => {
  if (!isWritable(target) || !isWritable(source)) return;

  let moved = 0;
  for (const index of indexes) {
    const page = source.pages[index];
    if (!page || target.pages[index]) continue;
    target.pages[index] = page;
    source.pages[index] = undefined;
    moved++;

    // 容器先取出来：`footer` 非空虽已蕴含它存在，但可选链的窄化不跨语句，直写 source.footerPages[index]
    // 在严格模式下仍会被判「可能为 undefined」
    const sourceFooter = source.footerPages;
    const footer = sourceFooter?.[index];
    if (footer && sourceFooter) {
      // 稠密数组（fill）：稀疏数组的 every / map 会跳过洞，而这里的洞正是「该页还没合成页脚」
      const targetFooter = target.footerPages ?? new Array(target.total).fill(undefined);
      targetFooter[index] = footer;
      target.footerPages = targetFooter;
      sourceFooter[index] = undefined;
    }
  }

  if (moved === 0) return;
  touchEntry(target);
  // 来源条目此刻可能已被驱逐但仍在屏上展示（URL 未撤、内容有效）：touchEntry 会把它重新登记入账，
  // 这正是要的 —— 它剩下的页仍需有人记账，也仍需有人在它彻底退场时回收
  touchEntry(source);
};

/** 清空全部渲染缓存（开发面板用）：回收所有 object URL 并复位当前渲染数据 */
export const clearPreviewCache = (): void => {
  cache.clear();
  // 必须经 setCurrentRender：屏上那条在驱逐时被跳过回收，由它在换值路径里补上
  setCurrentRender(null);
};

/**
 * 设定当前展示的渲染数据。
 *
 * 它同时是「淘汰时跳过当前展示条目」那条规则的**另一半**：被跳过的条目此后没有任何时机回收
 * 它的页 URL（clearPreviewCache 是先清 cache 再置 null，setCurrentRender 也只赋值）—— 若不在
 * 换值这一刻补回收，那批 URL 就永久悬着。这是本模块唯一的泄漏口，改动时务必保留。
 */
export const setCurrentRender = (data: PreviewRenderData | null): void => {
  const previous = heldByDisplay;
  heldByDisplay = data;
  currentRenderData.value = data;
  if (previous && previous !== data && orphanedHeld.has(previous)) {
    orphanedHeld.delete(previous);
    revokeEntry(previous);
  }
};
