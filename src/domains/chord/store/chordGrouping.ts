/**
 * 和弦分组卡片视图模型的纯构建层（与 store 无关）：
 * 同名变体归并（GroupedChordCard）、多指法索引、分组内排序视图。
 */
import { getGroupSortKey } from '@/domains/chord/theory/entityFactories';
import { getChordIsInverted, getChordName, sortChordsByRule } from '@/domains/chord/theory/theory';

import type { ChordOrName } from '@/domains/chord/theory/theory';
import type { Chord, Group, GroupedChordCard, GroupSortRule } from '@/domains/chord/types';

/** 归一化名称键缓存：键只由和弦自身内容决定，按对象引用缓存即可。
 *  前提与 theory.ts 的 sortMetaCache / chordAliasCache 相同——和弦库的保存路径总是产出新对象、
 *  草稿是 cloneDeep 副本，且撤销恢复的孤儿收容已改为不可变更新，故不会读到被原地改动的旧键。
 *  收益点：buildMultiFingeringData 与 buildGroupedChordCards 会对同一批和弦各算一次 nameKeyOf
 *  （千级库 = 3000+ 次 getChordName 拼接 + trim + toLowerCase），缓存后第二次起直接命中。 */
const nameKeyCache = new WeakMap<object, string>();

/** 计算和弦的归一化名称键（去空格、转小写），用于同名变体的分组匹配。 */
export function nameKeyOf(chordOrName: string | ChordOrName): string {
  if (typeof chordOrName === 'string') return chordOrName.trim().toLowerCase();
  const cached = nameKeyCache.get(chordOrName);
  if (cached !== undefined) return cached;
  const key = getChordName(chordOrName).trim().toLowerCase();
  nameKeyCache.set(chordOrName, key);
  return key;
}

/** 对同一和弦名的多个指法变体排序：转位在后，其余按品位偏移升序。 */
export function sortVariants(variants: Chord[]): Chord[] {
  // 先预映射再排序：转位判定含音集收集与根音推导，放进比较器就是 O(n log n) 次重复求值
  // （与 sortChordsByRule 的 NAME_ASC 分支同一模式，那里也是先 map 出名字再 sort）
  return variants
    .map(chord => ({ chord, inverted: getChordIsInverted(chord), offset: chord.fretOffset ?? 0 }))
    .sort((a, b) => (a.inverted !== b.inverted ? (a.inverted ? 1 : -1) : a.offset - b.offset))
    .map(item => item.chord);
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
    // sortedMains 与 cards 同源（前者的每个元素都来自后者的 mainChord），而 sortChordsByRule 是纯排序、
    // 元素引用保持（各分支一律返回等长新数组，不增删元素），故 get 必命中——不需要 filter(Boolean) 兜底。
    // 刻意不保留兜底：真出现 miss 时它会静默吞掉卡片，比断言失败更难定位。
    const byMainId = new Map<string, GroupedChordCard>();
    for (const card of cards) byMainId.set(card.mainChord.id, card);
    result.set(
      group.id,
      sortedMains.map(m => byMainId.get(m.id)!)
    );
  });
  return result;
}
