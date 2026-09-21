/**
 * 歌曲和弦槽位绑定的批量纯操作层（与 store 无关）：
 * 删除和弦后的批量解绑 / 撤销恢复 / 合并重定向，以及全曲移调时的 chordMap 重映射。
 * 所有函数只做数据变换，持久化标脏通过 touch 回调注入。
 */
import { getChordName, transposeChordName } from '@/domains/chord/theory/theory';
import { getEdgeChords, remapChordRefs, setEdgeChords } from '@/domains/score/model/chordSlots';
import { charKey, chordSlotKey, lineCharChord, parseSlotKey, setLineCharChord } from '@/domains/score/model/scoreModel';

import { touchSong } from './songMeta';

import type { Chord, ChordId } from '@/domains/chord/types';
import type { ChordLineSlots, LineId, SlotKey, Song } from '@/domains/score/types';

/** 标脏回调：由 store 提供（内部走防抖持久化） */
export type MarkDirty = (songId: string) => void;

export interface RemovedChordBinding {
  songId: string;
  slotKey: SlotKey;
  chordId: ChordId;
}

/** 深拷贝嵌套 chordMap（换引用时保证与旧 map 完全隔离） */
const cloneChordMap = (chordMap: Map<LineId, ChordLineSlots>): Map<LineId, ChordLineSlots> => {
  const copy = new Map<LineId, ChordLineSlots>();
  for (const [lineId, slots] of chordMap)
    copy.set(lineId, { char: new Map(slots.char), start: [...slots.start], end: [...slots.end] });

  return copy;
};

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
    const newMap = new Map<LineId, ChordLineSlots>();
    for (const [lineId, slots] of song.chordMap) {
      const char = new Map<number, ChordId>();
      for (const [index, boundChordId] of slots.char)
        if (boundChordId && targetIds.has(boundChordId)) {
          removedBindings.push({ songId: song.id, slotKey: charKey(lineId, index), chordId: boundChordId });
          hasChanged = true;
        } else char.set(index, boundChordId);

      const start: ChordId[] = [];
      slots.start.forEach((boundChordId, index) => {
        if (boundChordId && targetIds.has(boundChordId)) {
          removedBindings.push({
            songId: song.id,
            slotKey: chordSlotKey(lineId, 'start', index),
            chordId: boundChordId,
          });
          hasChanged = true;
        } else start.push(boundChordId);
      });
      const end: ChordId[] = [];
      slots.end.forEach((boundChordId, index) => {
        if (boundChordId && targetIds.has(boundChordId)) {
          removedBindings.push({ songId: song.id, slotKey: chordSlotKey(lineId, 'end', index), chordId: boundChordId });
          hasChanged = true;
        } else end.push(boundChordId);
      });
      if (char.size > 0 || start.length > 0 || end.length > 0) newMap.set(lineId, { char, start, end });
    }
    if (hasChanged) {
      song.chordMap = newMap;
      touchSong(song);
      markDirty(song.id);
    }
  });
  return removedBindings;
};

/**
 * 撤销删除和弦/分组时，把此前被解绑的槽位绑定恢复回去。
 *
 * 与 unbind / remap 两条路径对齐：写入后统一换成新 Map。song 的 chordMap 是全库范围内
 * 「引用级失效」的约定（引用计数分片、消费方 memo 都依赖每次变更得到新 Map），只改内容不换
 * 引用会让下游看不见变更；同时把同一首歌的多条绑定合并为一次 touch + markDirty。
 */
export const restoreChordBindingsToSongs = (
  findSong: (id: string) => Song | undefined,
  bindings: RemovedChordBinding[],
  markDirty: MarkDirty
) => {
  if (bindings.length === 0) return;
  const changedSongs = new Map<string, Song>();
  bindings.forEach(({ songId, slotKey, chordId }) => {
    const target = findSong(songId);
    if (!target) return;
    // N5：撤销回填不能按删除当时的 slotKey 原样写回——期间歌词可能已改/行可能已删。
    // 先解析并校验：键不可解析、lineId 已不在 song.lineIds 中的直接丢弃（写回去就是
    // 永不回收、随备份扩散的僵尸键）；仍存在的行按下标钳制重映射。
    const parsed = parseSlotKey(slotKey);
    if (!parsed) return;
    const lineIdx = target.lineIds.findIndex(id => id === parsed.lineId);
    if (lineIdx === -1) return;

    if (parsed.type === 'char') {
      // 行长可能已缩短：下标钳到行尾，避免挂到不存在的字符位（GC 只在 updateLyrics 里跑）
      const lineText = (target.lyrics ?? '').split('\n')[lineIdx] ?? '';
      const maxIdx = Math.max(0, lineText.length - 1);
      const resolvedIndex = Math.min(parsed.index, maxIdx);
      // 目标槽位已被占用（如撤销前又绑了别的和弦）时跳过，不覆盖用户后续的编辑
      if (lineCharChord(target.chordMap, parsed.lineId, resolvedIndex) !== null) return;
      setLineCharChord(target.chordMap, parsed.lineId, resolvedIndex, chordId);
      changedSongs.set(songId, target);
      return;
    }
    // 边槽列表可能已缩短：钳到「追加到末位」；若目标位已被占用则跳过（下方统一判定）
    const list = getEdgeChords(target.chordMap, parsed.lineId, parsed.type);
    const idx = Math.min(parsed.index, list.length);
    if (idx < list.length) list[idx] = chordId;
    else list.push(chordId);

    setEdgeChords(target.chordMap, parsed.lineId, parsed.type, list);
    changedSongs.set(songId, target);
  });
  changedSongs.forEach((target, songId) => {
    target.chordMap = cloneChordMap(target.chordMap);
    touchSong(target);
    markDirty(songId);
  });
};

/**
 * 和弦合并重定向：把全部歌曲中绑定在「被丢弃重复项」上的槽位改绑到「保留项」。
 * 与解绑不同，合并不丢失引用，仅做 id 重映射。
 * 纯重映射逻辑下沉在 chordSlots.remapChordRefs（与导入校验共用同一实现，口径不漂移），
 * 这里只负责 store 侧的变异（写回 / touch / 标脏）。
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
    const { map, remappedCount: count } = remapChordRefs(song.chordMap, mapping);
    if (count > 0) {
      song.chordMap = map as Map<LineId, ChordLineSlots>;
      touchSong(song);
      markDirty(song.id);
      remappedCount += count;
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
 * @returns 新的 lineId -> 嵌套槽位映射；相同 chordId 的槽位共用一次解析结果（缓存）。
 */
export const remapTransposedChordMap = (
  chordMap: Map<LineId, ChordLineSlots>,
  semitones: number,
  options: TransposeChordOptions
): Map<LineId, ChordLineSlots> => {
  const newChordMap = new Map<LineId, ChordLineSlots>();
  const chordIdCache = new Map<string, ChordId>();
  const resolveChordId = (chordId: ChordId): ChordId => {
    if (chordIdCache.has(chordId)) return chordIdCache.get(chordId)!;

    const originalChord = options.chordResolver(chordId);
    if (!originalChord) return chordId;

    const currentName = getChordName(originalChord);
    const targetName = transposeChordName(currentName, semitones);

    const existing = options.chordFinder?.(targetName, originalChord);
    if (existing) {
      chordIdCache.set(chordId, existing.id);
      return existing.id;
    }

    if (options.chordCreator) {
      const created = options.chordCreator(originalChord, targetName);
      chordIdCache.set(chordId, created.id);
      return created.id;
    }
    return chordId;
  };

  for (const [lineId, slots] of chordMap) {
    const char = new Map<number, ChordId>();
    for (const [index, chordId] of slots.char) {
      if (!chordId) continue;
      char.set(index, resolveChordId(chordId));
    }
    newChordMap.set(lineId, {
      char,
      start: slots.start.map(resolveChordId),
      end: slots.end.map(resolveChordId),
    });
  }

  return newChordMap;
};
