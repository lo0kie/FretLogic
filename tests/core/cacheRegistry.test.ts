import { describe, expect, it, vi } from 'vitest';

import {
  cachesFingerprint,
  createCacheSampler,
  createLruCache,
  listCaches,
  registerCache,
} from '@/platform/utils/cache';

import type { CacheStat } from '@/platform/utils/cache';

/** 注册表仅在 DEV 生效（生产构建下 registerCache 为空操作，注册表恒为空），非 DEV 环境跳过依赖它的用例 */
const NO_REGISTRY = !import.meta.env.DEV;

/** 每个用例取独立缓存名：同名实例会共存于注册表（读数只取最近活跃的一份），共用名字会互相踩 */
let nameSeq = 0;
const uniqueName = (label: string) => `测试缓存-${label}-${++nameSeq}`;

/** 从注册表读回某个名字（listCaches 每次返回新数组，需重新查找） */
const findStat = (name: string): CacheStat | undefined => listCaches().find(cache => cache.name === name);

describe.skipIf(NO_REGISTRY)('registerCache / listCaches', () => {
  it('同名重复登记：旧实例数据原封不动，读数取自「最近活跃」的那一份', () => {
    const name = uniqueName('同名替换');
    const evicted: string[] = [];

    // 模拟 HMR：模块被重新求值后拿到新实例，上一版实例仍可能被残留引用继续读写
    const stale = createLruCache<number>(8, {
      name,
      weigh: () => 4,
      onEvict: key => evicted.push(key),
    });
    stale.set('a', 1);
    stale.set('b', 2);
    expect(findStat(name)?.size()).toBe(2);
    // 单份时不标注份数（该字段只在同名多份时出现）
    expect(findStat(name)?.instances).toBeUndefined();

    const current = createLruCache<number>(8, { name, weigh: () => 4 });

    // 旧实例必须原封不动：HMR 后组件实例未必随模块重建（Pinia store 的 setup 闭包、未被 reload 的
    // 组件都还闭包着旧模块），它仍在读写这份缓存 —— 登记时清空旧实例会让那条路径上的缓存当场失效
    expect(evicted).toEqual([]);
    expect(stale.size).toBe(2);
    expect(stale.get('a')).toBe(1);

    // 两份都在册：新实例只是模块被重新求值后登记进来的空壳，读数仍要落在活的那一份上。
    // 这正是「只留最新登记」会骗人的地方 —— 那样展示的是 0 条 / 未使用，而活的那份被藏起来
    expect(findStat(name)?.instances).toBe(2);
    expect(findStat(name)?.size()).toBe(2);

    // 活跃者换人：新实例一被写入，行读数随即切到它（展示的永远是「正在被使用的那一份」）
    current.set('x', 9);
    expect(findStat(name)?.size()).toBe(1);

    // 清空逐份下发：一次把两份一起回收
    findStat(name)?.clear?.();
    expect(stale.size).toBe(0);
    expect(current.size).toBe(0);

    current.dispose();
    stale.dispose();
    expect(findStat(name)).toBeUndefined();
  });

  it('dispose 应当清空并反注册（开发面板不再展示该缓存）', () => {
    const name = uniqueName('dispose');
    const cache = createLruCache<number>(4, { name });
    cache.set('x', 1);
    expect(findStat(name)).toBeDefined();

    cache.dispose();

    expect(cache.size).toBe(0);
    expect(findStat(name)).toBeUndefined();
  });

  it('allowMultiple（设计上的多实例，两份都在用）按份求和，clear 逐实例下发', () => {
    const name = uniqueName('聚合');
    const cleared: string[] = [];
    let sizeA = 2;
    const sizeB = 3;

    const makeStat = (tag: string, size: () => number, bytes?: () => number): CacheStat => ({
      name,
      limit: 10,
      size,
      bytes,
      clear: () => cleared.push(tag),
    });

    const unregisterA = registerCache(
      makeStat(
        'a',
        () => sizeA,
        () => 16
      ),
      { allowMultiple: true }
    );
    const unregisterB = registerCache(
      makeStat(
        'b',
        () => sizeB,
        () => 24
      ),
      { allowMultiple: true }
    );

    const aggregated = findStat(name);
    expect(aggregated?.size()).toBe(5);
    expect(aggregated?.bytes?.()).toBe(40);

    // 聚合项持有的是各实例的实时读数，外部变化无需重新登记即可反映
    sizeA = 4;
    expect(aggregated?.size()).toBe(7);

    aggregated?.clear?.();
    expect(cleared).toEqual(['a', 'b']);

    unregisterB();
    unregisterA();
    expect(findStat(name)).toBeUndefined();
  });

  it('同名多份里有实例给不出字节估算时，聚合读数整体不下发（避免偏小误导）', () => {
    const name = uniqueName('混合未知');

    const unregisterA = registerCache({ name, limit: 10, size: () => 1 });
    const unregisterB = registerCache({ name, limit: 10, size: () => 2, bytes: () => 32 }, { allowMultiple: true });

    const aggregated = findStat(name);
    expect(aggregated?.size()).toBe(3);
    expect(aggregated?.bytes).toBeUndefined();
    // clear 同理：有一份不具备清空能力时不下发，避免「清了一半」
    expect(aggregated?.clear).toBeUndefined();

    unregisterB();
    unregisterA();
  });

  it('allowMultiple 聚合命中统计；任一实例缺统计则整体不下发', () => {
    const name = uniqueName('聚合命中');
    const unregisterA = registerCache(
      { name, limit: 4, size: () => 0, hits: () => 3, misses: () => 1 },
      { allowMultiple: true }
    );
    const unregisterB = registerCache(
      { name, limit: 4, size: () => 0, hits: () => 2, misses: () => 4 },
      { allowMultiple: true }
    );

    expect(findStat(name)?.hits?.()).toBe(5);
    expect(findStat(name)?.misses?.()).toBe(5);

    // 混入一份没有命中统计的实例：整体不下发，避免把「部分实例的命中」当成全量命中率
    const unregisterC = registerCache({ name, limit: 4, size: () => 0, hits: () => 1 }, { allowMultiple: true });
    expect(findStat(name)?.hits).toBeUndefined();
    expect(findStat(name)?.misses).toBeUndefined();

    unregisterC();
    unregisterB();
    unregisterA();
  });
});

describe.skipIf(NO_REGISTRY)('createCacheSampler（开发面板每秒采样）', () => {
  it('首次采样必然下发；读数未变时返回 null（稳态下不触发重渲染）', () => {
    const sample = createCacheSampler();

    expect(sample()).not.toBeNull();
    expect(sample()).toBeNull();
    expect(sample()).toBeNull();
  });

  it('条数变化后重新下发新读数，恢复稳定后回到 null', () => {
    const name = uniqueName('采样读数');
    const cache = createLruCache<number>(4, { name });
    const sample = createCacheSampler();

    expect(
      sample()
        ?.find(stat => stat.name === name)
        ?.size()
    ).toBe(0);

    cache.set('a', 1);
    const grown = sample();
    expect(grown).not.toBeNull();
    expect(grown?.find(stat => stat.name === name)?.size()).toBe(1);

    expect(sample()).toBeNull();

    cache.dispose();
  });

  it('实例被整茬替换（热替换）后即使读数相同也必须重新下发，并标出份数', () => {
    const name = uniqueName('采样替换');
    const stale = createLruCache<number>(4, { name });
    const sample = createCacheSampler();

    const before = sample();
    const statBefore = before?.find(stat => stat.name === name);
    expect(statBefore?.size()).toBe(0);
    expect(statBefore?.instances).toBeUndefined();

    // 热替换：同名新实例登记，旧实例数据不受影响、条目也保留（它可能才是应用在用的那份）
    const current = createLruCache<number>(4, { name });
    expect(stale.size).toBe(0);

    const after = sample();
    expect(after).not.toBeNull();
    const statAfter = after?.find(stat => stat.name === name);
    // 份数变化本身就是必须下发的读数：否则面板会停在「1 份」的旧认知上
    expect(statAfter?.instances).toBe(2);
    expect(statAfter?.size()).toBe(0);

    current.dispose();
    // 反登记同样属于结构变化
    expect(sample()).not.toBeNull();

    stale.dispose();
  });
});

describe('cachesFingerprint', () => {
  const makeStat = (overrides?: Partial<CacheStat>): CacheStat => ({
    name: '缓存',
    limit: 4,
    size: () => 0,
    ...overrides,
  });

  it('名称 / 容量 / 条数 / 字节任一变化即产生新指纹，读数全同则指纹相同', () => {
    const base = cachesFingerprint([makeStat({ size: () => 1, bytes: () => 8 })]);

    expect(cachesFingerprint([makeStat({ size: () => 1, bytes: () => 8 })])).toBe(base);
    expect(cachesFingerprint([makeStat({ size: () => 2, bytes: () => 8 })])).not.toBe(base);
    expect(cachesFingerprint([makeStat({ size: () => 1, bytes: () => 16 })])).not.toBe(base);
    // 无估算器（缺字节读数）与「估出 0 字节」是两回事，指纹必须区分
    expect(cachesFingerprint([makeStat({ size: () => 1 })])).not.toBe(base);
    expect(cachesFingerprint([makeStat({ name: '别的', size: () => 1, bytes: () => 8 })])).not.toBe(base);
    expect(cachesFingerprint([makeStat({ limit: 5, size: () => 1, bytes: () => 8 })])).not.toBe(base);
    // 命中统计也计入指纹：条数天然不变的全命中缓存与「一次都没被用过」的缓存读数完全一样，
    // 只比条数无法分辨（这正是面板「条数怎么点都不动」时最需要看到的一项）
    expect(cachesFingerprint([makeStat({ size: () => 1, bytes: () => 8, hits: () => 3, misses: () => 1 })])).not.toBe(
      base
    );
    expect(cachesFingerprint([makeStat({ size: () => 1, bytes: () => 8, hits: () => 2, misses: () => 1 })])).not.toBe(
      cachesFingerprint([makeStat({ size: () => 1, bytes: () => 8, hits: () => 3, misses: () => 1 })])
    );
    // 条目数也算变化（同名前缀 + 多了一行）
    expect(cachesFingerprint([makeStat({ size: () => 1, bytes: () => 8 }), makeStat()])).not.toBe(base);
    expect(cachesFingerprint([])).toBe('');
  });

  it('读数是实时的：同一批 CacheStat 在写入后重求指纹必须不同（故面板须存快照基线）', () => {
    let live = 0;
    const list = [makeStat({ size: () => live, bytes: () => live * 4 })];

    const first = cachesFingerprint(list);
    live = 3;
    const second = cachesFingerprint(list);

    // 前提：重新求指纹能读到新读数（快照比较据此生效）
    expect(second).not.toBe(first);

    // 反面：拿「已经变化过的列表」再求一次完全相等 —— 若调用方把上一次返回的列表当基线，
    // 早退分支会永远命中，读数就此冻在首次采样那一刻（真实现象：面板上大量缓存恒为 0 条）。
    expect(cachesFingerprint(list)).toBe(second);
  });
});

describe.skipIf(NO_REGISTRY)('createLruCache 的字节读数（开发面板采样）', () => {
  it('登记后向面板提供 容量 / 条数 / 字节 / 清空 四项读数', () => {
    const name = uniqueName('登记');
    const weigh = vi.fn((_key: string, value: number) => value);
    const cache = createLruCache<number>(3, { name, weigh });

    expect(findStat(name)?.limit).toBe(3);
    expect(findStat(name)?.size()).toBe(0);

    cache.set('a', 4);
    cache.set('b', 6);
    expect(findStat(name)?.size()).toBe(2);
    expect(findStat(name)?.bytes?.()).toBe(10);

    findStat(name)?.clear?.();
    expect(cache.size).toBe(0);
    expect(findStat(name)?.bytes?.()).toBe(0);

    cache.dispose();
  });

  it('字节合计增量维护：称重只在写入时发生一次，采样 / 访问 / 删除都不回头重估', () => {
    const name = uniqueName('增量');
    const weigh = vi.fn((_key: string, value: number) => value);
    const cache = createLruCache<number>(10, { name, weigh });
    const bytes = () => findStat(name)?.bytes?.();

    // 空表无条目可估
    expect(bytes()).toBe(0);
    expect(weigh).not.toHaveBeenCalled();

    cache.set('a', 4);
    cache.set('b', 6);
    expect(bytes()).toBe(10);
    expect(weigh).toHaveBeenCalledTimes(2);

    // 稳态：面板每秒采样一次，条数没变就不该逐个重估（本条用例的全部意义所在）
    expect(bytes()).toBe(10);
    expect(bytes()).toBe(10);
    expect(weigh).toHaveBeenCalledTimes(2);

    // get 只改访问顺序、不改字节合计
    expect(cache.get('a')).toBe(4);
    expect(bytes()).toBe(10);
    expect(weigh).toHaveBeenCalledTimes(2);

    // delete 直接减掉该条写入时称得的量，绝不回头重估剩余条目（旧实现此处要全表重算一遍）
    expect(cache.delete('b')).toBe(true);
    expect(bytes()).toBe(4);
    expect(weigh).toHaveBeenCalledTimes(2);

    // 同键同值重复写入：先减旧量再加新量，读数不得翻倍
    cache.set('a', 4);
    expect(bytes()).toBe(4);
    expect(weigh).toHaveBeenCalledTimes(3);

    cache.clear();
    expect(bytes()).toBe(0);

    cache.dispose();
  });

  it('超限淘汰后字节合计不含已被淘汰的条目', () => {
    const name = uniqueName('淘汰');
    const cache = createLruCache<number>(2, { name, weigh: (_key, value) => value });

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 4);

    expect(findStat(name)?.size()).toBe(2);
    expect(findStat(name)?.bytes?.()).toBe(6);

    cache.dispose();
  });

  it('不传 weigh 的缓存只下发条数，不提供字节读数', () => {
    const name = uniqueName('仅条数');
    const cache = createLruCache<number>(4, { name });
    cache.set('a', 1);

    expect(findStat(name)?.size()).toBe(1);
    expect(findStat(name)?.bytes).toBeUndefined();

    cache.dispose();
  });

  it('下发命中 / 未命中读数：get 命中与落空各自累加，has 与清空不计入', () => {
    const name = uniqueName('命中');
    const cache = createLruCache<number>(4, { name });
    cache.set('a', 1);

    expect(findStat(name)?.hits?.()).toBe(0);
    expect(findStat(name)?.misses?.()).toBe(0);

    expect(cache.get('a')).toBe(1);
    expect(findStat(name)?.hits?.()).toBe(1);

    expect(cache.get('missing')).toBeUndefined();
    expect(findStat(name)?.misses?.()).toBe(1);

    // has 只是存在性判断，不改变命中读数
    expect(cache.has('a')).toBe(true);
    expect(findStat(name)?.hits?.()).toBe(1);
    expect(findStat(name)?.misses?.()).toBe(1);

    // clear / 淘汰都不重置计数：它表达的是「这段时间缓存有没有在起作用」的累计值，
    // 归零会让面板在清空操作后立刻失去判断依据
    cache.clear();
    expect(findStat(name)?.hits?.()).toBe(1);
    expect(findStat(name)?.misses?.()).toBe(1);

    cache.dispose();
  });

  it('淘汰与 dispose 不影响累计命中读数', () => {
    const name = uniqueName('命中累计');
    const cache = createLruCache<number>(1, { name });
    cache.set('a', 1);
    cache.set('b', 2);

    expect(cache.get('a')).toBeUndefined(); // 已被淘汰 → 未命中
    expect(cache.get('b')).toBe(2); // 命中
    expect(findStat(name)?.hits?.()).toBe(1);
    expect(findStat(name)?.misses?.()).toBe(1);

    cache.dispose();
  });
});
