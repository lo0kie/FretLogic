/**
 * 歌曲 store：歌曲列表的加载、增删改与分片持久化（localStorage 按歌曲单键存储）。
 * 提供和弦引用反查倒排索引；旧版单键（SONGS）数据在首次加载时自动迁移后清除。
 * 纯逻辑拆分见同目录：songPersistence（防抖刷写/迁移）、songChordOps（批量绑定/移调重映射）、
 * songIndex（引用倒排索引）、songMeta（元信息 diff）。
 */
import { computed, ref, watch } from 'vue';

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
import { buildSongRefCounts, collectChordReferences, mergeSongRefCounts } from './songIndex';
import { applySongMeta, touchSong } from './songMeta';
import { createSongPersistence } from './songPersistence';

import type { ChordReferenceIndex } from './songIndex';
import type { ChordId } from '@/domains/chord/types';
import type { SlotKey, Song } from '@/domains/score/types';

/** 乐谱排序方式：manual 手动（拖拽顺序）/ title 按标题 / createdAt 按创建时间 */
export type SongSortMethod = 'manual' | 'title' | 'createdAt';

/** 歌手筛选项的排序比较器（模块级单例）：localeCompare 每次调用都要重新解析 locale 与选项 */
const SINGER_COLLATOR = new Intl.Collator('zh-Hans-CN');

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
   * 响应式全局和弦引用倒排索引：chordId -> { song, count }[]，反查 O(1)。
   *
   * 不能直接对 songs.value 做一次全量构建：那种 computed 在构建时要遍历每首歌的 chordMap，
   * 依赖就挂到了**全库每首歌**上——而绑定/解绑一个槽位只会替换那一首的 chordMap 引用，却会让
   * 整个索引全量重建（extreme 档 80 首 × 每首数百个绑定 = 数万次 Map 迭代，实测 5~17ms）。
   * 而它的消费方不是「用户主动查看引用情况」——每张和弦卡的 menuItems computed 都要读它来决定
   * 「引用反查」菜单项是否置灰，属常驻依赖，于是「连续绑定和弦」每次绑定都要付一次全库重建。
   *
   * 改为「每首歌一个独立 computed 分片 + 上层按 id 合并」：分片的依赖只挂在本首歌的 chordMap 上，
   * 单首变更只让那一首的分片重算，其余分片命中缓存；上层合并遍历的是各分片已按 chordId 去重的
   * 计数表，不再逐槽位重扫全库。
   */
  const makeSongRefCountShard = (id: string) =>
    computed(() => {
      // 经 songMap 取当前对象：同 id 的歌曲被替换时也能读到最新，不会持有旧引用
      const song = songMap.value.get(id);
      return song ? buildSongRefCounts(song.chordMap) : new Map<string, number>();
    });

  const songRefCountShards = new Map<string, ReturnType<typeof makeSongRefCountShard>>();

  /** 取（或惰性创建）某首歌的引用计数分片 */
  const getSongRefCountShard = (id: string): ReturnType<typeof makeSongRefCountShard> => {
    let shard = songRefCountShards.get(id);
    if (!shard) {
      shard = makeSongRefCountShard(id);
      songRefCountShards.set(id, shard);
    }
    return shard;
  };

  const chordReferencesIndex = computed<ChordReferenceIndex>(() => {
    const index: ChordReferenceIndex = new Map();
    for (const song of songs.value) {
      mergeSongRefCounts(index, song, getSongRefCountShard(song.id).value);
    }
    return index;
  });

  // 歌曲删除后修剪其分片：分片表若只增不减，会随「删歌 → 新建」长期积累失效的 computed
  watch(
    () => songs.value.map(s => s.id),
    ids => {
      // 显式声明为 Set<string>：ids 是品牌类型 SongId[]，而分片表的键是普通 string
      // （分片本身不关心 id 来源），不标注则 Set 被推断成 Set<SongId>，has(string) 过不了类型检查
      const live = new Set<string>(ids);
      for (const id of [...songRefCountShards.keys()]) {
        if (!live.has(id)) songRefCountShards.delete(id);
      }
    },
    { flush: 'post' }
  );

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
      SINGER_COLLATOR.compare(a, b)
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
    const currentById = songMap.value;
    const seen = new Set<string>();
    const next: Song[] = [];

    for (const song of orderedSongs) {
      if (!currentIds.has(song.id) || seen.has(song.id)) continue;
      seen.add(song.id);
      next.push(song);
    }

    if (next.length !== songs.value.length) return;

    // 顺序信息完全由索引键承载（loadInitialSongs 按 saveSongIds 的顺序逐首读回），歌曲内容一无所变，
    // 因此正常路径只需 markIndexDirty。此前对每首歌都 markSongDirty 会把全库每首歌的**内容**重新
    // 序列化写进各自的键——N 次全歌序列化，且 repository.saveSong 内部每首都还要 parse 一次索引键
    // 并做 O(N) 的 includes 查找（整体 O(N²)），拖拽一次即全库重写，与「按歌曲拆分持久化」的初衷相反。
    // 守卫：调用契约是「传入 songs 里的同一批对象、仅顺序不同」（useSortableList 按引用比较后回传）。
    // 若调用方传入了新对象（可能夹带内容变更），退回逐首标脏，避免静默丢改动。
    const carriesNewObjects = next.some(song => currentById.get(song.id) !== song);
    songs.value = next;
    if (carriesNewObjects) next.forEach(s => markSongDirty(s.id));
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
