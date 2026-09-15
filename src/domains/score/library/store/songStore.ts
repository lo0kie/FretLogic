/**
 * 歌曲 store：歌曲列表的加载、增删改与分片持久化（localStorage 按歌曲单键存储）。
 * 提供和弦引用反查倒排索引；旧版单键（SONGS）数据在首次加载时自动迁移后清除。
 * 纯逻辑拆分见同目录：songPersistence（防抖刷写/迁移）、songChordOps（批量绑定/移调重映射）、
 * songIndex（引用倒排索引）、songMeta（元信息 diff）。
 */
import { computed, ref } from 'vue';

import { useEventListener } from '@vueuse/core';
import { defineStore } from 'pinia';

import { createSongRepository } from '@/app/services';
import { transposeChordName } from '@/domains/chord/theory/theory';
import { toCapo } from '@/domains/fretboard/model/coordinates';
import { bindNewChordToSlot, removeChordFromSlot, swapOrMoveSlotChords } from '@/domains/score/model/chordSlots';
import { createSong as createSongEntity } from '@/domains/score/model/scoreModel';
import { STORAGE_KEYS } from '@/platform/utils/constants';
import { compareByPinyin } from '@/platform/utils/pinyin';

import {
  remapChordBindingsInSongs,
  remapTransposedChordMap,
  restoreChordBindingsToSongs,
  unbindChordIdsFromSongs,
} from './songChordOps';
import { buildChordReferenceIndex, collectChordReferences } from './songIndex';
import { applySongMeta, touchSong } from './songMeta';
import { createSongPersistence } from './songPersistence';

import type { ChordId } from '@/domains/chord/types';
import type { SlotKey, Song } from '@/domains/score/types';

/** 乐谱排序方式：manual 手动（拖拽顺序）/ title 按标题 / createdAt 按创建时间 */
export type SongSortMethod = 'manual' | 'title' | 'createdAt';

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

  const { persistence, loadInitialSongs } = createSongPersistence(songRepository, () => songs.value);
  const { markSongDirty, markSongRemoved, markSongRestored, markIndexDirty, flushSongsNow } = persistence;

  songs.value = loadInitialSongs();

  /**
   * 响应式全局和弦引用倒排索引：chordId -> { song, count }[]，
   * 歌曲增删或绑定变更时自动更新并缓存，反查 O(1)。
   */
  const chordReferencesIndex = computed(() => buildChordReferenceIndex(songs.value));

  /** 快速反查一组和弦 ID 关联的歌曲引用列表（去重合并同歌曲内多指法的引用次数） */
  const getChordReferences = (chordIds: Iterable<string>) =>
    collectChordReferences(chordReferencesIndex.value, chordIds);

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
      // 拼音分组：由内置 Intl.Collator 统一驱动排序与分组键，二者天然一致，无需异步加载
      return [...songs.value].sort((a, b) => compareByPinyin(a.title, b.title));
    }
    if (songSortMethod.value === 'createdAt') {
      return [...songs.value].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    }
    return songs.value;
  });

  // ---- 乐谱过滤（会话内状态，不持久化）：按歌手 / 拍号筛选列表展示，'' 表示不过滤 ----
  const singerFilter = ref('');
  const timeSignatureFilter = ref('');
  const setSongFilters = (singer: string, timeSignature: string) => {
    singerFilter.value = singer;
    timeSignatureFilter.value = timeSignature;
  };
  const hasSongFilter = computed(() => singerFilter.value !== '' || timeSignatureFilter.value !== '');
  const filteredSongs = computed<Song[]>(() =>
    sortedSongs.value.filter(
      song =>
        (singerFilter.value === '' || song.singer === singerFilter.value) &&
        (timeSignatureFilter.value === '' || song.timeSignature === timeSignatureFilter.value)
    )
  );
  /** 可选筛选项：现有乐谱中实际出现的歌手 / 拍号（去重升序），菜单子项数据源 */
  const availableSingerFilters = computed(() =>
    [...new Set(songs.value.map(s => s.singer).filter((s): s is string => Boolean(s)))].sort((a, b) =>
      a.localeCompare(b, 'zh-Hans-CN')
    )
  );
  const availableTimeSignatureFilters = computed(() =>
    [...new Set(songs.value.map(s => s.timeSignature).filter(Boolean))].sort()
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

  // ---- CRUD ----

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
    lastDeletedSongInfo.value = { song: { ...songs.value[index]! }, index };
    songs.value = songs.value.filter(s => s.id !== id);
    markSongRemoved(id);
    markIndexDirty();
  };

  /** 恢复指定歌曲到列表指定位置（或末尾）并重标记脏落盘。 */
  const restoreSong = (song: Song, index?: number) => {
    if (songs.value.some(s => s.id === song.id)) return;
    const targetIndex = index !== undefined ? Math.min(Math.max(0, index), songs.value.length) : songs.value.length;
    songs.value.splice(targetIndex, 0, song);
    markSongRestored(song.id);
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
  const updateSongMeta = (id: string, payload: Parameters<typeof applySongMeta>[1]) => {
    const target = songMap.value.get(id);
    if (!target) return;
    if (applySongMeta(target, payload)) {
      touchSong(target);
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
    touchSong(target);
    markSongDirty(songId);
  };

  /** 移除歌词字符槽位上的和弦绑定；槽位本为空时跳过。 */
  const removeCharChord = (songId: string, slotKey: SlotKey) => {
    const target = songMap.value.get(songId);
    if (!target) return;
    const removed = removeChordFromSlot(target.chordMap, slotKey);
    if (!removed) return;
    target.chordMap = new Map(target.chordMap);
    touchSong(target);
    markSongDirty(songId);
  };

  /** 交换或移动两个歌词槽位的和弦绑定（拖拽重排槽位用）。 */
  const swapSongSlotChords = (songId: string, sourceKey: SlotKey, targetKey: SlotKey) => {
    const target = songMap.value.get(songId);
    if (!target) return;
    swapOrMoveSlotChords(target.chordMap, sourceKey, targetKey);
    target.chordMap = new Map(target.chordMap);
    touchSong(target);
    markSongDirty(songId);
  };

  /**
   * 全曲移调：移调演奏调（playKey）；若提供和弦解析选项，则对全曲 chordMap
   * 进行换算映射（优先复用和弦库既有指法，无匹配时自动生成新和弦）。
   */
  const transposeSong = (
    songId: string,
    semitones: number,
    options?: Parameters<typeof remapTransposedChordMap>[2]
  ) => {
    if (semitones === 0) return;
    const target = songMap.value.get(songId);
    if (!target) return;

    target.playKey = transposeChordName(target.playKey || 'C', semitones);

    if (options && target.chordMap.size > 0) {
      target.chordMap = remapTransposedChordMap(target.chordMap, semitones, options);
    }

    touchSong(target);
    markSongDirty(songId);
  };

  /** 全曲变调夹品位调整（Capo 增减，自动收敛至 [0, 12]） */
  const transposeSongCapo = (songId: string, deltaCapo: number) => {
    if (deltaCapo === 0) return;
    const target = songMap.value.get(songId);
    if (!target) return;

    const newCapo = toCapo(target.capo + deltaCapo);
    if (newCapo === target.capo) return;

    target.capo = newCapo;
    touchSong(target);
    markSongDirty(songId);
  };

  /** 用新列表全量覆盖歌曲集合：清理孤立存储键、标记全部为脏并立即落盘。 */
  const overwriteSongs = (newSongs: Song[]) => {
    const newIds = new Set<string>(newSongs.map(s => s.id));

    // 清理存储中不属于新集合的孤立歌曲键（全量覆盖是罕见操作，扫描一遍可接受）
    const orphanIds = new Set(songRepository.listSongIds().filter(id => !newIds.has(id)));
    orphanIds.forEach(id => songRepository.removeSong(id));

    songs.value.forEach(s => {
      if (!newIds.has(s.id)) markSongRemoved(s.id);
    });
    songs.value = [...newSongs];
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

  /** 从全部歌曲中解除对指定和弦 id 集合的槽位绑定（供删除和弦后联动调用）。 */
  const unbindChordIds = (targetIds: Set<string>) => unbindChordIdsFromSongs(songs.value, targetIds, markSongDirty);

  /** 撤销删除和弦/分组时，把此前被解绑的槽位绑定恢复回去 */
  const restoreChordBindings = (bindings: Parameters<typeof restoreChordBindingsToSongs>[1]) =>
    restoreChordBindingsToSongs(id => songMap.value.get(id), bindings, markSongDirty);

  /** 和弦合并重定向：把「被丢弃重复项」上的槽位改绑到「保留项」。@returns 重定向的槽位数量 */
  const remapChordBindings = (mapping: Map<string, string>) =>
    remapChordBindingsInSongs(songs.value, mapping, markSongDirty);

  return {
    songs,
    songSortMethod,
    sortedSongs,
    setSongSortMethod,
    singerFilter,
    timeSignatureFilter,
    setSongFilters,
    hasSongFilter,
    filteredSongs,
    availableSingerFilters,
    availableTimeSignatureFilters,
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
