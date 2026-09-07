import { fillMissingTimestamps } from '@/domains/chord/model/chordRepository';
import { isCapoValue } from '@/domains/fretboard/model/coordinates';
import { pruneOrphanChordRefs } from '@/domains/score/model/chordSlots';
import { toSongId } from '@/domains/score/model/scoreModel';
import { serializeForStorage } from '@/platform/utils/common';
import { STORAGE_KEYS } from '@/platform/utils/constants';
import { readJson } from '@/platform/utils/storage';

import type { ChordId } from '@/domains/chord/types';
import type { LineId, SlotKey, Song } from '@/domains/score/types';

type RawRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is RawRecord => !!value && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isValidTimestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const sanitizeChordMap = (chordMap: unknown): Map<SlotKey, ChordId> => {
  const collect = (entries: Iterable<[unknown, unknown]>): Map<SlotKey, ChordId> => {
    const out = new Map<SlotKey, ChordId>();
    for (const [key, chordId] of entries) {
      if (isNonEmptyString(key) && isNonEmptyString(chordId)) out.set(key as SlotKey, chordId as ChordId);
    }
    return out;
  };

  if (chordMap instanceof Map) return collect(chordMap);
  if (!isRecord(chordMap)) return new Map();
  return collect(Object.entries(chordMap));
};

export type SongDraft = Omit<Song, 'createdAt' | 'updatedAt'> & Partial<Pick<Song, 'createdAt' | 'updatedAt'>>;

export const sanitizeSongEntity = (raw: unknown): SongDraft | null => {
  if (!isRecord(raw)) return null;
  if (typeof raw['id'] !== 'string' || !raw['id']) return null;
  if (typeof raw['title'] !== 'string') return null;

  const legacyKey = typeof raw['key'] === 'string' && raw['key'] ? raw['key'] : 'C';
  const song: SongDraft = {
    id: toSongId(raw['id']),
    title: raw['title'],
    lyrics: typeof raw['lyrics'] === 'string' ? raw['lyrics'] : '',
    lineIds: Array.isArray(raw['lineIds']) ? (raw['lineIds'].filter(isNonEmptyString) as LineId[]) : [],
    playKey: typeof raw['playKey'] === 'string' && raw['playKey'] ? raw['playKey'] : legacyKey,
    capo: isCapoValue(raw['capo']) ? raw['capo'] : 0,
    chordMap: sanitizeChordMap(raw['chordMap']),
    version: typeof raw['version'] === 'number' && Number.isFinite(raw['version']) ? raw['version'] : 1,
    ...(isValidTimestamp(raw['createdAt']) ? { createdAt: raw['createdAt'] } : {}),
    ...(isValidTimestamp(raw['updatedAt']) ? { updatedAt: raw['updatedAt'] } : {}),
  };
  return song;
};

export const sanitizeSongs = (songs: unknown): SongDraft[] => {
  if (!Array.isArray(songs)) return [];

  const validSongIds = new Set<string>();
  const out: SongDraft[] = [];
  for (const rawSong of songs) {
    const song = sanitizeSongEntity(rawSong);
    if (!song || validSongIds.has(song.id)) continue;
    validSongIds.add(song.id);
    out.push(song);
  }
  return out;
};

export const sanitizeSongList = (songs: unknown[], validChordIds?: Set<string>): Song[] => {
  const drafts = sanitizeSongs(songs);
  const now = Date.now();
  if (!validChordIds) {
    return fillMissingTimestamps(drafts, now);
  }
  return fillMissingTimestamps(
    drafts.map(song => {
      const { map } = pruneOrphanChordRefs(song.chordMap, validChordIds, { preserveUnknown: true });
      return { ...song, chordMap: map };
    }),
    now
  );
};

export interface SongRepository {
  loadSongs(): Song[];
  saveSong(song: Song): void;
  removeSong(id: string): void;
  saveSongIds(ids: string[]): void;
  listSongIds(): string[];
  removeLegacySongs(): void;
}

const SONG_ENTRY_PREFIX = `${STORAGE_KEYS.SONG_ENTRY}:`;

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
        return sanitizeSongList([song]);
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
