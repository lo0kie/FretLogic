/**
 * 歌曲持久化层（纯逻辑，与 Pinia store 无关）：
 * 按歌曲拆分持久化的脏标记 + 防抖刷写（400ms / 最长 1500ms 强制落盘），
 * 以及首次加载时的分片索引读取与旧版单键（SONGS）自动迁移。
 */
import { sanitizeSongList } from '@/domains/score/model/songRepository';
import { STORAGE_KEYS } from '@/platform/utils/constants';

import type { createSongRepository } from '@/domains/score/model/songRepository';
import type { Song } from '@/domains/score/types';

const FLUSH_DELAY = 400;
const FLUSH_MAX_WAIT = 1500;

/** 持久化仓库接口（与 createSongRepository 的返回一致，便于测试注入） */
export type SongRepository = ReturnType<typeof createSongRepository>;

/** 从 JSON 文本解析歌曲 id 索引数组；解析失败或结构非法时返回 null。 */
const readJsonSongIds = (raw: string): string[] | null => {
  try {
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : null;
  } catch {
    return null;
  }
};

export interface SongPersistence {
  /** 标记歌曲为脏，纳入下次防抖刷写。 */
  markSongDirty: (id: string) => void;
  /** 标记歌曲为已删除：从脏集合移除并登记删除，刷写时直接移除存储键。 */
  markSongRemoved: (id: string) => void;
  /** 标记被删除的歌曲被恢复：从删除集合移除并重新标记脏。 */
  markSongRestored: (id: string) => void;
  /** 标记歌曲索引为脏，下次刷写时重建 id 索引。 */
  markIndexDirty: () => void;
  /** 立即刷写持久化：处理删除、脏歌曲、索引更新与旧数据清理，失败时记录日志。 */
  flushSongsNow: () => void;
}

export interface SongPersistenceHandles {
  persistence: SongPersistence;
  /** 初始化加载歌曲列表：优先按索引键分片读取（并清除旧版单键数据），缺失/损坏时回退迁移。 */
  loadInitialSongs: () => Song[];
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
  let migratedFromLegacy = false;

  const flushSongsNow = () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (maxWaitTimer) {
      clearTimeout(maxWaitTimer);
      maxWaitTimer = null;
    }
    try {
      removedSongIds.forEach(id => repository.removeSong(id));
      removedSongIds.clear();

      const byId = new Map<string, Song>(getSongs().map(s => [s.id, s]));
      dirtySongIds.forEach(id => {
        const song = byId.get(id);
        if (song) repository.saveSong(song);
        else repository.removeSong(id);
      });
      dirtySongIds.clear();

      if (indexDirty) {
        repository.saveSongIds(getSongs().map(s => s.id));
        indexDirty = false;
      }

      if (migratedFromLegacy) {
        repository.removeLegacySongs();
        migratedFromLegacy = false;
      }
    } catch (err) {
      console.error('[songStore] flush failed:', err);
    }
  };

  const scheduleFlush = () => {
    if (!maxWaitTimer) {
      maxWaitTimer = setTimeout(() => {
        maxWaitTimer = null;
        flushSongsNow();
      }, FLUSH_MAX_WAIT);
    }
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushSongsNow();
    }, FLUSH_DELAY);
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

  const loadInitialSongs = (): Song[] => {
    try {
      const indexRaw = localStorage.getItem(STORAGE_KEYS.SONGS_INDEX);
      if (indexRaw) {
        const ids = readJsonSongIds(indexRaw);
        if (ids) {
          repository.removeLegacySongs();
          return repository.loadSongs();
        }
      }
    } catch {
      /* 索引损坏，回退旧单键 */
    }
    const legacyRaw = localStorage.getItem(STORAGE_KEYS.SONGS);
    if (legacyRaw) {
      try {
        const legacy = JSON.parse(legacyRaw);
        if (Array.isArray(legacy)) {
          // 旧单键格式统一走清洗层（逐字段校验 + chordMap Map 化 + 时间戳补齐）
          const loaded = sanitizeSongList(legacy);
          if (loaded.length > 0) migratedFromLegacy = true;
          return loaded;
        }
      } catch {
        /* 旧数据损坏，视为空 */
      }
    }
    return [];
  };

  return { persistence, loadInitialSongs };
};
