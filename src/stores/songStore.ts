/**
 * 歌曲 store：歌曲列表的加载、增删改与分片持久化（localStorage 按歌曲单键存储）。
 * 提供和弦引用反查倒排索引；旧版单键（SONGS）数据在首次加载时自动迁移后清除。
 */
import { createSongRepository } from '@/services/repositories';
import { sanitizePersistedData } from '@/services/validation/persistedData';
import type { ChordId, SlotKey, Song } from '@/types';
import { STORAGE_KEYS } from '@/utils/core/constants';
import { bindNewChordToSlot, removeChordFromSlot, swapOrMoveSlotChords } from '@/utils/music/chord-fretboard';
import { createSong as createSongEntity } from '@/utils/music/entityFactories';
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
  const songMap = computed(() => new Map<string, Song>(songs.value.map(s => [s.id, s])));
  const lastDeletedSongInfo = ref<{ song: Song; index: number } | null>(null);

  /**
   * 响应式全局和弦引用倒排索引（Inverted Index）：
   * 建立 chordId -> { song: Song, count: number }[] 的映射
   * 在歌曲发生增删或绑定变更时自动由 computed 更新并缓存，反查复杂度为 O(1)。
   */
  const chordReferencesIndex = computed<Map<string, { song: Song; count: number }[]>>(() => {
    const index = new Map<string, { song: Song; count: number }[]>();
    for (const song of songs.value) {
      const countMap = new Map<string, number>();
      for (const chordId of song.chordMap.values()) {
        if (!chordId) continue;
        countMap.set(chordId, (countMap.get(chordId) ?? 0) + 1);
      }
      for (const [chordId, count] of countMap.entries()) {
        let list = index.get(chordId);
        if (!list) {
          list = [];
          index.set(chordId, list);
        }
        list.push({ song, count });
      }
    }
    return index;
  });

  /**
   * 快速反查一组和弦 ID 关联的歌曲引用列表（去重合并同歌曲内多指法的引用次数）
   */
  const getChordReferences = (chordIds: Iterable<string>): { song: Song; count: number }[] => {
    const songCountMap = new Map<string, { song: Song; count: number }>();
    const idx = chordReferencesIndex.value;
    for (const chordId of chordIds) {
      const refs = idx.get(chordId);
      if (!refs) continue;
      for (const { song, count } of refs) {
        const existing = songCountMap.get(song.id);
        if (existing) {
          existing.count += count;
        } else {
          songCountMap.set(song.id, { song, count });
        }
      }
    }
    return Array.from(songCountMap.values());
  };

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
          // 旧单键格式统一走清洗层（逐字段校验 + chordMap Map 化 + 时间戳补齐）
          const loaded = sanitizePersistedData({ songs: legacy }).songs;
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

  // 与 chordStore 的 useStorage 行为对齐：监听外部对 localStorage 的变更（DevTools 清空 / 其他标签页写入）。
  // 本页自身写 localStorage 不会触发 storage 事件（规范），因此不会自我循环；
  // 外部整体 clear 时 e.key 为 null，命中后重载为空 → 乐谱与和弦库一样能对外部清空即时响应，无需刷新。
  useEventListener(window, 'storage', (event: StorageEvent) => {
    const key = event.key;
    const songEntryPrefix = `${STORAGE_KEYS.SONG_ENTRY}:`;
    const isSongKey =
      key === null || key === STORAGE_KEYS.SONGS_INDEX || (typeof key === 'string' && key.startsWith(songEntryPrefix));
    if (!isSongKey) return;
    songs.value = songRepository.loadSongs();
  });

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

      const byId = new Map<string, Song>(songs.value.map(s => [s.id, s]));
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

  const createSong = (title: string): Song => {
    const newSong = createSongEntity(title);
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
      target.updatedAt = Date.now();
      markSongDirty(id);
    }
    // [PROBE] 临时写入探针：记录每次更新目标与歌词字段，用于定位跨歌串写
    if (typeof window !== 'undefined') {
      ((window as unknown as { __w?: unknown[] }).__w ??= []).push({
        t: Date.now(),
        id,
        isLyricsEdit: payload.lyrics !== undefined,
        lyrics: payload.lyrics ?? target.lyrics,
        lineIds: payload.lineIds ?? target.lineIds,
      });
    }
  };

  const setCharChord = (songId: string, slotKey: SlotKey, chordId: ChordId) => {
    const target = songMap.value.get(songId);
    if (!target) return;
    if (target.chordMap.get(slotKey) === chordId) return;
    bindNewChordToSlot(target.chordMap, slotKey, chordId);
    target.chordMap = new Map(target.chordMap);
    target.version = (target.version ?? 1) + 1;
    target.updatedAt = Date.now();
    markSongDirty(songId);
  };

  const removeCharChord = (songId: string, slotKey: SlotKey) => {
    const target = songMap.value.get(songId);
    if (!target) return;
    const removed = removeChordFromSlot(target.chordMap, slotKey);
    if (!removed) return;
    target.chordMap = new Map(target.chordMap);
    target.version = (target.version ?? 1) + 1;
    target.updatedAt = Date.now();
    markSongDirty(songId);
  };

  const swapSongSlotChords = (songId: string, sourceKey: SlotKey, targetKey: SlotKey) => {
    const target = songMap.value.get(songId);
    if (!target) return;
    swapOrMoveSlotChords(target.chordMap, sourceKey, targetKey);
    target.chordMap = new Map(target.chordMap);
    target.version = (target.version ?? 1) + 1;
    target.updatedAt = Date.now();
    markSongDirty(songId);
  };

  const overwriteSongs = (newSongs: Song[]) => {
    const newIds = new Set<string>(newSongs.map(s => s.id));

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
    slotKey: SlotKey;
    chordId: ChordId;
  }

  const unbindChordIds = (targetIds: Set<string>): RemovedChordBinding[] => {
    const removedBindings: RemovedChordBinding[] = [];
    songs.value.forEach(song => {
      let hasChanged = false;
      for (const [key, boundChordId] of song.chordMap) {
        if (boundChordId && targetIds.has(boundChordId)) {
          removedBindings.push({
            songId: song.id,
            slotKey: key,
            chordId: boundChordId,
          });
          song.chordMap.delete(key);
          hasChanged = true;
        }
      }
      if (hasChanged) {
        song.chordMap = new Map(song.chordMap);
        song.version = (song.version ?? 1) + 1;
        song.updatedAt = Date.now();
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
      if (target.chordMap.get(slotKey) === undefined) {
        target.chordMap.set(slotKey, chordId);
        target.version = (target.version ?? 1) + 1;
        target.updatedAt = Date.now();
        markSongDirty(songId);
      }
    });
  };

  return {
    songs,
    chordReferencesIndex,
    getChordReferences,
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
