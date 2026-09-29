/**
 * 歌曲元信息的纯操作层（与 store 无关）：
 * - touchSong：统一的「版本递增 + 更新时间刷新」（调用方随后自行标脏）
 * - applySongMeta：把可选元信息载荷按字段 diff 应用到歌曲实体，仅写入实际变化的字段
 */
import { dequal } from 'dequal';

import type { Song } from '@/domains/score/types';

/** 变更收尾：递增 version、刷新 updatedAt（持久化标脏由调用方负责）。 */
export const touchSong = (song: Song) => {
  song.version = (song.version ?? 1) + 1;
  song.updatedAt = Date.now();
};

/** 可更新的元信息字段集合 */
export type SongMetaPayload = Partial<
  Pick<
    Song,
    'title' | 'singer' | 'originalKey' | 'timeSignature' | 'playKey' | 'capo' | 'lyrics' | 'lineIds' | 'chordMap'
  >
>;

/**
 * 把可选元信息载荷按字段 diff 应用到歌曲实体（原地修改）。
 * @returns 是否发生了实际变化（供调用方决定是否 touch + 标脏）。
 */
export const applySongMeta = (target: Song, payload: SongMetaPayload): boolean => {
  let hasChanged = false;
  if (payload.title !== undefined && target.title !== payload.title) {
    target.title = payload.title;
    hasChanged = true;
  }
  if (payload.singer !== undefined && target.singer !== payload.singer) {
    target.singer = payload.singer;
    hasChanged = true;
  }
  if (payload.originalKey !== undefined && target.originalKey !== payload.originalKey) {
    target.originalKey = payload.originalKey;
    hasChanged = true;
  }
  if (payload.timeSignature !== undefined && target.timeSignature !== payload.timeSignature) {
    target.timeSignature = payload.timeSignature;
    hasChanged = true;
  }
  if (payload.playKey !== undefined && target.playKey !== payload.playKey) {
    target.playKey = payload.playKey;
    hasChanged = true;
  }
  if (payload.capo !== undefined && target.capo !== payload.capo) {
    target.capo = payload.capo;
    hasChanged = true;
  }
  if (payload.lyrics !== undefined && target.lyrics !== payload.lyrics) {
    target.lyrics = payload.lyrics;
    hasChanged = true;
  }
  // 行序是数组，逐项比较（原先自带 lineIdsEqual，与 useScoreHistory 里那份逐字相同 —— 两处
  // 手写判等收敛到 dequal 一处，避免同一个语义在仓里有两份实现各自漂移）
  if (payload.lineIds !== undefined && !dequal(target.lineIds, payload.lineIds)) {
    target.lineIds = payload.lineIds;
    hasChanged = true;
  }
  if (payload.chordMap !== undefined && target.chordMap !== payload.chordMap) {
    target.chordMap = payload.chordMap;
    hasChanged = true;
  }
  return hasChanged;
};
