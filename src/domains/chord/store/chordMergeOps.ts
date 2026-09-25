/**
 * 同名和弦变体的重复检测（纯逻辑，与 store 无关）：
 * 移入目标分组后，同名变体内两两比对——指纹一致且横按一致才视为"完全相同"
 * （指纹不含 barres，需补充比对），产出丢弃集与合并映射。
 */
import { computeChordFingerprint } from '@/domains/chord/theory/theory';
import { computeBarresSignature } from '@/domains/fretboard/model/coordinates';

import type { Chord } from '@/domains/chord/types';

export interface MergeDetection {
  /** 被丢弃的重复和弦 id 集合 */
  droppedIds: Set<string>;
  /** key 为被丢弃的重复和弦 id，value 为合并后保留的和弦 id */
  mergeMapping: Map<string, string>;
}

/** 重复组的键：指纹 + 横按（横按必须并入键，指纹本身不含它） */
const duplicateGroupKey = (chord: Chord): string =>
  `${computeChordFingerprint(chord)}|${computeBarresSignature(chord.barres, { withFinger: true })}`;

/**
 * 在同名变体列表内**按重复组**收敛重复项（不是两两比对）。
 *
 * 两两比对会在 ≥3 个同指纹变体上同时产出 a→b 与 b→c，而 b 自己也已被丢弃 ——
 * 映射的终点是死 id，桥接层据此重定向乐谱槽位就把槽位指到不存在的和弦上。
 * 归组后每组只选一个保留项、其余一律指向它，映射终点必然是存活项。
 *
 * @param movedIds 本次移入的和弦 id 集合：优先保留目标分组原有项；
 *                 组内同为移入项（源分组历史重复数据）时保留靠前者。
 */
export const detectMergedDuplicates = (sameNameVariants: Chord[], movedIds: Set<string>): MergeDetection => {
  const droppedIds = new Set<string>();
  const mergeMapping = new Map<string, string>();

  // 先归组：Map 保持插入顺序，组内次序即原数组次序（「靠前」的判据）
  const groups = new Map<string, Chord[]>();
  for (const chord of sameNameVariants) {
    const key = duplicateGroupKey(chord);
    const list = groups.get(key);
    if (list) list.push(chord);
    else groups.set(key, [chord]);
  }

  for (const list of groups.values()) {
    if (list.length < 2) continue;
    // 保留项：优先目标分组**原有**的项（非移入）；整组都是移入项时保留靠前者。
    // 与原先两两规则同义，只是判定从「一对」提升到「一组」。
    const keep = list.find(c => !movedIds.has(c.id)) ?? list[0]!;
    for (const chord of list) {
      if (chord.id === keep.id) continue;
      droppedIds.add(chord.id);
      mergeMapping.set(chord.id, keep.id);
    }
  }

  return { droppedIds, mergeMapping };
};
