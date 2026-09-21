import { describe, expect, it } from 'vitest';

import {
  garbageCollectChordMap,
  getEdgeChords,
  parseSlotKey,
  pruneOrphanChordRefs,
  removeChordFromSlot,
  setEdgeChords,
  swapOrMoveSlotChords,
} from '@/domains/score/model/chordSlots';

import type { ChordId } from '@/domains/chord/types';
import type { ChordLineSlots, SlotKey } from '@/domains/score/types';

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
  it('解析合法 char 槽位', () => {
    expect(parseSlotKey('line_l1_char_3')).toEqual({ lineId: 'l1', type: 'char', index: 3 });
  });

  it('解析 start/end 槽位', () => {
    expect(parseSlotKey('line_l1_start_0')).toEqual({ lineId: 'l1', type: 'start', index: 0 });
    expect(parseSlotKey('line_l1_end_0')).toEqual({ lineId: 'l1', type: 'end', index: 0 });
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

  it('removeChordFromSlot 删除并返回原值', () => {
    const map = buildMap({ l1: { char: { 2: 'c1' } } });
    expect(removeChordFromSlot(map, slotKey('line_l1_char_2'))).toBe('c1');
    expect(map.get('l1')?.char.size).toBe(0);
    expect(removeChordFromSlot(map, slotKey('line_l1_char_2'))).toBeNull();
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
