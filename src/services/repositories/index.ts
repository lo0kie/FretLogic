import type { Chord, Group, Song } from '@/types';
import { sanitizePersistedData } from '@/services/validation/persistedData';
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

const readJson = (storage: Storage, key: string): unknown => {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
};

const writeJson = (storage: Storage, key: string, value: unknown): void => {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      const quotaError: Error & { cause?: unknown } = new Error('PERSISTENCE_QUOTA_EXCEEDED');
      quotaError.cause = error;
      throw quotaError;
    }
    throw error;
  }
};

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

export function createSongRepository(storage: Storage): SongRepository {
  const songKey = (id: string) => `${SONG_ENTRY_PREFIX}${id}`;

  const loadIds = (): string[] => {
    const ids = readJson(storage, STORAGE_KEYS.SONGS_INDEX);
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
  };

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
