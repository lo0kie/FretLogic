/**
 * 歌曲和弦槽位绑定的批量纯操作层（与 store 无关）：
 * 删除和弦后的批量解绑 / 撤销恢复 / 合并重定向，以及全曲移调时的 chordMap 重映射。
 * 所有函数只做数据变换，持久化标脏通过 touch 回调注入。
 */
import { getChordName, transposeChordName } from '@/domains/chord/theory/theory';

import { touchSong } from './songMeta';

import type { Chord, ChordId } from '@/domains/chord/types';
import type { SlotKey, Song } from '@/domains/score/types';

/** 标脏回调：由 store 提供（内部走防抖持久化） */
export type MarkDirty = (songId: string) => void;

export interface RemovedChordBinding {
  songId: string;
  slotKey: SlotKey;
  chordId: ChordId;
}

/**
 * 从全部歌曲中解除对指定和弦 id 集合的槽位绑定（供删除和弦后联动调用）。
 * @returns 被解除的绑定列表，可传给 restoreChordBindings 做撤销恢复。
 */
export const unbindChordIdsFromSongs = (
  songs: Song[],
  targetIds: Set<string>,
  markDirty: MarkDirty
): RemovedChordBinding[] => {
  const removedBindings: RemovedChordBinding[] = [];
  songs.forEach(song => {
    let hasChanged = false;
    for (const [key, boundChordId] of song.chordMap) {
      if (boundChordId && targetIds.has(boundChordId)) {
        removedBindings.push({ songId: song.id, slotKey: key, chordId: boundChordId });
        song.chordMap.delete(key);
        hasChanged = true;
      }
    }
    if (hasChanged) {
      song.chordMap = new Map(song.chordMap);
      touchSong(song);
      markDirty(song.id);
    }
  });
  return removedBindings;
};

/** 撤销删除和弦/分组时，把此前被解绑的槽位绑定恢复回去。 */
export const restoreChordBindingsToSongs = (
  findSong: (id: string) => Song | undefined,
  bindings: RemovedChordBinding[],
  markDirty: MarkDirty
) => {
  if (bindings.length === 0) return;
  bindings.forEach(({ songId, slotKey, chordId }) => {
    const target = findSong(songId);
    if (!target) return;
    if (target.chordMap.get(slotKey) === undefined) {
      target.chordMap.set(slotKey, chordId);
      touchSong(target);
      markDirty(songId);
    }
  });
};

/**
 * 和弦合并重定向：把全部歌曲中绑定在「被丢弃重复项」上的槽位改绑到「保留项」。
 * 与解绑不同，合并不丢失引用，仅做 id 重映射。
 * @returns 发生重定向的槽位数量（用于提示）。
 */
export const remapChordBindingsInSongs = (
  songs: Song[],
  mapping: Map<string, string>,
  markDirty: MarkDirty
): number => {
  if (mapping.size === 0) return 0;
  let remappedCount = 0;
  songs.forEach(song => {
    let hasChanged = false;
    for (const [key, boundChordId] of song.chordMap) {
      const newChordId = mapping.get(boundChordId) as ChordId | undefined;
      if (newChordId !== undefined && newChordId !== boundChordId) {
        song.chordMap.set(key, newChordId);
        hasChanged = true;
        remappedCount++;
      }
    }
    if (hasChanged) {
      song.chordMap = new Map(song.chordMap);
      touchSong(song);
      markDirty(song.id);
    }
  });
  return remappedCount;
};

/** 全曲移调的和弦解析选项：解析既有和弦、按名查找库内替代、生成新和弦 */
export interface TransposeChordOptions {
  chordResolver: (id: ChordId) => Chord | undefined;
  chordFinder?: (name: string, originalChord: Chord) => Chord | undefined;
  chordCreator?: (originalChord: Chord, targetName: string) => Chord;
}

/**
 * 全曲移调的 chordMap 重映射（纯函数，不改传入 Map）：
 * 1. 优先复用和弦库中同名且弦数/调弦相同的既有指法；
 * 2. 无匹配时调用创建器生成新和弦并登记。
 * @returns 新的 slot -> chordId 映射；相同 chordId 的槽位共用一次解析结果（缓存）。
 */
export const remapTransposedChordMap = (
  chordMap: Map<SlotKey, ChordId>,
  semitones: number,
  options: TransposeChordOptions
): Map<SlotKey, ChordId> => {
  const newChordMap = new Map<SlotKey, ChordId>();
  const chordIdCache = new Map<string, ChordId>();

  for (const [slotKey, chordId] of chordMap) {
    if (!chordId) continue;
    if (chordIdCache.has(chordId)) {
      newChordMap.set(slotKey, chordIdCache.get(chordId)!);
      continue;
    }

    const originalChord = options.chordResolver(chordId);
    if (!originalChord) {
      newChordMap.set(slotKey, chordId);
      continue;
    }

    const currentName = getChordName(originalChord);
    const targetName = transposeChordName(currentName, semitones);

    const existing = options.chordFinder?.(targetName, originalChord);
    if (existing) {
      chordIdCache.set(chordId, existing.id);
      newChordMap.set(slotKey, existing.id);
      continue;
    }

    if (options.chordCreator) {
      const created = options.chordCreator(originalChord, targetName);
      chordIdCache.set(chordId, created.id);
      newChordMap.set(slotKey, created.id);
    } else {
      newChordMap.set(slotKey, chordId);
    }
  }

  return newChordMap;
};
