/**
 * 歌曲 store：歌曲列表的加载、增删改与分片持久化（localStorage 按歌曲单键存储）。
 * 提供和弦引用反查倒排索引；旧版单键（SONGS）数据在首次加载时自动迁移后清除。
 */
import { computed, ref, watch } from 'vue';

import { useEventListener } from '@vueuse/core';
import { defineStore } from 'pinia';

import { getChordName, transposeChordName } from '@/domains/chord/theory/theory';
import { toCapo } from '@/domains/fretboard/model/coordinates';
import { bindNewChordToSlot, removeChordFromSlot, swapOrMoveSlotChords } from '@/domains/score/model/chordSlots';
import { createSong as createSongEntity } from '@/domains/score/model/scoreModel';
import { createSongRepository, sanitizeSongList } from '@/domains/score/model/songRepository';
import { STORAGE_KEYS } from '@/platform/utils/constants';
import { compareByPinyin, pinyinReady, preloadPinyin } from '@/platform/utils/pinyin';

import type { Chord, ChordId } from '@/domains/chord/types';
import type { SlotKey, Song } from '@/domains/score/types';

const FLUSH_DELAY = 400;
const FLUSH_MAX_WAIT = 1500;

/** 乐谱排序方式：manual 手动（拖拽顺序）/ title 按标题 / createdAt 按创建时间 */
export type SongSortMethod = 'manual' | 'title' | 'createdAt';

/** 比较两组行 id 序列是否逐项相同，避免引用相等时的无谓更新。 */
const lineIdsEqual = (a: string[], b: string[]) => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
};

/** 从 JSON 文本解析歌曲 id 索引数组；解析失败或结构非法时返回 null。 */
const readJsonSongIds = (raw: string): string[] | null => {
  try {
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : null;
  } catch {
    return null;
  }
};

/** 读取持久化的乐谱排序方式；存储不可用或值非法时回退为手动排序。 */
const readSongSortMethod = (): SongSortMethod => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SONGS_SORT_METHOD);
    return raw === 'title' || raw === 'createdAt' ? raw : 'manual';
  } catch {
    return 'manual';
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

  /**
   * 初始化加载歌曲列表：优先按索引键分片读取（并清除旧版单键数据），
   * 索引缺失/损坏时回退读取旧版 SONGS 单键并走清洗层迁移。
   */
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

  songs.value = loadInitialSongs();

  // ---- 乐谱排序方式（持久化；manual 为拖拽顺序，其余为展示排序，非 manual 时禁用拖拽重排） ----
  const songSortMethod = ref<SongSortMethod>(readSongSortMethod());
  /** 设置乐谱排序方式并持久化到 localStorage；存储不可用时仅保持内存态。 */
  const setSongSortMethod = (method: SongSortMethod) => {
    songSortMethod.value = method;
    try {
      localStorage.setItem(STORAGE_KEYS.SONGS_SORT_METHOD, method);
    } catch {
      /* 存储不可用时仅保持内存态 */
    }
  };
  const sortedSongs = computed<Song[]>(() => {
    if (songSortMethod.value === 'title') {
      // 拼音分组：pinyin-pro 动态导入未就绪时先用浏览器拼音排序（zh-Hans-CN）兜底；
      // 就绪后 pinyinReady 翻转触发本 computed 重算为精确拼音排序（与分组标题键一致）
      if (!pinyinReady.value) {
        return [...songs.value].sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'));
      }
      return [...songs.value].sort((a, b) => compareByPinyin(a.title, b.title));
    }
    if (songSortMethod.value === 'createdAt') {
      return [...songs.value].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    }
    return songs.value;
  });
  // 首次进入拼音分组时动态加载 pinyin-pro（独立 chunk，按需请求）；已处于该模式则立即预加载
  watch(
    () => songSortMethod.value === 'title',
    active => {
      if (active) void preloadPinyin();
    },
    { immediate: true }
  );

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

  /** 立即刷写持久化：处理删除、脏歌曲、索引更新与旧数据清理，失败时记录日志。 */
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

  /** 安排一次防抖刷写（400ms，最长等待 1500ms 强制落盘），合并短时间内的多次变更。 */
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

  /** 标记歌曲为脏，纳入下次防抖刷写。 */
  const markSongDirty = (id: string) => {
    dirtySongIds.add(id);
    scheduleFlush();
  };

  /** 标记歌曲索引为脏，下次刷写时重建 id 索引。 */
  const markIndexDirty = () => {
    indexDirty = true;
    scheduleFlush();
  };

  /** 新建歌曲并加入列表尾部，返回创建的实体；标记脏并调度持久化。 */
  const createSong = (title: string): Song => {
    const newSong = createSongEntity(title);
    songs.value.push(newSong);
    markSongDirty(newSong.id);
    markIndexDirty();
    return newSong;
  };

  /** 删除歌曲：先记录原位置与内容以支持撤销，再移除并标记存储删除。 */
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

  /**
   * 恢复指定歌曲到列表指定位置（或末尾）并重标记脏落盘。
   */
  const restoreSong = (song: Song, index?: number) => {
    if (songs.value.some(s => s.id === song.id)) return;
    const targetIndex = index !== undefined ? Math.min(Math.max(0, index), songs.value.length) : songs.value.length;
    songs.value.splice(targetIndex, 0, song);
    removedSongIds.delete(song.id);
    markSongDirty(song.id);
    markIndexDirty();
    if (lastDeletedSongInfo.value?.song.id === song.id) {
      lastDeletedSongInfo.value = null;
    }
  };

  /**
   * 撤销最近一次删除歌曲，恢复到原位置（或末尾）并重标记脏落盘。
   * @returns 恢复成功的歌曲对象，无历史记录时返回 null。
   */
  const undoDeleteSong = (): Song | null => {
    if (!lastDeletedSongInfo.value) return null;
    const { song, index } = lastDeletedSongInfo.value;
    lastDeletedSongInfo.value = null;

    if (songs.value.some(s => s.id === song.id)) return null;

    restoreSong(song, index);
    return song;
  };

  /**
   * 批量更新歌曲元信息（标题/调式/变调夹/歌词/行序/和弦映射）。
   * 仅写入有实际变化的字段，变更后递增 version、刷新 updatedAt 并调度持久化。
   */
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
  };

  /** 为歌词字符槽位绑定和弦；值未变化时跳过，绑定后刷新版本与更新时间。 */
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

  /** 移除歌词字符槽位上的和弦绑定；槽位本为空时跳过。 */
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

  /** 交换或移动两个歌词槽位的和弦绑定（拖拽重排槽位用）。 */
  const swapSongSlotChords = (songId: string, sourceKey: SlotKey, targetKey: SlotKey) => {
    const target = songMap.value.get(songId);
    if (!target) return;
    swapOrMoveSlotChords(target.chordMap, sourceKey, targetKey);
    target.chordMap = new Map(target.chordMap);
    target.version = (target.version ?? 1) + 1;
    target.updatedAt = Date.now();
    markSongDirty(songId);
  };

  /**
   * 全曲移调：
   * 1. 移调演奏调（playKey）
   * 2. 若提供和弦解析与创建器，则对全曲 chordMap 进行换算映射（优先复用和弦库既有指法，无匹配时自动生成新和弦）
   */
  const transposeSong = (
    songId: string,
    semitones: number,
    options?: {
      chordResolver: (id: ChordId) => Chord | undefined;
      chordFinder?: (name: string, originalChord: Chord) => Chord | undefined;
      chordCreator?: (originalChord: Chord, targetName: string) => Chord;
    }
  ) => {
    if (semitones === 0) return;
    const target = songMap.value.get(songId);
    if (!target) return;

    const newPlayKey = transposeChordName(target.playKey || 'C', semitones);
    target.playKey = newPlayKey;

    if (options && target.chordMap.size > 0) {
      const newChordMap = new Map<SlotKey, ChordId>();
      const chordIdCache = new Map<string, ChordId>();

      for (const [slotKey, chordId] of target.chordMap) {
        if (!chordId) continue;
        if (chordIdCache.has(chordId)) {
          newChordMap.set(slotKey, chordIdCache.get(chordId)!);
          continue;
        }

        const originalChord = options.chordResolver(chordId);
        if (!originalChord) {
          newChordMap.set(slotKey, chordId);
          continue;
        }

        const currentName = getChordName(originalChord);
        const targetName = transposeChordName(currentName, semitones);

        // 1. 优先从库中查找同名且弦数/调弦相同的和弦
        const existing = options.chordFinder?.(targetName, originalChord);
        if (existing) {
          chordIdCache.set(chordId, existing.id);
          newChordMap.set(slotKey, existing.id);
          continue;
        }

        // 2. 库中无对应和弦时，调用创建器生成新和弦并登记
        if (options.chordCreator) {
          const created = options.chordCreator(originalChord, targetName);
          chordIdCache.set(chordId, created.id);
          newChordMap.set(slotKey, created.id);
        } else {
          newChordMap.set(slotKey, chordId);
        }
      }

      target.chordMap = newChordMap;
    }

    target.version = (target.version ?? 1) + 1;
    target.updatedAt = Date.now();
    markSongDirty(songId);
  };

  /**
   * 全曲变调夹品位调整（Capo 增减，自动收敛至 [0, 12]）
   */
  const transposeSongCapo = (songId: string, deltaCapo: number) => {
    if (deltaCapo === 0) return;
    const target = songMap.value.get(songId);
    if (!target) return;

    const newCapo = toCapo(target.capo + deltaCapo);
    if (newCapo === target.capo) return;

    target.capo = newCapo;
    target.version = (target.version ?? 1) + 1;
    target.updatedAt = Date.now();
    markSongDirty(songId);
  };

  /** 用新列表全量覆盖歌曲集合：清理孤立存储键、标记全部为脏并立即落盘。 */
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

  /**
   * 仅调整顺序（拖拽排序专用）：不会删除任何歌曲或存储键。
   * 守卫：新顺序与现有集合不一致（缺项/多项/含未知 id）时直接拒绝，避免误删。
   */
  const reorderSongs = (orderedSongs: Song[]) => {
    const currentIds = new Set<string>(songs.value.map(s => s.id));
    const seen = new Set<string>();
    const next: Song[] = [];

    for (const song of orderedSongs) {
      if (!currentIds.has(song.id) || seen.has(song.id)) continue;
      seen.add(song.id);
      next.push(song);
    }

    if (next.length !== songs.value.length) return;

    songs.value = next;
    next.forEach(s => markSongDirty(s.id));
    markIndexDirty();
    flushSongsNow();
  };

  interface RemovedChordBinding {
    songId: string;
    slotKey: SlotKey;
    chordId: ChordId;
  }

  /**
   * 从全部歌曲中解除对指定和弦 id 集合的槽位绑定（供删除和弦后联动调用）。
   * @returns 被解除的绑定列表，可传给 restoreChordBindings 做撤销恢复。
   */
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

  /**
   * 和弦合并重定向：把全部歌曲中绑定在「被丢弃重复项」上的槽位改绑到「保留项」。
   * 与 unbindChordIds（删除后解绑）不同，合并不丢失引用，仅做 id 重映射。
   * @returns 发生重定向的槽位数量（用于提示）。
   */
  const remapChordBindings = (mapping: Map<string, string>): number => {
    if (mapping.size === 0) return 0;
    let remappedCount = 0;
    songs.value.forEach(song => {
      let hasChanged = false;
      for (const [key, boundChordId] of song.chordMap) {
        const newChordId = mapping.get(boundChordId) as ChordId | undefined;
        if (newChordId !== undefined && newChordId !== boundChordId) {
          song.chordMap.set(key, newChordId);
          hasChanged = true;
          remappedCount++;
        }
      }
      if (hasChanged) {
        song.chordMap = new Map(song.chordMap);
        song.version = (song.version ?? 1) + 1;
        song.updatedAt = Date.now();
        markSongDirty(song.id);
      }
    });
    return remappedCount;
  };

  return {
    songs,
    songSortMethod,
    sortedSongs,
    setSongSortMethod,
    chordReferencesIndex,
    getChordReferences,
    createSong,
    deleteSong,
    restoreSong,
    undoDeleteSong,
    updateSongMeta,
    setCharChord,
    removeCharChord,
    swapSongSlotChords,
    overwriteSongs,
    reorderSongs,
    unbindChordIds,
    restoreChordBindings,
    remapChordBindings,
    transposeSong,
    transposeSongCapo,
    flushSongsNow,
  };
});
