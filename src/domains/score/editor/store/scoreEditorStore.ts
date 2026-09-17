/**
 * 乐谱编辑器 store：当前编辑歌曲的歌词 / 和弦槽位 / 谱面状态管理，
 * 含撤销-重做历史栈（见 useScoreHistory）、调性变换（transpose/capo）与编辑态持久化。
 */
import { computed, ref, watch } from 'vue';

import { debounceFilter, useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';

import { useChordStore } from '@/domains/chord/store/chordStore';
import { toChordId } from '@/domains/chord/theory/entityFactories';
import { getChordName, transposeChordEntity } from '@/domains/chord/theory/theory';
import { useSongStore } from '@/domains/score/library/store/songStore';
import { garbageCollectChordMap } from '@/domains/score/model/chordSlots';
import { matchLineIds, sanitizeLyricsText } from '@/domains/score/model/scoreModel';
import { generateUUID } from '@/platform/utils/common';
import { STORAGE_KEYS } from '@/platform/utils/constants';

import { useScoreHistory } from './useScoreHistory';

import type { Chord } from '@/domains/chord/types';
import type { SlotKey, Song } from '@/domains/score/types';

/** 百分制缩放值序列化器：读取时迁移旧版倍率（0.6~1.5）为百分制（60~150），写回按百分制原样存储 */
const percentScaleSerializer = {
  read: (raw: string): number => {
    const v = Number(raw);
    // 旧版倍率上限 1.5，新版百分制下限 60，值 < 2 必为旧版倍率
    return v < 2 ? v * 100 : v;
  },
  write: (v: number): string => String(v),
};

/** 乐谱页主 Tab：编辑歌词 / 排列和弦 / 预览（URL tab 参数的合法值域） */
export type ScoreActiveTab = 'edit' | 'interactive' | 'preview';

export const useScoreEditorStore = defineStore('scoreEditor', () => {
  const songStore = useSongStore();
  const chordStore = useChordStore();
  // 选中乐谱仅内存态：URL `?id=` 是唯一数据源（可分享 / 可后退），localStorage 只维护一个
  // 「最近编辑乐谱」指针供裸访问入口冷启动回灌，不再双写完整选中态。
  const activeSongId = ref<string | null>(null);
  // 当前标签页仅内存态：URL `?tab=` 全权接管（刷新由 URL 恢复，裸访问回落到 edit 默认）
  const activeTabRef = ref<ScoreActiveTab>('edit');
  // 缩放以百分制存储（100 = 100%），序列化处迁移旧版倍率（0.6~1.5）为百分制。
  // 分两个维度各存一份：**预览 / 导出** 与 **排列和弦（编辑视图）** 互不干扰 —— 编辑时要大字号看谱、
  // 出图时要另一套排版比例，共用一份就会「调好编辑区，导出的图跟着变」。
  // 预览维度沿用旧键，老用户的既有设置继续生效。
  const previewFontScale = useStorage(STORAGE_KEYS.SCORE_FONT_SCALE, 100, localStorage, {
    eventFilter: debounceFilter(400, { maxWait: 1500 }),
    serializer: percentScaleSerializer,
  });
  const previewFretboardScale = useStorage(STORAGE_KEYS.SCORE_FRETBOARD_SCALE, 100, localStorage, {
    eventFilter: debounceFilter(400, { maxWait: 1500 }),
    serializer: percentScaleSerializer,
  });
  // 排列和弦维度用新键，默认值取预览维度的当前值：拆分后两侧都与原设置一致，不会「一夜回到 100%」
  const arrangeFontScale = useStorage(STORAGE_KEYS.SCORE_ARRANGE_FONT_SCALE, previewFontScale.value, localStorage, {
    eventFilter: debounceFilter(400, { maxWait: 1500 }),
    serializer: percentScaleSerializer,
  });
  const arrangeFretboardScale = useStorage(
    STORAGE_KEYS.SCORE_ARRANGE_FRETBOARD_SCALE,
    previewFretboardScale.value,
    localStorage,
    {
      eventFilter: debounceFilter(400, { maxWait: 1500 }),
      serializer: percentScaleSerializer,
    }
  );
  /** 编辑视图（排列和弦）实际生效的缩放：ChordSlotCell / ScoreInteractiveArea 消费 */
  const effectiveFontScale = computed(() => arrangeFontScale.value);
  const effectiveFretboardScale = computed(() => arrangeFretboardScale.value);

  const activeSong = computed<Song | null>(() => {
    if (!activeSongId.value) return null;
    return songStore.songs.find(s => s.id === activeSongId.value) || null;
  });

  const hasLyrics = computed(() => Boolean(activeSong.value?.lyrics && activeSong.value.lyrics.trim().length > 0));

  const activeTab = computed({
    get: () => {
      // 防御 storage 中遗留未知值：仅接受三个合法标签
      const current = activeTabRef.value;
      if (current !== 'edit' && current !== 'interactive' && current !== 'preview') return 'edit';
      if (!hasLyrics.value) return 'edit';
      return current;
    },
    set: (val: ScoreActiveTab) => {
      if (val !== 'edit' && !hasLyrics.value) {
        activeTabRef.value = 'edit';
        return;
      }
      activeTabRef.value = val;
    },
  });

  // ---- 撤销-重做历史栈（机制见 useScoreHistory） ----
  const {
    recordHistory,
    undo,
    redo,
    handleSongChange: handleHistorySongChange,
  } = useScoreHistory({
    getActiveSong: () => activeSong.value,
    applyState: (id, state) => songStore.updateSongMeta(id, state),
  });

  watch(activeSong, newSong => handleHistorySongChange(newSong), { immediate: true });

  /** 设置当前编辑的歌曲 id（仅内存）；URL `?id=` 负责刷新/深链恢复。 */
  const setActiveSong = (id: string | null) => {
    activeSongId.value = id;
  };

  // 「最近编辑乐谱」冷启动指针：URL 无选歌参数（裸访问）时作为回灌种子；
  // 取消选中（id 为 null）时同步清除指针，否则用户已主动取消的选择会在刷新后被回灌复活。
  watch(activeSongId, id => {
    if (typeof localStorage === 'undefined') return;
    if (id) localStorage.setItem(STORAGE_KEYS.LAST_SONG_ID, id);
    else localStorage.removeItem(STORAGE_KEYS.LAST_SONG_ID);
  });

  // 记录「最近的乐谱主 Tab」冷启动指针：仅当存在激活歌曲且当前为主 Tab（非 edit）时写入，
  // 供裸入口刷新后随 LAST_SONG 一并回灌（URL 仍是唯一数据源）；取消选中或回退到 edit 时清理，
  // 避免刷新后误恢复一个当前不再有效的 Tab。
  watch([activeSongId, () => activeTab.value], ([songId, tab]) => {
    if (typeof localStorage === 'undefined') return;
    if (songId && tab && tab !== 'edit') localStorage.setItem(STORAGE_KEYS.LAST_ACTIVE_TAB, tab);
    else localStorage.removeItem(STORAGE_KEYS.LAST_ACTIVE_TAB);
  });

  /**
   * 更新歌词。songId 缺省时为当前激活歌曲。
   * 提供 songId 参数是为了让防抖/异步提交在"调度时"锁定目标歌曲（见 ScoreLyricsEditor 的 commitLyrics），
   * 避免切换歌曲后旧的挂起回调把上一首的歌词错误写入当前歌曲（会连带清空其和弦，即跨歌联动根因）。
   */
  const updateLyrics = (lyrics: string, songId?: string) => {
    const target = songId ? (songStore.songs.find(s => s.id === songId) ?? null) : activeSong.value;
    if (!target) return;
    const sanitizedLyrics = sanitizeLyricsText(lyrics);
    if (sanitizedLyrics === target.lyrics) return;
    // 仅在编辑的正是当前激活歌曲时才记录撤销历史，避免历史栈混入非激活歌曲的变更
    if (activeSong.value?.id === target.id) recordHistory();
    const oldLines = target.lyrics.split('\n');
    const newLines = sanitizedLyrics.split('\n');
    const newIds = matchLineIds(oldLines, newLines, target.lineIds ?? []);
    const { map: updatedChordMap, changed } = garbageCollectChordMap(target.chordMap, newIds);
    songStore.updateSongMeta(target.id, {
      lyrics: sanitizedLyrics,
      lineIds: newIds,
      chordMap: changed ? updatedChordMap : target.chordMap,
    });
    if (activeSong.value?.id === target.id) recordHistory();
    if (activeSong.value?.id === target.id && !sanitizedLyrics.trim()) {
      activeTabRef.value = 'edit';
    }
  };

  /** 为当前歌曲的歌词字符槽位设置和弦，并记录撤销历史。 */
  const setSlotChord = (slotKey: SlotKey, chord: Chord) => {
    if (!activeSong.value) return;
    recordHistory();
    songStore.setCharChord(activeSong.value.id, slotKey, chord.id);
    recordHistory();
  };

  /** 移除当前歌曲指定槽位上的和弦，并记录撤销历史。 */
  const removeSlotChord = (slotKey: SlotKey) => {
    if (!activeSong.value) return;
    recordHistory();
    songStore.removeCharChord(activeSong.value.id, slotKey);
    recordHistory();
  };

  /** 拖拽来源是 DOM data-slot-key（不可信边界）：校验前缀后再信任收窄 */
  const isSlotKey = (value: string): value is SlotKey => value.startsWith('line_');
  /** 交换两个槽位的和弦绑定（拖拽互换），并记录撤销历史。 */
  const swapSlotChords = (sourceKey: string, targetKey: string) => {
    if (!activeSong.value || sourceKey === targetKey) return;
    if (!isSlotKey(sourceKey) || !isSlotKey(targetKey)) return;
    recordHistory();
    songStore.swapSongSlotChords(activeSong.value.id, sourceKey, targetKey);
    recordHistory();
  };

  /** 复制并移动：把源槽位的和弦拷贝到目标槽位，源槽位保留（用于复制拖拽） */
  const copySlotChord = (sourceKey: string, targetKey: string) => {
    if (!activeSong.value || sourceKey === targetKey) return;
    if (!isSlotKey(sourceKey) || !isSlotKey(targetKey)) return;
    const sourceChordId = activeSong.value.chordMap.get(sourceKey);
    if (!sourceChordId) return;
    recordHistory();
    songStore.setCharChord(activeSong.value.id, targetKey, sourceChordId);
    recordHistory();
  };

  /** 移位：源槽位和弦移动到目标槽位（目标被覆盖，源槽位清空），单条撤销记录 */
  const moveSlotChord = (sourceKey: string, targetKey: string) => {
    if (!activeSong.value || sourceKey === targetKey) return;
    if (!isSlotKey(sourceKey) || !isSlotKey(targetKey)) return;
    const sourceChordId = activeSong.value.chordMap.get(sourceKey);
    if (!sourceChordId) return;
    recordHistory();
    songStore.setCharChord(activeSong.value.id, targetKey, sourceChordId);
    songStore.removeCharChord(activeSong.value.id, sourceKey);
    recordHistory();
  };

  /** 对当前编辑歌曲进行移调（包含撤销栈记录与和弦库复用/自动补充） */
  const transposeActiveSong = (semitones: number) => {
    if (!activeSong.value || semitones === 0) return;
    recordHistory();
    songStore.transposeSong(activeSong.value.id, semitones, {
      chordResolver: id => chordStore.savedChordsList.find(c => c.id === id),
      chordFinder: (targetName, originalChord) => {
        return chordStore.savedChordsList.find(c => {
          if (c.tuning !== originalChord.tuning || c.strings.length !== originalChord.strings.length) return false;
          return getChordName(c) === targetName;
        });
      },
      chordCreator: originalChord => {
        const created = transposeChordEntity(originalChord, semitones, {
          mode: 'update_name',
          newId: toChordId('c_' + generateUUID().slice(0, 10)),
        });
        chordStore.addChord(created);
        return created;
      },
    });
    recordHistory();
  };

  /** 增减当前歌曲的变调夹品位（包含撤销栈保护） */
  const transposeActiveCapo = (deltaCapo: number) => {
    if (!activeSong.value || deltaCapo === 0) return;
    recordHistory();
    songStore.transposeSongCapo(activeSong.value.id, deltaCapo);
    recordHistory();
  };

  return {
    activeSongId,
    activeTab,
    activeSong,
    hasLyrics,
    setActiveSong,
    updateLyrics,
    setSlotChord,
    removeSlotChord,
    swapSlotChords,
    copySlotChord,
    moveSlotChord,
    transposeActiveSong,
    transposeActiveCapo,
    previewFontScale,
    previewFretboardScale,
    arrangeFontScale,
    arrangeFretboardScale,
    effectiveFontScale,
    effectiveFretboardScale,
    undo,
    redo,
  };
});
