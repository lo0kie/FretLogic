/**
 * 和弦分组卡片视图模型的纯构建层（与 store 无关）：
 * 同名变体归并（GroupedChordCard）、多指法索引、分组内排序视图。
 */
import { getGroupSortKey } from '@/domains/chord/theory/entityFactories';
import { computeIsInverted, getChordName, sortChordsByRule } from '@/domains/chord/theory/theory';

import type { ChordOrName } from '@/domains/chord/theory/theory';
import type { Chord, Group, GroupedChordCard, GroupSortRule } from '@/domains/chord/types';

/** 计算和弦的归一化名称键（去空格、转小写），用于同名变体的分组匹配。 */
export function nameKeyOf(chordOrName: string | ChordOrName): string {
  if (typeof chordOrName === 'string') return chordOrName.trim().toLowerCase();
  return getChordName(chordOrName).trim().toLowerCase();
}

/** 对同一和弦名的多个指法变体排序：转位在后，其余按品位偏移升序。 */
export function sortVariants(variants: Chord[]): Chord[] {
  return [...variants].sort((a, b) => {
    const aInv = computeIsInverted(a.strings, a.fretOffset, a.tuning, a, a.rootStringIndex);
    const bInv = computeIsInverted(b.strings, b.fretOffset, b.tuning, b, b.rootStringIndex);
    if (aInv !== bInv) return aInv ? 1 : -1;
    return (a.fretOffset ?? 0) - (b.fretOffset ?? 0);
  });
}

/** 将一组同名和弦变体包装成卡片视图模型，取排序后的首个作为主指法。 */
export function toGroupedCard(variants: Chord[]): GroupedChordCard {
  const sorted = variants.length > 1 ? sortVariants(variants) : variants;
  return {
    mainChord: sorted[0]!,
    variants: sorted,
    hasVariants: sorted.length > 1,
    variantCount: sorted.length,
  };
}

/** 构建 groupId -> (名称键 -> 多指法卡片) 的两级索引；仅收录存在多指法的同名变体。 */
export function buildMultiFingeringData(chords: Chord[]): Map<string, Map<string, GroupedChordCard>> {
  const byGroup = new Map<string, Map<string, Chord[]>>();
  chords.forEach(chord => {
    const key = nameKeyOf(chord);
    let nameMap = byGroup.get(chord.groupId);
    if (!nameMap) {
      nameMap = new Map();
      byGroup.set(chord.groupId, nameMap);
    }
    const list = nameMap.get(key);
    if (list) list.push(chord);
    else nameMap.set(key, [chord]);
  });

  const result = new Map<string, Map<string, GroupedChordCard>>();
  byGroup.forEach((nameMap, groupId) => {
    const multiMap = new Map<string, GroupedChordCard>();
    nameMap.forEach((variants, key) => {
      if (variants.length <= 1) return;
      multiMap.set(key, toGroupedCard(variants));
    });
    if (multiMap.size > 0) result.set(groupId, multiMap);
  });
  return result;
}

/**
 * 构建分组 -> 按规则排序后的和弦卡片列表：
 * 同名变体归并为一张卡片（主指法 + 变体），再按分组自身的排序规则对主指法排序。
 */
export function buildGroupedChordCards(
  groups: Group[],
  chordsByGroup: Map<string, Chord[]>,
  multiData: Map<string, Map<string, GroupedChordCard>>,
  defaultSortRule: GroupSortRule
): Map<string, GroupedChordCard[]> {
  const result = new Map<string, GroupedChordCard[]>();
  groups.forEach(group => {
    const chords = chordsByGroup.get(group.id) ?? [];
    const multi = multiData.get(group.id);
    const visited = new Set<string>();
    const cards: GroupedChordCard[] = [];

    chords.forEach(chord => {
      const key = nameKeyOf(chord);
      if (visited.has(key)) return;
      visited.add(key);
      cards.push(multi?.get(key) ?? toGroupedCard([chord]));
    });

    const sortedMains = sortChordsByRule(
      cards.map(c => c.mainChord),
      group.sortRule ?? defaultSortRule,
      getGroupSortKey(group) ?? 'C'
    );
    const byMainId = new Map(cards.map(c => [c.mainChord.id, c]));
    result.set(group.id, sortedMains.map(m => byMainId.get(m.id)!).filter(Boolean));
  });
  return result;
}
