/**
 * 同名和弦变体的重复检测（纯逻辑，与 store 无关）：
 * 移入目标分组后，同名变体内两两比对——指纹一致且横按一致才视为"完全相同"
 * （指纹不含 barres，需补充比对），产出丢弃集与合并映射。
 */
import { computeChordFingerprint } from '@/domains/chord/theory/theory';
import { areBarresEqual } from '@/domains/fretboard/model/coordinates';

import type { Chord } from '@/domains/chord/types';

export interface MergeDetection {
  /** 被丢弃的重复和弦 id 集合 */
  droppedIds: Set<string>;
  /** key 为被丢弃的重复和弦 id，value 为合并后保留的和弦 id */
  mergeMapping: Map<string, string>;
}

/**
 * 在同名变体列表内两两比对重复项。
 * @param movedIds 本次移入的和弦 id 集合：优先保留目标分组原有项；
 *                 两者同为移入项（源分组历史重复数据）时保留靠前者。
 */
export const detectMergedDuplicates = (sameNameVariants: Chord[], movedIds: Set<string>): MergeDetection => {
  const droppedIds = new Set<string>();
  const mergeMapping = new Map<string, string>();
  for (let i = 0; i < sameNameVariants.length; i++) {
    const a = sameNameVariants[i]!;
    if (droppedIds.has(a.id)) continue;
    // a 的指纹与内层 j 无关，提到内层循环外，避免每轮重算
    const aFingerprint = computeChordFingerprint(a);
    for (let j = i + 1; j < sameNameVariants.length; j++) {
      const b = sameNameVariants[j]!;
      if (droppedIds.has(b.id)) continue;
      if (aFingerprint !== computeChordFingerprint(b)) continue;
      if (!areBarresEqual(a.barres, b.barres)) continue;
      const [drop, keep] = movedIds.has(a.id) && !movedIds.has(b.id) ? [a, b] : [b, a];
      droppedIds.add(drop.id);
      mergeMapping.set(drop.id, keep.id);
    }
  }
  return { droppedIds, mergeMapping };
};
