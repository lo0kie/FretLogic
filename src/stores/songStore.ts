import { STORAGE_KEYS } from '@/utils/constants';
import type { Song } from '@/types';
import { bindNewChordToSlot, removeChordFromSlot, swapOrMoveSlotChords } from '@/utils/chord-fretboard';
import { generateUUID } from '@/utils/common';
import { createSongRepository } from '@/services/repositories';
import { useEventListener } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

const FLUSH_DELAY = 400;
const FLUSH_MAX_WAIT = 1500;

const lineIdsEqual = (a: string[], b: string[]) => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
};

const readJsonSongIds = (raw: string): string[] | null => {
  try {
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : null;
  } catch {
    return null;
  }
};

export const useSongStore = defineStore('song', () => {
  const songRepository = createSongRepository(localStorage);
  // 按歌曲拆分持久化：编辑一首歌只序列化那一首，避免每次改动全量 JSON.stringify 所有歌曲。
  // 旧版单键（SONGS）数据在首次加载时自动迁移，迁移成功后清除。
  const songs = ref<Song[]>([]);
  const songMap = computed(() => new Map(songs.value.map(s => [s.id, s])));
  const lastDeletedSongInfo = ref<{ song: Song; index: number } | null>(null);

  let migratedFromLegacy = false;

  const loadInitialSongs = (): Song[] => {
    try {
      const indexRaw = localStorage.getItem(STORAGE_KEYS.SONGS_INDEX);
      if (indexRaw) {
        const ids = readJsonSongIds(indexRaw);
        if (ids) {
          songRepository.removeLegacySongs();
          return songRepository.loadSongs();
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
          const loaded = legacy.filter(s => s && typeof s === 'object' && typeof s.id === 'string') as Song[];
          if (loaded.length > 0) migratedFromLegacy = true;
          return loaded;
        }
      } catch {
        /* 旧数据损坏，视为空 */
      }
    }
    return [];
  };

  songs.value = loadInitialSongs();

  // ---- 持久化层：脏标记 + 防抖刷写（400ms / 最长 1500ms） ----
  const dirtySongIds = new Set<string>();
  const removedSongIds = new Set<string>();
  let indexDirty = false;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;

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
      removedSongIds.forEach(id => songRepository.removeSong(id));
      removedSongIds.clear();

      const byId = new Map(songs.value.map(s => [s.id, s]));
      dirtySongIds.forEach(id => {
        const song = byId.get(id);
        if (song) songRepository.saveSong(song);
        else songRepository.removeSong(id);
      });
      dirtySongIds.clear();

      if (indexDirty) {
        songRepository.saveSongIds(songs.value.map(s => s.id));
        indexDirty = false;
      }

      if (migratedFromLegacy) {
        songRepository.removeLegacySongs();
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

  const markSongDirty = (id: string) => {
    dirtySongIds.add(id);
    scheduleFlush();
  };

  const markIndexDirty = () => {
    indexDirty = true;
    scheduleFlush();
  };

  {
    // 旧数据迁移：key 已改为由 playKey + capo 实时派生，不再持久化。
    // 若旧数据带 key 且 playKey 缺失，则用 key 兜底 playKey（key === playKey + capo 的逆向近似），
    // 随后丢弃 key 字段，避免存储冗余。
    let hasAnyUpdate = false;
    songs.value.forEach(s => {
      const legacy = s as unknown as { key?: unknown };
      let songUpdated = false;
      if (legacy.key !== undefined) {
        if (typeof s.playKey !== 'string' || !s.playKey) {
          s.playKey = typeof legacy.key === 'string' && legacy.key ? legacy.key : 'C';
        }
        delete legacy.key;
        songUpdated = true;
      }
      if (typeof s.playKey !== 'string' || !s.playKey) {
        s.playKey = 'C';
        songUpdated = true;
      }
      if (typeof s.version !== 'number') {
        s.version = 1;
        songUpdated = true;
      }
      if (songUpdated) {
        hasAnyUpdate = true;
        markSongDirty(s.id);
      }
    });
    if (hasAnyUpdate) markIndexDirty();
  }

  const createSong = (title: string): Song => {
    const newSong: Song = {
      id: 's_' + generateUUID().slice(0, 8),
      title: title.trim() || '未命名乐谱',
      lyrics: '',
      playKey: 'C',
      capo: 0,
      chordMap: {},
      lineIds: [],
      version: 1,
    };
    songs.value.push(newSong);
    markSongDirty(newSong.id);
    markIndexDirty();
    return newSong;
  };

  const deleteSong = (id: string) => {
    const index = songs.value.findIndex(s => s.id === id);
    if (index === -1) return;
    lastDeletedSongInfo.value = {
      song: { ...songs.value[index]! },
      index,
    };
    songs.value = songs.value.filter(s => s.id !== id);
    dirtySongIds.delete(id);
    removedSongIds.add(id);
    markIndexDirty();
  };

  const undoDeleteSong = () => {
    if (!lastDeletedSongInfo.value) return;
    const { song, index } = lastDeletedSongInfo.value;
    if (index >= 0 && index <= songs.value.length) {
      songs.value.splice(index, 0, song);
    } else {
      songs.value.push(song);
    }
    removedSongIds.delete(song.id);
    markSongDirty(song.id);
    markIndexDirty();
    lastDeletedSongInfo.value = null;
  };

  const updateSongMeta = (
    id: string,
    payload: Partial<Pick<Song, 'title' | 'playKey' | 'capo' | 'lyrics' | 'lineIds' | 'chordMap'>>
  ) => {
    const target = songMap.value.get(id);
    if (!target) return;

    let hasChanged = false;
    if (payload.title !== undefined && target.title !== payload.title) {
      target.title = payload.title;
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

    if (hasChanged) {
      target.version = (target.version ?? 1) + 1;
      markSongDirty(id);
    }
  };

  const setCharChord = (songId: string, slotKey: string, chordId: string) => {
    const target = songMap.value.get(songId);
    if (!target) return;
    target.chordMap ??= {};
    if (target.chordMap[slotKey] === chordId) return;
    bindNewChordToSlot(target.chordMap, slotKey, chordId);
    target.chordMap = { ...target.chordMap };
    target.version = (target.version ?? 1) + 1;
    markSongDirty(songId);
  };

  const removeCharChord = (songId: string, slotKey: string) => {
    const target = songMap.value.get(songId);
    if (!target || !target.chordMap) return;
    const removed = removeChordFromSlot(target.chordMap, slotKey);
    if (!removed) return;
    target.chordMap = { ...target.chordMap };
    target.version = (target.version ?? 1) + 1;
    markSongDirty(songId);
  };

  const swapSongSlotChords = (songId: string, sourceKey: string, targetKey: string) => {
    const target = songMap.value.get(songId);
    if (!target || !target.chordMap) return;
    swapOrMoveSlotChords(target.chordMap, sourceKey, targetKey);
    target.chordMap = { ...target.chordMap };
    target.version = (target.version ?? 1) + 1;
    markSongDirty(songId);
  };

  const overwriteSongs = (newSongs: Song[]) => {
    const newIds = new Set(newSongs.map(s => s.id));

    // 清理存储中不属于新集合的孤立歌曲键（全量覆盖是罕见操作，扫描一遍可接受）
    const orphanIds = new Set(songRepository.listSongIds().filter(id => !newIds.has(id)));
    orphanIds.forEach(id => songRepository.removeSong(id));

    songs.value.forEach(s => {
      if (!newIds.has(s.id)) removedSongIds.add(s.id);
    });
    songs.value = [...newSongs];
    dirtySongIds.clear();
    newSongs.forEach(s => markSongDirty(s.id));
    markIndexDirty();
    // 全量覆盖后立即落盘，不等防抖
    flushSongsNow();
  };

  interface RemovedChordBinding {
    songId: string;
    slotKey: string;
    chordId: string;
  }

  const unbindChordIds = (targetIds: Set<string>): RemovedChordBinding[] => {
    const removedBindings: RemovedChordBinding[] = [];
    songs.value.forEach(song => {
      if (!song.chordMap) return;
      let hasChanged = false;
      Object.keys(song.chordMap).forEach(key => {
        const boundChordId = song.chordMap[key];
        if (boundChordId && targetIds.has(boundChordId)) {
          removedBindings.push({
            songId: song.id,
            slotKey: key,
            chordId: boundChordId,
          });
          delete song.chordMap[key];
          hasChanged = true;
        }
      });
      if (hasChanged) {
        song.chordMap = { ...song.chordMap };
        song.version = (song.version ?? 1) + 1;
        markSongDirty(song.id);
      }
    });
    return removedBindings;
  };

  /** 撤销删除和弦/分组时，把此前被解绑的槽位绑定恢复回去 */
  const restoreChordBindings = (bindings: RemovedChordBinding[]) => {
    if (bindings.length === 0) return;
    bindings.forEach(({ songId, slotKey, chordId }) => {
      const target = songMap.value.get(songId);
      if (!target) return;
      target.chordMap ??= {};
      if (target.chordMap[slotKey] === undefined) {
        target.chordMap[slotKey] = chordId;
        target.version = (target.version ?? 1) + 1;
        markSongDirty(songId);
      }
    });
  };

  useEventListener(window, 'beforeunload', flushSongsNow);
  useEventListener(document, 'visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSongsNow();
  });

  return {
    songs,
    createSong,
    deleteSong,
    undoDeleteSong,
    updateSongMeta,
    setCharChord,
    removeCharChord,
    swapSongSlotChords,
    overwriteSongs,
    unbindChordIds,
    restoreChordBindings,
    flushSongsNow,
  };
});
