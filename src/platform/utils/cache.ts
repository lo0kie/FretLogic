/**
 * 缓存层：LRU 缓存实现 + 缓存统计注册表（DevPanel 内存面板读取）。
 *
 * 合并自 lruCache.ts + cacheRegistry.ts：lruCache 建实例时本就要 registerCache 上报表，
 * 两者是一件事的两半（用缓存 / 观测缓存），分开会造成跨文件来回引用。
 */

// ──────────────────────────── 以下原 cacheRegistry.ts ────────────────────────────

/**
 * 内存缓存注册表（仅 DEV 生效）：供开发面板展示各模块缓存的对象容量与当前条数。
 * 生产构建 registerCache 直接返回空操作，注册表恒为空、零运行时开销。
 */
export interface CacheStat {
  /** 展示名（中文，与功能对应） */
  name: string;
  /** 容量上限；无上限的 memo 类缓存为 null */
  limit: number | null;
  /** 内存配额（字节）：与条数上限并列生效。给出后开发面板按两条口径中先到者判满载 */
  maxBytes?: number;
  /** 当前条数（**实时读数**：每次调用返回当刻值，面板靠反复采样取数） */
  size: () => number;
  /** 可选字节估算（**实时读数**）：不提供则开发面板只显示条数 */
  bytes?: () => number;
  /** 可选命中次数（**实时读数**）：不提供则开发面板不显示命中率 */
  hits?: () => number;
  /** 可选未命中次数（**实时读数**，与 hits 成对提供） */
  misses?: () => number;
  /** 可选清空能力（同名多份时逐份下发：面板上的一次「清空」清掉全部实例） */
  clear?: () => void;
  /** 同名实例份数（由 listCaches 填充，仅 1 份时不设）。>1 时：
   *  设计上的多实例（allowMultiple）为求和读数；热替换残留则只取「最近活跃」的一份 */
  instances?: number;
}

/** 一个缓存名下的一份实例记录（含采样期判定「最近活跃」所需的上次读数） */
interface CacheEntry {
  stat: CacheStat;
  /** 登记时声明「同名多份是在用的多实例」：见 registerCache */
  multiple: boolean;
  /** 上一次采样看到的查表次数（hits + misses；该缓存没有命中统计时为 null） */
  lastLookups: number | null;
  /** 上一次采样看到的条数 */
  lastSize: number;
  /** 最近一次读数发生变化的采样序号（0 = 自登记以来一次都没动过） */
  activeAt: number;
}

interface RegistrySlot {
  /** 槽位版本：结构变化即递增，用于丢弃热替换前留下的旧结构槽位 */
  version: number;
  entries: Map<string, CacheEntry[]>;
  /** 结构版本：任何一次登记 / 反登记都递增（由 createCacheSampler 并入指纹） */
  revision: number;
  /** 采样序号：listCaches 每次调用递增，作为「最近活跃」的时间基准 */
  sample: number;
}

const SLOT_VERSION = 3;
const SLOT_KEY = '__fretboardCacheRegistry';

/**
 * 注册表槽位挂在 globalThis 上，而不是模块作用域。原因是模块作用域在热替换下会被重新求值：
 * lruCache / 本模块改一次，所有缓存模块都会拿到一份**新的注册表 Map** —— 老缓存登记在旧 Map 里
 * （而它仍在被使用），开发面板读的却是新 Map（里面只有新实例），老实例的读数就此全部消失。
 * 槽位提到 globalThis 后，无论本模块被求值多少次，登记与读取始终落在同一份注册表上。
 */
const slot: RegistrySlot = (() => {
  const host = globalThis as typeof globalThis & { [SLOT_KEY]?: RegistrySlot };
  const existing = host[SLOT_KEY];
  if (existing?.version === SLOT_VERSION) return existing;
  const fresh: RegistrySlot = { version: SLOT_VERSION, entries: new Map(), revision: 0, sample: 0 };
  host[SLOT_KEY] = fresh;
  return fresh;
})();

/** 读一份实例的查表次数；没有命中统计的缓存（手写 Map 类）返回 null */
const readLookups = (stat: CacheStat): number | null => (stat.hits && stat.misses ? stat.hits() + stat.misses() : null);

/**
 * 登记一个缓存，返回反注册函数（组件级缓存随实例卸载时调用）。
 *
 * 同名实例一律保留、不覆盖也不清空。开发期热替换会让同名出现多份，且**两份都可能在被使用**：
 * 新实例是模块被重新求值后登记进来的，但 Pinia store 的 setup 闭包、以及未被 reload 的组件实例
 * 都还闭包着旧模块，继续读写旧实例。
 *
 * 两种「只认一份」的老做法都会骗人：
 * - 登记时清空旧实例 → 直接让那条路径上的缓存失效（现象：「缓存失效了」）；
 * - 登记时把旧条目移出注册表 → 活的那份在面板上彻底消失，只剩一个没人用的空壳（现象：
 *   「某些缓存恒为 0 条、未命中，怎么操作都不动」）。
 *
 * 所以全部保留，由 listCaches 决定怎么展示。旧实例的资源释放交给它自己的 HMR dispose
 * （模块确实被替换时才该释放），或在其失去引用后由 GC 回收；面板上的「清空」会逐份下发，
 * 可一次性回收全部实例。
 *
 * @param options.allowMultiple 声明「同一名字下的多份实例都是活的」（组件级缓存每实例一份）。
 *   此时同名读数按求和展示；不声明则同名多份只可能是热替换残留，展示最近活跃的那一份。
 */
export function registerCache(stat: CacheStat, options?: { allowMultiple?: boolean }): () => void {
  if (!import.meta.env.DEV) return () => {};
  const entry: CacheEntry = {
    stat,
    multiple: options?.allowMultiple ?? false,
    lastLookups: readLookups(stat),
    lastSize: stat.size(),
    activeAt: 0,
  };
  const list = slot.entries.get(stat.name);
  if (list) list.push(entry);
  else slot.entries.set(stat.name, [entry]);
  slot.revision++;
  return () => {
    const list = slot.entries.get(stat.name);
    if (!list) return;
    const i = list.indexOf(entry);
    if (i === -1) return;
    list.splice(i, 1);
    if (list.length === 0) slot.entries.delete(stat.name);
    slot.revision++;
  };
}

/**
 * 从同名多份实例里挑出「最近活跃」的一份。
 *
 * 取最近活跃者而不是「最新登记」：最新登记的很可能是空壳（模块被重新求值那一刻注册进来，
 * 而应用实际在用旧实例），只显示它就会给出「0 条 / 未使用」这种会误导人的读数。
 * 都从未活跃时取最新登记的一份 —— 那更可能是当前模块手里的那份。
 */
const pickActive = (list: CacheEntry[]): CacheEntry => {
  let live = list[0]!;
  for (const entry of list) if (entry.activeAt >= live.activeAt) live = entry;

  return live;
};

/** 同名多实例求和（仅 allowMultiple 设计的多实例走这里）：条数 / 字节 / 命中全部累加，clear 逐份下发 */
const aggregate = (list: CacheEntry[]): CacheStat => {
  const stats = list.map(entry => entry.stat);
  const sum = (pick: (stat: CacheStat) => (() => number) | undefined) => () =>
    stats.reduce((total, stat) => total + (pick(stat)?.() ?? 0), 0);
  // 字节 / 命中统计只在全部实例都给得出时下发：混合未知按 0 求和会给出偏小的误导数字
  const allWeighed = stats.every(stat => stat.bytes);
  const allCounted = stats.every(stat => stat.hits && stat.misses);
  return {
    name: stats[0]!.name,
    limit: stats[0]!.limit,
    maxBytes: stats[0]!.maxBytes,
    instances: stats.length,
    size: sum(stat => stat.size),
    bytes: allWeighed ? sum(stat => stat.bytes) : undefined,
    hits: allCounted ? sum(stat => stat.hits) : undefined,
    misses: allCounted ? sum(stat => stat.misses) : undefined,
    clear: stats.every(stat => stat.clear) ? () => stats.forEach(stat => stat.clear!()) : undefined,
  };
};

/**
 * 列出全部已登记缓存。
 *
 * 同名多份的两种语义分开处理：声明过 allowMultiple 的（设计上的多实例，每一份都在用）求和展示；
 * 其余同名的多份只能是热替换残留，取最近活跃的一份展示，并在结果上标注 instances 份数。
 *
 * 注意返回的读数仍是**实时读数**（闭包直读各缓存底层 Map），不要缓存起来当快照用，
 * 也别拿它当比较基线 —— 见 createCacheSampler 的两条说明。
 */
export const listCaches = (): CacheStat[] => {
  const sample = ++slot.sample;
  const result: CacheStat[] = [];
  for (const list of slot.entries.values()) {
    if (list.length === 0) continue;
    // 先刷新各份实例的活跃度：查表次数或条数一变，就记下「它在这一刻还被使用着」。
    // 只在面板采样时（每秒一次）做，不进任何热路径。
    for (const entry of list) {
      const lookups = readLookups(entry.stat);
      const size = entry.stat.size();
      if ((lookups !== null && lookups !== entry.lastLookups) || size !== entry.lastSize) entry.activeAt = sample;

      entry.lastLookups = lookups;
      entry.lastSize = size;
    }
    if (list.length === 1) {
      result.push(list[0]!.stat);
      continue;
    }
    if (list.some(entry => entry.multiple)) {
      result.push(aggregate(list));
      continue;
    }
    // 热替换残留：展示最近活跃的一份，但「清空」按名清掉全部实例 —— 旧实例在内存里同样占着，
    // 一次点击只能清掉展示的那份会让人以为回收了、实际还留着。按钮是否出现看当前展示的这份
    const live = pickActive(list);
    const stats = list.map(entry => entry.stat);
    result.push({
      ...live.stat,
      instances: list.length,
      clear: live.stat.clear ? () => stats.forEach(stat => stat.clear?.()) : undefined,
    });
  }
  return result;
};

/**
 * 缓存列表的读数指纹：名字 / 容量 / 实例份数 / 条数 / 字节 / 命中与未命中次数全同即视为无变化。
 * 纯函数，只覆盖读数部分；基准与结构版本由 createCacheSampler 负责。
 *
 * 命中数必须计入：它是「缓存是否真的在工作」的唯一直接证据 —— 只有条数时，
 * 全命中的缓存（条数天然不变）与完全没被使用的缓存读数一模一样，无从分辨。
 */
export const cachesFingerprint = (caches: CacheStat[]): string =>
  caches
    .map(
      cache =>
        `${cache.name}|${cache.limit}|${cache.instances ?? 1}|${cache.size()}|${cache.bytes?.() ?? -1}|${cache.hits?.() ?? -1}|${cache.misses?.() ?? -1}`
    )
    .join('\n');

/**
 * 创建一个缓存读数采样器：内部持有上次的指纹基线，返回 null 表示与上次完全相同、无需更新。
 * 开发面板每秒调一次，靠它省掉稳态下的无谓重渲染（换新数组会把下游 computed 与整张表拖着重算）。
 *
 * 两条约束都封在采样器内部，是因为它们都是「调用方看不出来但一定会踩」的坑：
 *
 * 1）基线必须是**指纹字符串**，不能是上一次返回的列表。`CacheStat.size()` / `bytes()` 是实时读数
 *    （闭包直读各缓存底层 Map），拿上一次的列表反过来求指纹等于自己跟自己比 —— 两侧读的是同一份
 *    活状态、结果永远相等，早退分支会次次命中，读数就此冻在首次采样的那一刻
 *    （真实现象：面板上大量缓存恒为 0 条，且怎么操作都不动）。
 * 2）指纹必须带上注册表**结构版本**。同名缓存的实例可能被整茬换掉（模块热替换后新实例登记），
 *    此时新旧读数可能恰好都是 0，只比读数不会发现变化 —— 面板会继续展示上一批数据，
 *    点「清空」也清不到在用的那个。
 */
export const createCacheSampler = (): (() => CacheStat[] | null) => {
  let lastFingerprint = '';
  return () => {
    const next = listCaches();
    const fingerprint = `${slot.revision}\n${cachesFingerprint(next)}`;
    if (fingerprint === lastFingerprint) return null;
    lastFingerprint = fingerprint;
    return next;
  };
};

// ──────────────────────────── 以下原 lruCache.ts ────────────────────────────

/**
 * 有上限的 LRU 缓存：超限时淘汰最旧条目。
 *
 * 两条上限口径**并列成立、任一超限即驱逐**：
 * - `limit`（条数）：适合「条目小、尺寸均匀」的场景（解析结果、名字分词）；
 * - `maxBytes`（内存配额）：适合「单条尺寸悬殊、条数说明不了占用」的场景（位图、预览页图）——
 *   同是 256 条，5 品指板与 24 品指板能差一个量级，只有按字节设限才真正框住内存。
 *
 * 用于替换各处手写的 "size >= N 时删最旧 key" 样板。
 */

interface LruCacheCommonOptions<K, V> {
  /** 条目被淘汰、覆盖或清空时的销毁回调（用于释放 ImageBitmap 等底层原生资源）。
   *  覆盖为**同一个值**时不触发（资源并未易主） */
  onEvict?: (key: K, value: V) => void;
  /** 开发面板展示名：传入后（仅 DEV）自动登记到 cacheRegistry，供开发面板查看条数/字节/清空 */
  name?: string;
  /** 单条 value 的字节估算（如位图按 w×h×4、普通数据用 common 的 estimateValueBytes）。
   *  给出后：开发面板显示字节读数；配合 maxBytes 时它就是驱逐口径 */
  weigh?: (key: K, value: V) => number;
}

/** 只按条数设限（此时 weigh 可给可不给：给了只是让开发面板多一项字节读数） */
export interface CountBoundedLruOptions<K, V> extends LruCacheCommonOptions<K, V> {
  maxBytes?: undefined;
}

/** 按内存配额设限：称重口径与配额**强制成对**。
 *  类型上堵死「给了 maxBytes 却没给 weigh」—— 那种组合不报错，但配额永远算不出来、永远不驱逐，
 *  等于对外声称有护栏而实际没有，正是本项目最忌讳的静默失效 */
export interface ByteBoundedLruOptions<K, V> extends LruCacheCommonOptions<K, V> {
  weigh: (key: K, value: V) => number;
  /** 内存配额（字节）：条目字节合计超过即驱逐最旧项 */
  maxBytes: number;
}

export type LruCacheOptions<K, V> = CountBoundedLruOptions<K, V> | ByteBoundedLruOptions<K, V>;

export interface LruCache<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  has(key: K): boolean;
  delete(key: K): boolean;
  clear(): void;
  /** 清空并反注册（开发面板不再展示）。用于模块被 HMR 替换时释放旧实例：
   *  否则旧缓存被注册表的闭包钉住，其位图既不可达也无法回收 */
  dispose(): void;
  readonly size: number;
  /** 命中次数：get 取到值时累加（`has` 只做存在性判断，不计入） */
  readonly hits: number;
  /** 未命中次数：get 未取到值时累加 */
  readonly misses: number;
  /** 当前字节合计：给出 weigh 时随写入 / 删除 / 淘汰 / 清空增量维护；无称重口径时恒为 0 */
  readonly bytes: number;
}

/** 创建字符串键的 LRU 缓存实例：get/set 均刷新位置，超限（条数或内存配额）淘汰最旧条目，
 *  支持生命周期释放回调。 */
export function createLruCache<V>(limit: number, options?: LruCacheOptions<string, V>): LruCache<string, V> {
  /** 条目 = 值 + 写入时称得的字节权重。
   *  为什么把权重随条目存下、而不是每次淘汰时重称：淘汰路径必须精确减掉该条的量，
   *  重称等于额外要求 weigh 是纯函数、且对同一对象永远给同一个数；存下来则「加多少减多少」
   *  天然自洽，日后 weigh 换成更精确的口径也不会在合计里留下历史漂移。 */
  const map = new Map<string, { value: V; bytes: number }>();
  const weigh = options?.weigh;
  const maxBytes = options?.maxBytes;
  // 反注册句柄（仅 DEV 有值），由 dispose 消费
  let unregister: (() => void) | null = null;
  /** 字节合计：写入 / 删除 / 淘汰 / 清空时增量维护（get 只改访问顺序、不动合计）。
   *  它不再只是开发面板的读数 —— 内存配额驱逐必须随时知道当前占用，故称重只在写入时发生一次，
   *  采样与访问都是 O(1)（旧实现在这里靠脏标记 + 全表重估，本就是为了绕开每秒数万个临时对象）。
   *  约定：缓存内的 value 视为不可变快照（写入即新对象）。权重在写入时定格，
   *  若调用方原地改写已存入的对象，合计数会与真实占用脱节，直到该键被重写。 */
  let bytesTotal = 0;
  // 命中统计：只反映「查表结果」，用于开发面板判断缓存是否真在生效。
  // 条数天然不变的全命中缓存与完全没被使用的缓存，读数完全一样，只有命中数能区分。
  let hits = 0;
  let misses = 0;

  /** 摘掉一条并归还其底层资源：合计先减、再回调。
   *  顺序不可颠倒 —— onEvict 里可能同步发起新的读写（如预览缓存回收 object URL 后立刻重渲）。 */
  const remove = (key: string) => {
    const entry = map.get(key);
    if (entry === undefined) return;
    map.delete(key);
    bytesTotal -= entry.bytes;
    options?.onEvict?.(key, entry.value);
  };

  /**
   * 驱逐到两条上限都不再超出。
   *
   * 两条口径的兜底程度刻意不同：
   * - 条数上限**可以驱逐到空**（limit = 0 即等效于不缓存，与旧实现一致）；
   * - 内存配额**至少留下最后写入的那一条**：单条就超出配额的条目（一页超长乐谱、超大指板）
   *   若也被驱逐，调用方刚算出来的结果当场丢失、下次照样得重算 —— 内存省不下来，
   *   只是把成本转成了反复重算。代价是稳态占用可能比配额多出「一条」，换来的是不空转。
   */
  const trim = () => {
    while (map.size > limit) {
      const oldest = map.keys().next().value;
      if (oldest === undefined) return;
      remove(oldest);
    }
    while (maxBytes !== undefined && bytesTotal > maxBytes && map.size > 1) {
      const oldest = map.keys().next().value;
      if (oldest === undefined) return;
      remove(oldest);
    }
  };
  const cache: LruCache<string, V> = {
    get: key => {
      const entry = map.get(key);
      if (entry === undefined) {
        misses++;
        return undefined;
      }
      hits++;
      // 读到即刷新为最近使用：Map 按插入序迭代，故摘掉再放回即浮到队尾
      map.delete(key);
      map.set(key, entry);
      return entry.value;
    },
    has: key => map.has(key),
    delete: key => {
      if (!map.has(key)) return false;
      remove(key);
      return true;
    },
    set: (key, value) => {
      const existing = map.get(key);
      if (existing !== undefined) {
        // 已存在则先摘掉再插入，刷新到最新位置（访问序 LRU 语义）；
        // 值确实换了才回调归还旧值资源 —— 覆盖为同一个对象时资源并未易主
        map.delete(key);
        bytesTotal -= existing.bytes;
        if (existing.value !== value) options?.onEvict?.(key, existing.value);
      }
      const bytes = weigh ? weigh(key, value) : 0;
      map.set(key, { value, bytes });
      bytesTotal += bytes;
      trim();
    },
    clear: () => {
      if (options?.onEvict) for (const [key, entry] of map) options.onEvict(key, entry.value);

      map.clear();
      bytesTotal = 0;
    },
    dispose: () => {
      cache.clear();
      unregister?.();
      unregister = null;
    },
    get size() {
      return map.size;
    },
    get hits() {
      return hits;
    },
    get misses() {
      return misses;
    },
    get bytes() {
      return bytesTotal;
    },
  };
  if (options?.name)
    unregister = registerCache({
      name: options.name,
      limit,
      maxBytes,
      size: () => cache.size,
      // 命中统计随每次 get 变化，是面板「缓存到底有没有在生效」的直接读数
      hits: () => cache.hits,
      misses: () => cache.misses,
      // 写入时即记账，读数是 O(1)：面板每秒采样不再逐条重估；无称重口径则不登记，只显示条数
      bytes: weigh ? () => bytesTotal : undefined,
      clear: () => cache.clear(),
    });

  return cache;
}
