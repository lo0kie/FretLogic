/**
 * 歌曲持久化层（纯逻辑，与 Pinia store 无关）：
 * 按歌曲拆分持久化的脏标记 + 防抖刷写（窗口与强制落盘节奏统一取 PERSIST_DEBOUNCE_MS /
 * PERSIST_MAX_WAIT_MS），以及启动时的异步加载（IDB songs 库 + 顺序索引）。
 */
import { reportPersistFailure } from '@/platform/services/storage';
import { PERSIST_DEBOUNCE_MS, PERSIST_MAX_WAIT_MS } from '@/platform/utils/constants';

import type { SongRepository } from '@/domains/score/model/songRepository';
import type { Song } from '@/domains/score/types';

/** 持久化失败上报键：歌曲按记录分片写入，统一归到同一语义单元去重 */
const PERSIST_FAILURE_KEY = 'songs';

export interface SongPersistence {
  /** 标记歌曲为脏，纳入下次防抖刷写。 */
  markSongDirty: (id: string) => void;
  /** 标记歌曲为已删除：从脏集合移除并登记删除，刷写时直接移除存储记录。 */
  markSongRemoved: (id: string) => void;
  /** 标记被删除的歌曲被恢复：从删除集合移除并重新标记脏。 */
  markSongRestored: (id: string) => void;
  /** 标记歌曲索引为脏，下次刷写时重建 id 索引。 */
  markIndexDirty: () => void;
  /**
   * 立即刷写持久化：删除、脏歌曲与顺序索引在同一事务内原子落库。
   * 返回刷写 Promise（内部吞错上报），供 pagehide 兜底 await/并行。
   */
  flushSongsNow: () => Promise<void>;
}

export interface SongPersistenceHandles {
  persistence: SongPersistence;
  /** 启动加载歌曲列表（IDB；失败时上报并返回空列表，不阻断启动） */
  loadInitialSongs: () => Promise<Song[]>;
}

/**
 * 创建歌曲持久化句柄。
 * @param repository 分片持久化仓库
 * @param getSongs   取当前完整歌曲列表（刷写索引与脏歌曲时使用）
 */
export const createSongPersistence = (repository: SongRepository, getSongs: () => Song[]): SongPersistenceHandles => {
  const dirtySongIds = new Set<string>();
  const removedSongIds = new Set<string>();
  let indexDirty = false;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;

  const flushSongsNow = async (): Promise<void> => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (maxWaitTimer) {
      clearTimeout(maxWaitTimer);
      maxWaitTimer = null;
    }
    const byId = new Map<string, Song>(getSongs().map(s => [s.id, s]));
    const removed = [...removedSongIds];
    const dirtySongs: Song[] = [];
    const dirtyRemovals: string[] = [];
    for (const id of dirtySongIds) {
      const song = byId.get(id);
      if (song) dirtySongs.push(song);
      else dirtyRemovals.push(id);
    }
    removedSongIds.clear();
    dirtySongIds.clear();

    const orderIds = indexDirty ? getSongs().map(s => s.id) : undefined;
    indexDirty = false;

    if (removed.length === 0 && dirtySongs.length === 0 && dirtyRemovals.length === 0 && !orderIds) return;

    try {
      await repository.flushChanges({
        removedIds: [...removed, ...dirtyRemovals],
        dirtySongs,
        orderIds,
      });
    } catch (error) {
      // 落盘失败：本批 delta 已从脏集合摘除，必须重新登记回去等下次刷写重试，
      // 否则这批删除/脏歌曲/索引会随集合清空而永久丢失
      for (const id of removed) {
        dirtySongIds.delete(id);
        removedSongIds.add(id);
      }
      for (const song of dirtySongs) dirtySongIds.add(song.id);
      for (const id of dirtyRemovals) dirtySongIds.add(id);
      if (orderIds) indexDirty = true;
      // 与 chordStore 对齐：上报到平台层统一提示（日志由上报点输出，不再就地 console）
      reportPersistFailure(PERSIST_FAILURE_KEY, error);
    }
  };

  const scheduleFlush = () => {
    if (!maxWaitTimer)
      maxWaitTimer = setTimeout(() => {
        maxWaitTimer = null;
        void flushSongsNow();
      }, PERSIST_MAX_WAIT_MS);

    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flushSongsNow();
    }, PERSIST_DEBOUNCE_MS);
  };

  const persistence: SongPersistence = {
    markSongDirty: id => {
      dirtySongIds.add(id);
      scheduleFlush();
    },
    markSongRemoved: id => {
      dirtySongIds.delete(id);
      removedSongIds.add(id);
    },
    markSongRestored: id => {
      removedSongIds.delete(id);
      dirtySongIds.add(id);
      scheduleFlush();
    },
    markIndexDirty: () => {
      indexDirty = true;
      scheduleFlush();
    },
    flushSongsNow,
  };

  const loadInitialSongs = async (): Promise<Song[]> => {
    try {
      return await repository.loadSongs();
    } catch (error) {
      reportPersistFailure(PERSIST_FAILURE_KEY, error);
      return [];
    }
  };

  return { persistence, loadInitialSongs };
};
