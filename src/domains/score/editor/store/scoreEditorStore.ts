/**
 * 乐谱编辑器 store：当前编辑歌曲的歌词 / 和弦槽位 / 谱面状态管理，
 * 含撤销-重做历史栈、调性变换（transpose/capo）与编辑态持久化。
 */
import { computed, nextTick, ref, watch } from 'vue';

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

import type { Chord, ChordId } from '@/domains/chord/types';
import type { Capo, LineId, SlotKey, Song } from '@/domains/score/types';

/** 乐谱页主 Tab：编辑歌词 / 排列和弦 / 预览（URL tab 参数的合法值域） */
export type ScoreActiveTab = 'edit' | 'interactive' | 'preview';

interface HistoryState {
  lyrics: string;
  lineIds: LineId[];
  chordMap: Map<SlotKey, ChordId>;
  playKey?: string;
  capo?: Capo;
}

export const useScoreEditorStore = defineStore('scoreEditor', () => {
  const songStore = useSongStore();
  const chordStore = useChordStore();
  // 选中乐谱仅内存态：URL `?id=` 是唯一数据源（可分享 / 可后退），localStorage 只维护一个
  // 「最近编辑乐谱」指针供裸访问入口冷启动回灌，不再双写完整选中态。
  const activeSongId = ref<string | null>(null);
  // 当前标签页仅内存态：URL `?tab=` 全权接管（刷新由 URL 恢复，裸访问回落到 edit 默认）
  const activeTabRef = ref<ScoreActiveTab>('edit');
  const selectedSlotKey = ref<SlotKey | null>(null);
  const fontScale = useStorage(STORAGE_KEYS.SCORE_FONT_SCALE, 1.0, localStorage, {
    eventFilter: debounceFilter(400, { maxWait: 1500 }),
  });
  const fretboardScale = useStorage(STORAGE_KEYS.SCORE_FRETBOARD_SCALE, 1.0, localStorage, {
    eventFilter: debounceFilter(400, { maxWait: 1500 }),
  });
  const effectiveFontScale = computed(() => fontScale.value);
  const effectiveFretboardScale = computed(() => fretboardScale.value);
  const historyStack: HistoryState[] = [];
  let historyIndex = -1;
  const isUndoRedoAction = ref(false);
  const HISTORY_CAPACITY = 20;

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

  const cloneHistoryState = (state: HistoryState): HistoryState => ({
    lyrics: state.lyrics,
    lineIds: [...state.lineIds],
    chordMap: new Map(state.chordMap),
    playKey: state.playKey,
    capo: state.capo,
  });

  const chordMapsEqual = (a: Map<SlotKey, ChordId>, b: Map<SlotKey, ChordId>): boolean => {
    if (a === b) return true;
    if (a.size !== b.size) return false;
    for (const [k, v] of a) {
      if (b.get(k) !== v) return false;
    }
    return true;
  };

  const lineIdsEqual = (a: LineId[], b: LineId[]): boolean => {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    return a.every((id, i) => id === b[i]);
  };

  /** 将当前歌曲的歌词/行序/和弦映射快照压入撤销栈（容量 20，撤销-重做期间不记录）。 */
  const recordHistory = (song?: Song) => {
    const target = song || activeSong.value;
    if (!target || isUndoRedoAction.value) return;
    const nextState = cloneHistoryState({
      lyrics: target.lyrics,
      lineIds: target.lineIds,
      chordMap: target.chordMap,
      playKey: target.playKey,
      capo: target.capo,
    });
    const currentTop = historyStack[historyIndex];
    if (
      currentTop &&
      currentTop.lyrics === nextState.lyrics &&
      currentTop.playKey === nextState.playKey &&
      currentTop.capo === nextState.capo &&
      lineIdsEqual(currentTop.lineIds, nextState.lineIds) &&
      chordMapsEqual(currentTop.chordMap, nextState.chordMap)
    ) {
      return;
    }
    historyStack.splice(historyIndex + 1);
    historyStack.push(nextState);
    if (historyStack.length > HISTORY_CAPACITY) {
      historyStack.shift();
    }
    historyIndex = historyStack.length - 1;
  };

  /** 撤销：回退到上一快照并写回歌曲数据；标记撤销期以避免恢复过程被再次记录。 */
  const undo = async () => {
    if (historyIndex > 0 && activeSong.value) {
      isUndoRedoAction.value = true;
      historyIndex--;
      // 快照可能被 songStore 以引用方式接管（chordMap 会被原地修改），恢复时必须克隆
      const state = cloneHistoryState(historyStack[historyIndex]!);
      songStore.updateSongMeta(activeSong.value.id, state);
      await nextTick();
      await nextTick();
      isUndoRedoAction.value = false;
    }
  };

  /** 重做：前进到下一快照并写回歌曲数据；标记撤销期以避免恢复过程被再次记录。 */
  const redo = async () => {
    if (historyIndex < historyStack.length - 1 && activeSong.value) {
      isUndoRedoAction.value = true;
      historyIndex++;
      const state = cloneHistoryState(historyStack[historyIndex]!);
      songStore.updateSongMeta(activeSong.value.id, state);
      await nextTick();
      await nextTick();
      isUndoRedoAction.value = false;
    }
  };

  let currentActiveSongId: string | null = null;
  watch(
    activeSong,
    newSong => {
      if (newSong && newSong.id === currentActiveSongId && historyStack.length > 0) {
        return;
      }
      currentActiveSongId = newSong?.id ?? null;
      selectedSlotKey.value = null;
      historyStack.length = 0;
      historyIndex = -1;
      if (!newSong) {
        return;
      }
      if (!isUndoRedoAction.value) {
        recordHistory(newSong);
      }
    },
    { immediate: true }
  );

  /** 设置当前编辑的歌曲 id（仅内存）；URL `?id=` 负责刷新/深链恢复。 */
  const setActiveSong = (id: string | null) => {
    activeSongId.value = id;
  };

  // 「最近编辑乐谱」冷启动指针：URL 无选歌参数（裸访问）时作为回灌种子；取消选中不主动清除，
  // 保证「上次编辑过哪首」在选中态清空后仍可被回退恢复。
  watch(activeSongId, id => {
    if (id && typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEYS.LAST_SONG_ID, id);
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
    selectedSlotKey,
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
    fontScale,
    fretboardScale,
    effectiveFontScale,
    effectiveFretboardScale,
    undo,
    redo,
  };
});
