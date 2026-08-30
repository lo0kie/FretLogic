import { describe, expect, it } from 'vitest';
import {
  garbageCollectChordMap,
  getEdgeChords,
  parseSlotKey,
  pruneOrphanChordRefs,
  removeChordFromSlot,
  setEdgeChords,
  swapOrMoveSlotChords,
} from '@/utils/music/chord-fretboard';

const buildMap = (entries: Record<string, string>): Map<string, string> => new Map(Object.entries(entries));

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

describe('chordMap: 边缘和弦读写（Map 结构）', () => {
  it('getEdgeChords 按序号顺序读取', () => {
    const map = buildMap({
      line_l1_start_0: 'a',
      line_l1_start_1: 'b',
      line_l1_start_2: 'c',
    });
    expect(getEdgeChords(map, 'l1', 'start')).toEqual(['a', 'b', 'c']);
  });

  it('setEdgeChords 替换原序列', () => {
    const map = buildMap({
      line_l1_start_0: 'a',
      line_l1_start_1: 'b',
    });
    setEdgeChords(map, 'l1', 'start', ['x', 'y']);
    expect(map.size).toBe(2);
    expect(map.get('line_l1_start_0')).toBe('x');
    expect(map.get('line_l1_start_1')).toBe('y');
  });

  it('removeChordFromSlot 删除并返回原值', () => {
    const map = buildMap({ line_l1_char_2: 'c1' });
    expect(removeChordFromSlot(map, 'line_l1_char_2')).toBe('c1');
    expect(map.size).toBe(0);
  });

  it('swapOrMoveSlotChords 拖动到行首添加按钮时插入到已有和弦的左侧(0位)', () => {
    const map = buildMap({
      line_l1_start_0: 'chordExisting',
      line_l1_char_3: 'chordMoving',
    });
    // 拖动 chordMoving 到行首添加按钮 (line_l1_start_1)
    swapOrMoveSlotChords(map, 'line_l1_char_3', 'line_l1_start_1');
    expect(map.get('line_l1_start_0')).toBe('chordMoving');
    expect(map.get('line_l1_start_1')).toBe('chordExisting');
    expect(map.size).toBe(2);
  });
});

describe('chordMap: 清理函数（Map 结构）', () => {
  it('garbageCollectChordMap 移除已删除行的槽位', () => {
    const map = buildMap({
      line_l1_char_0: 'c1',
      line_l2_char_0: 'c2',
    });
    const { map: cleaned, changed } = garbageCollectChordMap(map, ['l1']);
    expect(changed).toBe(true);
    expect(cleaned.size).toBe(1);
    expect(cleaned.get('line_l1_char_0')).toBe('c1');
  });

  it('pruneOrphanChordRefs 移除指向不存在和弦的引用', () => {
    const map = buildMap({
      line_l1_char_0: 'c1',
      line_l1_char_1: 'ghost',
    });
    const { map: cleaned, changed } = pruneOrphanChordRefs(map, new Set(['c1']));
    expect(changed).toBe(true);
    expect(cleaned.size).toBe(1);
    expect(cleaned.get('line_l1_char_0')).toBe('c1');
  });
});
