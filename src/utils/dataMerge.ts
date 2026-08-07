import type { Chord, Group, Song } from '@/types';
import { cloneDeep } from '@/utils/cloneDeep';

export interface MergeableData {
  groups: Group[];
  chords: Chord[];
  songs: Song[];
}

/** 用户在导入界面手动勾选的子集；不传则视为"全量合并" */
export interface UnionMergeSelection {
  groupIds: Set<string>;
  chordIds: Set<string>;
  songIds: Set<string>;
}

export interface UnionMergeResult {
  groups: Group[];
  chords: Chord[];
  songs: Song[];
  /** 合并后应该保持选中的分组 id（如果原选中分组在合并结果里消失，会退回第一个分组） */
  selectedGroupId: string | null;
}

/**
 * 纯函数：把 incoming 中本地没有的数据（按 id 去重，和弦额外按 fingerprint 去重）
 * 合并进 local，返回合并后的完整数据集。不修改任何入参，也不产生任何副作用
 * （不读写 store、不写 DOM、不弹 toast）——这些交给调用方处理。
 *
 * 同时被 useGithubSyncService.applyUnionSetMerge（云端拉取，全量合并）
 * 和 useImportExportService.applySelectedImport（本地导入，按用户勾选合并）复用。
 */
export const unionMergePayloads = (
  local: MergeableData,
  incoming: MergeableData,
  currentSelectedGroupId: string | null,
  selection?: UnionMergeSelection
): UnionMergeResult => {
  const incomingGroups = selection ? incoming.groups.filter(g => selection.groupIds.has(g.id)) : incoming.groups;
  const incomingChords = selection ? incoming.chords.filter(c => selection.chordIds.has(c.id)) : incoming.chords;
  const incomingSongs = selection ? incoming.songs.filter(s => selection.songIds.has(s.id)) : incoming.songs;

  // 1. 分组按 id 去重合并
  const localGroupIds = new Set(local.groups.map(g => g.id));
  const mergedGroups = [...local.groups];
  incomingGroups.forEach(g => {
    if (!localGroupIds.has(g.id)) {
      mergedGroups.push(cloneDeep(g));
      localGroupIds.add(g.id);
    }
  });

  // 2. 和弦按 id 或 fingerprint 任一命中即视为已存在，跳过
  const localChordIds = new Set(local.chords.map(c => c.id));
  const localChordFps = new Set(local.chords.map(c => c.fingerprint).filter(Boolean));
  const mergedChords = [...local.chords];
  incomingChords.forEach(c => {
    const isExistById = localChordIds.has(c.id);
    const isExistByFp = c.fingerprint ? localChordFps.has(c.fingerprint) : false;
    if (!isExistById && !isExistByFp) {
      const importedChord = cloneDeep(c);
      mergedChords.push(importedChord);
      localChordIds.add(importedChord.id);
      if (importedChord.fingerprint) localChordFps.add(importedChord.fingerprint);
    }
  });

  // 3. 歌曲按 id 去重合并
  const localSongIds = new Set(local.songs.map(s => s.id));
  const mergedSongs = [...local.songs];
  incomingSongs.forEach(s => {
    if (!localSongIds.has(s.id)) {
      mergedSongs.push(cloneDeep(s));
      localSongIds.add(s.id);
    }
  });

  // 4. 选中分组若在合并结果里消失，退回第一个分组
  let finalSelectedId = currentSelectedGroupId;
  if (!mergedGroups.some(g => g.id === finalSelectedId)) {
    finalSelectedId = mergedGroups[0]?.id ?? null;
  }

  // 5. 按最终选中分组重新计算每个分组的折叠状态
  mergedGroups.forEach(g => {
    g.collapsed = g.id !== finalSelectedId;
  });

  return { groups: mergedGroups, chords: mergedChords, songs: mergedSongs, selectedGroupId: finalSelectedId };
};
