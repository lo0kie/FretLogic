import { sanitizePersistedData } from '@/services/validation/persistedData';
import type { Chord, Group, Song } from '@/types';
import { serializeForStorage } from '@/utils/core/common';
import { STORAGE_KEYS } from '@/utils/core/constants';

export interface ChordLibrarySnapshot {
  groups: Group[];
  chords: Chord[];
}

export interface ChordRepository {
  load(): ChordLibrarySnapshot;
  save(snapshot: ChordLibrarySnapshot): void;
}

export interface SongRepository {
  loadSongs(): Song[];
  saveSong(song: Song): void;
  removeSong(id: string): void;
  saveSongIds(ids: string[]): void;
  listSongIds(): string[];
  removeLegacySongs(): void;
}

const SONG_ENTRY_PREFIX = `${STORAGE_KEYS.SONG_ENTRY}:`;

/** 从指定存储读取并解析 JSON；键不存在或解析失败时返回 undefined。 */
const readJson = (storage: Storage, key: string): unknown => {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
};

/** 序列化并写入指定存储；超出配额时抛出带 cause 的 PERSISTENCE_QUOTA_EXCEEDED 错误。 */
const writeJson = (storage: Storage, key: string, value: unknown): void => {
  try {
    storage.setItem(key, serializeForStorage(value));
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      const quotaError: Error & { cause?: unknown } = new Error('PERSISTENCE_QUOTA_EXCEEDED');
      quotaError.cause = error;
      throw quotaError;
    }
    throw error;
  }
};

/** 创建和弦库仓储：整库快照（分组 + 和弦）存取，读取时经 sanitizePersistedData 清洗。 */
export function createChordRepository(storage: Storage): ChordRepository {
  return {
    load() {
      const { groups, chords } = sanitizePersistedData({
        groups: readJson(storage, STORAGE_KEYS.GROUPS),
        chords: readJson(storage, STORAGE_KEYS.CHORD_LIST),
      });
      return { groups, chords };
    },
    save(snapshot) {
      writeJson(storage, STORAGE_KEYS.GROUPS, snapshot.groups);
      writeJson(storage, STORAGE_KEYS.CHORD_LIST, snapshot.chords);
    },
  };
}

/** 创建歌曲仓储：每首歌单独一个存储键（SONG_ENTRY 前缀 + id），索引键集中维护 id 列表。 */
export function createSongRepository(storage: Storage): SongRepository {
  /** 拼出某首歌的存储键。 */
  const songKey = (id: string) => `${SONG_ENTRY_PREFIX}${id}`;

  /** 读取索引中登记的歌曲 id 列表；索引缺失或损坏时返回空数组。 */
  const loadIds = (): string[] => {
    const ids = readJson(storage, STORAGE_KEYS.SONGS_INDEX);
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
  };

  /** 扫描存储中实际存在的歌曲键，返回不含前缀的歌曲 id 列表（索引损坏时的真相源）。 */
  const listStoredSongIds = (): string[] => {
    const storedIds: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key?.startsWith(SONG_ENTRY_PREFIX)) continue;
      storedIds.push(key.slice(SONG_ENTRY_PREFIX.length));
    }
    return storedIds;
  };

  return {
    loadSongs() {
      return loadIds().flatMap(id => {
        const song = readJson(storage, songKey(id));
        return sanitizePersistedData({ songs: [song] }).songs;
      });
    },
    saveSong(song) {
      writeJson(storage, songKey(song.id), song);
      const ids = loadIds();
      if (!ids.includes(song.id)) this.saveSongIds([...ids, song.id]);
    },
    removeSong(id) {
      storage.removeItem(songKey(id));
      const ids = loadIds();
      if (ids.includes(id)) this.saveSongIds(ids.filter(songId => songId !== id));
    },
    saveSongIds(ids) {
      writeJson(storage, STORAGE_KEYS.SONGS_INDEX, ids);
    },
    listSongIds() {
      return listStoredSongIds();
    },
    removeLegacySongs() {
      storage.removeItem(STORAGE_KEYS.SONGS);
    },
  };
}
