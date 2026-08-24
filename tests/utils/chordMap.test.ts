import { describe, expect, it } from 'vitest';
import { getEdgeChords, parseSlotKey, removeChordFromSlot, setEdgeChords } from '@/utils/chord-fretboard';

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

describe('chordMap: 边缘和弦读写', () => {
  it('getEdgeChords 按序号顺序读取', () => {
    const map: Record<string, string> = {
      line_l1_start_0: 'a',
      line_l1_start_1: 'b',
      line_l1_start_2: 'c',
    };
    expect(getEdgeChords(map, 'l1', 'start')).toEqual(['a', 'b', 'c']);
  });

  it('setEdgeChords 替换原序列', () => {
    const map: Record<string, string> = {
      line_l1_start_0: 'a',
      line_l1_start_1: 'b',
    };
    setEdgeChords(map, 'l1', 'start', ['x', 'y']);
    expect(map).toEqual({ line_l1_start_0: 'x', line_l1_start_1: 'y' });
  });

  it('removeChordFromSlot 删除并返回原值', () => {
    const map: Record<string, string> = { line_l1_char_2: 'c1' };
    expect(removeChordFromSlot(map, 'line_l1_char_2')).toBe('c1');
    expect(map).toEqual({});
  });
});
