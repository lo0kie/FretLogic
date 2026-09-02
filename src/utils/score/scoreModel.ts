// ===== 槽位 key 编码：单一真相源，替换散落的 `line_${...}` / `char_${...}` 模板 =====

import type { SlotKey } from '@/types';

export type EdgeSlotType = 'start' | 'end';

/** 边和弦（行首/行尾）槽位的存储 key */
export const chordSlotKey = (lineId: string, type: EdgeSlotType, index: number): SlotKey =>
  `line_${lineId}_${type}_${index}` as SlotKey;

/** 字符槽位的存储 key */
export const charKey = (lineId: string, index: number): SlotKey => `line_${lineId}_char_${index}` as SlotKey;

/** 边和弦槽位的前缀，用于整体清除某行某侧的槽位 */
export const edgeSlotPrefix = (lineId: string, type: EdgeSlotType): string => `line_${lineId}_${type}_`;

/** 按序收集某行某侧边和弦槽位中存储的和弦 id（只读，兼容裸 Map） */
export const collectEdgeChordIds = (
  chordMap: ReadonlyMap<string, string>,
  lineId: string,
  type: EdgeSlotType
): string[] => {
  const prefix = `line_${lineId}_${type}_`;
  const entries: { index: number; id: string }[] = [];
  for (const [k, id] of chordMap) {
    if (k.startsWith(prefix)) {
      const idxStr = k.slice(prefix.length);
      const idx = parseInt(idxStr, 10);
      if (!isNaN(idx) && id) {
        entries.push({ index: idx, id });
      }
    }
  }
  entries.sort((a, b) => a.index - b.index);
  return entries.map(e => e.id);
};
