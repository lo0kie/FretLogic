/**
 * 和弦引用倒排索引的纯构建与反查（与 store 无关）：
 * 建立 chordId -> { song, count }[] 的映射，供删除/合并和弦前的引用反查。
 *
 * 构建刻意拆成「单首计数」+「并入索引」两步而不是一个整表构建函数：store 侧要让每首歌的
 * 依赖独立成片（见 songStore 的 chordReferencesIndex），才能在单首歌的绑定变更时只重算那一首。
 */
import type { ChordId } from '@/domains/chord/types';
import type { ChordLineSlots, LineId, Song } from '@/domains/score/types';

export type ChordReferenceIndex = Map<string, { song: Song; count: number }[]>;

/** 单首歌的 chordId -> 引用次数计数表（同歌曲内多个槽位引用同一和弦合并计数）。 */
export const buildSongRefCounts = (chordMap: Map<LineId, ChordLineSlots>): Map<string, number> => {
  const counts = new Map<string, number>();
  const add = (chordId: ChordId) => {
    if (!chordId) return;
    counts.set(chordId, (counts.get(chordId) ?? 0) + 1);
  };
  for (const slots of chordMap.values()) {
    for (const chordId of slots.char.values()) add(chordId);
    slots.start.forEach(add);
    slots.end.forEach(add);
  }
  return counts;
};

/** 把单首歌的计数表并入倒排索引（歌曲引用一并记入，反查时可直接拿到所属歌曲）。 */
export const mergeSongRefCounts = (index: ChordReferenceIndex, song: Song, counts: Map<string, number>): void => {
  for (const [chordId, count] of counts) {
    let list = index.get(chordId);
    if (!list) {
      list = [];
      index.set(chordId, list);
    }
    list.push({ song, count });
  }
};

/** 快速反查一组和弦 ID 关联的歌曲引用列表（去重合并同歌曲内多指法的引用次数）。 */
export const collectChordReferences = (
  index: ChordReferenceIndex,
  chordIds: Iterable<string>
): { song: Song; count: number }[] => {
  const songCountMap = new Map<string, { song: Song; count: number }>();
  for (const chordId of chordIds) {
    const refs = index.get(chordId);
    if (!refs) continue;
    for (const { song, count } of refs) {
      const existing = songCountMap.get(song.id);
      if (existing) existing.count += count;
      else songCountMap.set(song.id, { song, count });
    }
  }
  return Array.from(songCountMap.values());
};
