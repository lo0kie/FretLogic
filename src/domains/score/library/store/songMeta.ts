/**
 * 歌曲元信息的纯操作层（与 store 无关）：
 * - touchSong：统一的「版本递增 + 更新时间刷新」（调用方随后自行标脏）
 * - applySongMeta：把可选元信息载荷按字段 diff 应用到歌曲实体，仅写入实际变化的字段
 */
import type { Song } from '@/domains/score/types';

/** 比较两组行 id 序列是否逐项相同，避免引用相等时的无谓更新。 */
export const lineIdsEqual = (a: string[], b: string[]) => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
};

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
  if (payload.lineIds !== undefined && !lineIdsEqual(target.lineIds, payload.lineIds)) {
    target.lineIds = payload.lineIds;
    hasChanged = true;
  }
  if (payload.chordMap !== undefined && target.chordMap !== payload.chordMap) {
    target.chordMap = payload.chordMap;
    hasChanged = true;
  }
  return hasChanged;
};
