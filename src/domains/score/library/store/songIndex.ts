/**
 * 和弦引用倒排索引的纯构建与反查（与 store 无关）：
 * 建立 chordId -> { song, count }[] 的映射，供删除/合并和弦前的引用反查。
 */
import type { Song } from '@/domains/score/types';

export type ChordReferenceIndex = Map<string, { song: Song; count: number }[]>;

/** 由歌曲列表构建 chordId -> 引用列表 的倒排索引（同歌曲内多指法引用合并计数）。 */
export const buildChordReferenceIndex = (songs: Song[]): ChordReferenceIndex => {
  const index: ChordReferenceIndex = new Map();
  for (const song of songs) {
    const countMap = new Map<string, number>();
    for (const chordId of song.chordMap.values()) {
      if (!chordId) continue;
      countMap.set(chordId, (countMap.get(chordId) ?? 0) + 1);
    }
    for (const [chordId, count] of countMap.entries()) {
      let list = index.get(chordId);
      if (!list) {
        list = [];
        index.set(chordId, list);
      }
      list.push({ song, count });
    }
  }
  return index;
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
      if (existing) {
        existing.count += count;
      } else {
        songCountMap.set(song.id, { song, count });
      }
    }
  }
  return Array.from(songCountMap.values());
};
