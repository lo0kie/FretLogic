import { describe, expect, it } from 'vitest';

import {
  cloneChordMap,
  garbageCollectChordMap,
  getEdgeChords,
  parseSlotKey,
  pruneOrphanChordRefs,
  removeChordFromSlot,
  setEdgeChords,
  shiftCharSlotsForEditedLines,
  swapOrMoveSlotChords,
} from '@/domains/score/model/chordSlots';

import type { ChordId } from '@/domains/chord/types';
import type { ChordLineSlots, LineId, SlotKey } from '@/domains/score/types';

/** 夹具窄化：槽位值与键在源码里是 branded string，测试按字面量书写后集中转换一次 */
const chordIds = (...values: string[]): ChordId[] => values.map(v => v as ChordId);
const slotKey = (value: string): SlotKey => value as SlotKey;

/** 构造嵌套 chordMap：{ lineId: { char: {idx: id}, start: [], end: [] } } */
const buildMap = (
  lines: Record<string, { char?: Record<number, string>; start?: string[]; end?: string[] }>
): Map<string, ChordLineSlots> => {
  const map = new Map<string, ChordLineSlots>();
  for (const [lineId, slots] of Object.entries(lines)) {
    map.set(lineId, {
      char: new Map(slots.char ? Object.entries(slots.char).map(([k, v]) => [Number(k), v as ChordId]) : []),
      start: slots.start ? chordIds(...slots.start) : [],
      end: slots.end ? chordIds(...slots.end) : [],
    });
  }
  return map;
};

describe('chordMap: 槽位键解析', () => {
  // 槽位类型三取一是同一条 `(char|start|end)` 正则的三个 token，输入结构完全一致，收成一张表。
  it.each([
    { label: 'char 槽位', key: 'line_l1_char_3', expected: { lineId: 'l1', type: 'char', index: 3 } },
    { label: 'start 槽位', key: 'line_l1_start_0', expected: { lineId: 'l1', type: 'start', index: 0 } },
    { label: 'end 槽位', key: 'line_l1_end_0', expected: { lineId: 'l1', type: 'end', index: 0 } },
  ])('解析合法 $label', ({ key, expected }) => {
    expect(parseSlotKey(key)).toEqual(expected);
  });

  it('非法格式返回 null', () => {
    expect(parseSlotKey('invalid')).toBeNull();
    expect(parseSlotKey('line_l1_xxx_3')).toBeNull();
  });
});

describe('chordMap: 边缘和弦读写（嵌套结构）', () => {
  it('getEdgeChords 按行级列表顺序读取', () => {
    const map = buildMap({ l1: { start: ['a', 'b', 'c'] } });
    expect(getEdgeChords(map, 'l1', 'start')).toEqual(['a', 'b', 'c']);
    expect(getEdgeChords(map, 'missing', 'start')).toEqual([]);
  });

  it('setEdgeChords 替换原序列', () => {
    const map = buildMap({ l1: { start: ['a', 'b'] } });
    setEdgeChords(map, 'l1', 'start', chordIds('x', 'y'));
    // 注：原先此处还有 `map.size === 1`，已删——buildMap 只喂了 l1 一个键，setEdgeChords 只替换
    // 该行的 start 序列、不增删行键，外层 size 恒为 1，属恒真断言；实质覆盖是下一行的序列替换
    expect(getEdgeChords(map, 'l1', 'start')).toEqual(['x', 'y']);
  });

  // 「删空即回收」契约的两个调用点：字符槽位与行首列表共用同一条回收路径，只是入口槽位类型不同。
  it.each([
    { label: '删除字符槽位', lines: { l1: { char: { 2: 'c1' } } }, key: 'line_l1_char_2', expected: 'c1' },
    { label: '清空行首列表', lines: { l1: { start: ['a'] } }, key: 'line_l1_start_0', expected: 'a' },
  ])('removeChordFromSlot $label 后回收整行容器', ({ lines, key, expected }) => {
    const map = buildMap(lines);
    expect(removeChordFromSlot(map, slotKey(key))).toBe(expected);
    // 槽位删空 ⇒ 整行容器一并回收（见 chordSlots.ts 的 isLineSlotsEmpty）：空容器会让
    // chordMapsEqual 的 size 比较把「删空后」与「从未有过该行」判成两种状态，凭空造出撤销条目。
    // 此处原先断言 `char.size === 0`（容器仍在），是回收行为落地前的旧口径
    expect(map.has('l1')).toBe(false);
    expect(removeChordFromSlot(map, slotKey(key))).toBeNull();
  });

  it('swapOrMoveSlotChords 拖动到行首添加按钮时插入到已有和弦的左侧(0位)', () => {
    const map = buildMap({ l1: { char: { 3: 'chordMoving' }, start: ['chordExisting'] } });
    // 拖动 chordMoving 到行首添加按钮 (line_l1_start_1)
    swapOrMoveSlotChords(map, slotKey('line_l1_char_3'), slotKey('line_l1_start_1'));
    expect(getEdgeChords(map, 'l1', 'start')).toEqual(['chordMoving', 'chordExisting']);
    expect(map.get('l1')?.char.size).toBe(0);
  });

  it('swapOrMoveSlotChords 同行 start 槽位拖到越界索引（占位/添加按钮）时追加到列表尾部', () => {
    // 锁定「同行边和弦重排」的越界落点语义：目标索引 >= 当前列表长度时 clamp 到 length、插到尾部。
    // 与「跨槽位新增」路径（resolveEdgeInsertIndex：start 越界落 0 位=头部）刻意不同——前者是重排、
    // 后者是新增，语义不同故落点不同，勿合并。
    const map = buildMap({ l1: { start: ['a', 'b'] } });
    swapOrMoveSlotChords(map, slotKey('line_l1_start_0'), slotKey('line_l1_start_2'));
    expect(getEdgeChords(map, 'l1', 'start')).toEqual(['b', 'a']);
  });
});

describe('chordMap: 清理函数（嵌套结构）', () => {
  it('garbageCollectChordMap 移除已删除行的整行槽位，并对存留行越界字符槽位剪枝', () => {
    const map = buildMap({ l1: { char: { 0: 'c1', 9: 'stale' } }, l2: { char: { 0: 'c2' } } });
    const { map: cleaned, changed } = garbageCollectChordMap(map, ['l1'], [2]);
    expect(changed).toBe(true);
    expect(cleaned.size).toBe(1);
    expect(cleaned.get('l1')?.char.get(0)).toBe('c1');
    expect(cleaned.get('l1')?.char.has(9)).toBe(false);
  });

  it('pruneOrphanChordRefs 移除指向不存在和弦的引用', () => {
    const map = buildMap({ l1: { char: { 0: 'c1', 1: 'ghost' }, start: ['c1', 'ghost'] } });
    const { map: cleaned, changed } = pruneOrphanChordRefs(map, new Set(['c1']));
    expect(changed).toBe(true);
    expect(cleaned.size).toBe(1);
    expect([...cleaned.get('l1')!.char.values()]).toEqual(['c1']);
    expect(cleaned.get('l1')!.start).toEqual(['c1']);
  });
});

/**
 * 夹具窄化（续）：`buildMap` 的键按字面量书写（string），而 `cloneChordMap` /
 * `shiftCharSlotsForEditedLines` 的入参键是 branded `LineId`，返回值也是 —— 两处各转一次。
 */
const asLineIdMap = (map: Map<string, ChordLineSlots>): Map<LineId, ChordLineSlots> =>
  map as unknown as Map<LineId, ChordLineSlots>;
/** 反向：把带 LineId 键的结果当字面量键读，省去每处 key 转换 */
const asLiteralKeyedMap = (map: Map<LineId, ChordLineSlots>): Map<string, ChordLineSlots> =>
  map as unknown as Map<string, ChordLineSlots>;

describe('cloneChordMap：深一层拷贝，改副本不动原件', () => {
  it('内层 Map 与两个边和弦数组都是新对象、元素相等；改副本不回头动原件', () => {
    const map = buildMap({ l1: { char: { 0: 'c1' }, start: ['c1'], end: ['c2'] } });
    const copy = asLiteralKeyedMap(cloneChordMap(asLineIdMap(map)));

    expect(copy).not.toBe(map);
    expect(copy.get('l1')).not.toBe(map.get('l1'));
    expect(copy.get('l1')!.char).not.toBe(map.get('l1')!.char);
    expect(copy.get('l1')!.start).not.toBe(map.get('l1')!.start);
    expect(copy.get('l1')!.end).not.toBe(map.get('l1')!.end);
    expect([...copy.get('l1')!.char.entries()]).toEqual([...map.get('l1')!.char.entries()]);
    expect(copy.get('l1')!.start).toEqual(['c1']);

    // 改副本的三种方式都不得回头动到原件 —— 「换新引用」这条约定（消费方 memo 依赖它）的前提
    copy.get('l1')!.char.set(1, 'c9' as ChordId);
    copy.get('l1')!.start.push('c9' as ChordId);
    copy.delete('l1');
    expect(map.get('l1')!.char.has(1)).toBe(false);
    expect(map.get('l1')!.start).toEqual(['c1']);
    expect(map.has('l1')).toBe(true);
  });
});

describe('shiftCharSlotsForEditedLines：行内局部编辑后按下标平移字符槽', () => {
  const lineIds = (...ids: string[]): LineId[] => ids.map(id => id as LineId);

  it('行首插入一个字符：其后各槽整体右移一位，边和弦槽位原样保留', () => {
    const map = buildMap({ l1: { char: { 0: 'c1', 2: 'c2' }, start: ['c1'], end: ['c2'] } });
    // 注意：本函数的入参与返回都是 `Map<string, ChordLineSlots>`（与 buildMap 同型），**不需要**
    // 上面那对窄化 —— 只有 cloneChordMap 的键是 branded LineId。别顺手给它也套上。
    const { map: result, changed } = shiftCharSlotsForEditedLines(map, ['abc'], ['xabc'], lineIds('l1'), lineIds('l1'));

    expect(changed).toBe(true);
    expect([...result.get('l1')!.char.entries()]).toEqual([
      [1, 'c1'],
      [3, 'c2'],
    ]);
    // 边和弦是**行级密列表**，不随字符位置移动
    expect(result.get('l1')!.start).toEqual(['c1']);
    expect(result.get('l1')!.end).toEqual(['c2']);
  });

  it('行序未变（下标全部原位）时 changed 为假，且返回**原 Map 引用**', () => {
    const map = buildMap({ l1: { char: { 0: 'c1' } } });
    const { map: next, changed } = shiftCharSlotsForEditedLines(map, ['abc'], ['abc'], lineIds('l1'), lineIds('l1'));

    expect(changed).toBe(false);
    // 引用不变：调用方按引用判「没变」，换引用会让下游整条链重算
    expect(next).toBe(map);
  });

  it('lineId 只存在于旧行序（行已被删）时该行不参与平移，原样留给 GC', () => {
    const map = buildMap({ l1: { char: { 0: 'c1' } }, l2: { char: { 0: 'c2' } } });
    const { map: result, changed } = shiftCharSlotsForEditedLines(
      map,
      ['abc', 'def'],
      ['xabc'],
      lineIds('l1', 'l2'),
      lineIds('l1')
    );

    expect(changed).toBe(true);
    expect(result.get('l1')!.char.get(1)).toBe('c1');
    // l2 不在新行序里 ⇒ 不进重映射表 ⇒ 槽位保持原样，交由 garbageCollectChordMap 处理
    expect(result.get('l2')!.char.get(0)).toBe('c2');
  });
});
