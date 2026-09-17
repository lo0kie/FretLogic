/**
 * 内存缓存注册表（仅 DEV 生效）：供开发面板展示各模块缓存的对象容量与当前条数。
 * 生产构建 registerCache 直接返回空操作，注册表恒为空、零运行时开销。
 */
export interface CacheStat {
  /** 展示名（中文，与功能对应） */
  name: string;
  /** 容量上限；无上限的 memo 类缓存为 null */
  limit: number | null;
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
  for (const entry of list) {
    if (entry.activeAt >= live.activeAt) live = entry;
  }
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
      if ((lookups !== null && lookups !== entry.lastLookups) || size !== entry.lastSize) {
        entry.activeAt = sample;
      }
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
