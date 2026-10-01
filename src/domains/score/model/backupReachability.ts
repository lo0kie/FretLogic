/**
 * 备份可达性收集（纯函数）：导出乐谱时连带其引用的和弦，再连带这些和弦所属分组（D14/N1）。
 * chordMap 的三槽（char/start/end）内部形状知识归 score 域；groupId → 分组归属的解析
 * 由调用方经回调传入（分组清单归 chord 域，score 侧不得反向依赖 chord 运行时）。
 */

import type { Song } from '@/domains/score/types';

/** 可达性判定所需的最小和弦形状（结构化子集，任何带 id / groupId 的对象均可代入） */
export interface ReachableChordRef {
  id: string;
  groupId: string;
}

export interface BackupReachability<T extends ReachableChordRef> {
  /** 既有集合 + 乐谱引用补齐后的和弦清单（保持既有在前、补进在后） */
  chords: T[];
  /** 上述和弦所属、且经回调确认真实存在的分组 id */
  groupIds: ReadonlySet<string>;
}

/**
 * 从乐谱集合收集导出时必须连带的和弦与分组：
 * 1. 遍历每首歌 chordMap 的 char/start/end 三槽收集被引用的和弦 id；
 * 2. 从候选池（如全库和弦）中补进「被引用但不在既有集合」的和弦；
 * 3. 对最终和弦清单的 groupId 反查分组归属——归属判定经 `resolveGroupIds` 回调交给调用方。
 * 不做任何清洗或剪枝：悬空引用的兜底由导入端/校验层负责，这里只负责「可达就带上」。
 */
export const collectBackupReachability = <T extends ReachableChordRef>(
  songs: readonly Song[],
  baseChords: readonly T[],
  chordPool: readonly T[],
  /** groupId 集合 → 其中真实存在的分组 id 集合（分组清单归调用方，score 侧不感知） */
  resolveGroupIds: (groupIds: ReadonlySet<string>) => ReadonlySet<string>
): BackupReachability<T> => {
  const referencedIds = new Set<string>();
  for (const song of songs)
    for (const slots of song.chordMap.values())
      for (const id of [...slots.char.values(), ...slots.start, ...slots.end]) if (id) referencedIds.add(id);

  const existingIds = new Set(baseChords.map(c => c.id));
  const referenced = chordPool.filter(c => referencedIds.has(c.id) && !existingIds.has(c.id));
  const chords = [...baseChords, ...referenced];

  const neededGroupIds = new Set(chords.map(c => c.groupId));
  return { chords, groupIds: resolveGroupIds(neededGroupIds) };
};
