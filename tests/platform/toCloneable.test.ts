/**
 * toCloneable 的口径：唯一承诺是「返回值能被 structuredClone」，且**不改变内容**。
 *
 * 这条不变量是落盘链路的地基 —— 它一破，症状不是报错而是**整批写入静默失败**
 * （IDB 抛 DataCloneError，调用方 catch 后只上报），用户看到的是「界面改了、刷新就没了」。
 * 故这里把真实数据里出现过的每一种「代理形态」都钉住。
 *
 * ⚠️ 两种形态都**不是**靠「看本层是不是代理」能发现的，改实现前先读这两个用例：
 *  ① **raw 容器里装着代理**（Vue 深层响应式是读时按需包代理，raw 容器不会把元素也变 raw）；
 *  ② **普通对象的字段是代理**（`{ ...reactiveX }` 展开复制留下的）。
 * 实测中招的是 ①：`chordMap` 这种「Map 套槽位对象」的结构，早先的实现在这里漏掉整片代理。
 */
import { reactive, ref, shallowRef } from 'vue';

import { describe, expect, it } from 'vitest';

import { toCloneable } from '@/platform/utils/common';

describe('toCloneable', () => {
  it('原始值原样返回', () => {
    expect(toCloneable(1)).toBe(1);
    expect(toCloneable('a')).toBe('a');
    expect(toCloneable(null)).toBeNull();
    expect(toCloneable(undefined)).toBeUndefined();
  });

  it('整块取自响应式源的对象：剥顶层后即可克隆', () => {
    const raw = { id: 'a', title: 't', nested: new Map([['k', { v: 1 }]]) };
    const rx = reactive(raw);
    const out = toCloneable(rx);
    expect(() => structuredClone(out)).not.toThrow();
    expect(out).toEqual(raw);
  });

  it('展开复制留下的嵌套代理也被剥掉（裸 toRaw 会漏掉的形态）', () => {
    const rx = reactive({ id: 'a', chordMap: new Map([['l1', { char: new Map([['0', 'c1']]) }]]), lineIds: ['l1'] });
    // 展开读的是响应式 getter，故 chordMap 仍带代理 —— 这正是 reorderSongs 那种调用方的形态
    const spread = { ...rx };
    // 先确认确实是「裸 toRaw 修不好」的那种输入，否则本用例会变成恒真
    expect(JSON.stringify(spread.chordMap instanceof Map)).toBe('true');
    expect(() => structuredClone(spread)).toThrow();
    expect(() => structuredClone(structuredClone(toCloneable(spread)))).not.toThrow();
    expect(toCloneable(spread)).toEqual(spread);
  });

  it('raw 容器里装着代理时也要剥掉（chordMap 那种「Map 套槽位对象」的真实形态）', () => {
    const rx = reactive({ chordMap: new Map([['l1', { char: new Map([[0, 'c1']]), start: [], end: [] }]]) });
    // 通过代理读值再写回：raw Map 里于是躺着一个 reactive 值，而 Map 自己仍是 raw
    for (const [k, v] of rx.chordMap) rx.chordMap.set(k, v);
    const map = rx.chordMap as unknown as Map<string, unknown>;
    // 先钉住「输入确实不可克隆」——否则本用例会退化成恒真
    expect(() => structuredClone(map)).toThrow();

    const out = toCloneable(rx) as unknown as { chordMap: Map<string, { char: Map<number, string> }> };
    expect(() => structuredClone(out)).not.toThrow();
    // 内容不能丢：键在、槽位在、槽位里的字符在
    expect([...out.chordMap.keys()]).toEqual(['l1']);
    expect([...out.chordMap.get('l1')!.char.entries()]).toEqual([[0, 'c1']]);
  });

  it('普通对象的字段是代理时也要剥掉（展开复制的另一处落点）', () => {
    const rx = reactive({ id: 'a', meta: { deep: { v: 1 } } });
    const holder = { id: 'a', meta: { deep: rx.meta.deep } };
    expect(() => structuredClone(holder)).toThrow();

    const out = toCloneable(holder);
    expect(() => structuredClone(out)).not.toThrow();
    expect(out.meta.deep).toEqual({ v: 1 });
  });

  it('Map / Set / 数组作为**顶层**入参时也能克隆', () => {
    const map = reactive(new Map([['k', { v: 1 }]]));
    const set = reactive(new Set([{ v: 2 }] as unknown[]));
    const arr = reactive([{ v: 3 }]);
    for (const value of [map, set, arr]) expect(() => structuredClone(toCloneable(value))).not.toThrow();
    expect([...toCloneable(map).values()]).toEqual([{ v: 1 }]);
    expect([...toCloneable(set)]).toEqual([{ v: 2 }]);
    expect(toCloneable(arr)).toEqual([{ v: 3 }]);
  });

  it('ref 先拆包再剥代理', () => {
    expect(toCloneable(ref({ v: 1 }))).toEqual({ v: 1 });
    expect(() => structuredClone(toCloneable(ref({ v: 1 })))).not.toThrow();
  });

  it('内建对象（Date）原样带过，不被重建', () => {
    const date = new Date('2026-01-01T00:00:00Z');
    const out = toCloneable({ id: 'a', createdAt: date });
    expect(out.createdAt).toBe(date);
    expect(() => structuredClone(out)).not.toThrow();
  });

  it('不含任何代理的普通对象走「原引用返回」快路径', () => {
    const plain = { id: 'a', map: new Map([['k', 1]]) };
    // 同引用即证明没有无谓重建 —— 这是它在落盘热路径上比 toPlainPersistable 快一个数量级的根据。
    // 惰性是逐层的：外层对象与它那个全 raw 的 Map 都必须原引用返回（任一被重建就说明白扫了一遍）
    const out = toCloneable(plain);
    expect(out).toBe(plain);
    expect(out.map).toBe(plain.map);
  });

  it('全 raw 的嵌套结构整体原引用返回（惰性下钻不会退化成深拷贝）', () => {
    const plain = { id: 'a', chordMap: new Map([['l1', { char: new Map([[0, 'c1']]), start: [], end: [] }]]) };
    const out = toCloneable(plain) as unknown as { chordMap: Map<string, unknown> };
    expect(out).toBe(plain);
    expect(out.chordMap).toBe(plain.chordMap);
    expect(out.chordMap.get('l1')).toBe(plain.chordMap.get('l1'));
  });

  it('深度上限是「环」的保险丝：成环的结构不会把调用方挂死', () => {
    // 环本身不是合法实体（备份导出走 JSON，早就会炸），这里只钉住「不会无限递归」
    const cyc: Record<string, unknown> = { id: 'a' };
    cyc['self'] = cyc;
    expect(() => toCloneable(cyc)).not.toThrow();
  });

  it('shallowRef 包装的字段被拆包', () => {
    const shallow = shallowRef({ a: 1 });
    const out = toCloneable({ wrapper: shallow });
    expect(out.wrapper).toEqual({ a: 1 });
  });
});
