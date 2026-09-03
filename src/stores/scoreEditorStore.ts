/**
 * 乐谱编辑器 store：当前编辑歌曲的歌词 / 和弦槽位 / 谱面状态管理，
 * 含撤销-重做历史栈、调性变换（transpose/capo）与编辑态持久化。
 */
import { computed, nextTick, ref, watch } from 'vue';

import { debounceFilter, useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';

import { useSongStore } from '@/stores/songStore';
import type { Chord, ChordId, LineId, SlotKey, Song } from '@/types';
import { cloneDeep, matchLineIds, sanitizeLyricsText } from '@/utils/core/common';
import { STORAGE_KEYS } from '@/utils/core/constants';
import { toCapo } from '@/utils/music/chord-fretboard';
import { garbageCollectChordMap } from '@/utils/score/chordSlots';

type ScoreActiveTab = 'edit' | 'interactive' | 'preview';

interface HistoryState {
  lyrics: string;
  lineIds: LineId[];
  chordMap: Map<SlotKey, ChordId>;
}

export const useScoreEditorStore = defineStore('scoreEditor', () => {
  const songStore = useSongStore();
  const activeSongId = useStorage<string | null>(STORAGE_KEYS.ACTIVE_SONG_ID, null);
  // 当前标签页持久化：刷新/重启后恢复上次所在的乐谱视图（edit / interactive / preview）
  const activeTabRef = useStorage<ScoreActiveTab>(STORAGE_KEYS.SCORE_ACTIVE_TAB, 'edit');
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

  /** 将当前歌曲的歌词/行序/和弦映射快照压入撤销栈（容量 20，撤销-重做期间不记录）。 */
  const recordHistory = (song?: Song) => {
    const target = song || activeSong.value;
    if (!target || isUndoRedoAction.value) return;
    historyStack.splice(historyIndex + 1);
    historyStack.push(
      cloneDeep({
        lyrics: target.lyrics,
        lineIds: target.lineIds,
        chordMap: target.chordMap,
      })
    );
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
      const state = cloneDeep(historyStack[historyIndex]!);
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
      const state = cloneDeep(historyStack[historyIndex]!);
      songStore.updateSongMeta(activeSong.value.id, state);
      await nextTick();
      await nextTick();
      isUndoRedoAction.value = false;
    }
  };

  watch(
    activeSong,
    newSong => {
      selectedSlotKey.value = null;
      historyStack.length = 0;
      historyIndex = -1;
      if (!newSong) {
        // 启动早期歌曲数据尚未从存储载入时也会触发一次 null：此时若已恢复出 activeSongId
        //（数据加载中）不得重置 tab，避免覆盖持久化的上次视图；真正无选中歌曲时才回编辑
        if (!activeSongId.value) {
          activeTabRef.value = 'edit';
        }
        return;
      }
      if (!isUndoRedoAction.value) {
        recordHistory(newSong);
      }
      // 切歌不强制切回「排列和弦」：保留当前所在标签（如预览/编辑歌词）；
      // 仅当新歌无歌词且当前标签依赖歌词时回退到编辑
      if (activeTabRef.value !== 'edit' && !(newSong.lyrics && newSong.lyrics.trim().length > 0)) {
        activeTabRef.value = 'edit';
      }
    },
    { immediate: true }
  );

  /** 设置当前编辑的歌曲 id（持久化，刷新后恢复上次编辑的歌曲）。 */
  const setActiveSong = (id: string | null) => {
    activeSongId.value = id;
  };

  /** 更新歌曲演奏调（playKey）；值未变化时跳过。 */
  const updatePlayKey = (playKey: string) => {
    if (activeSong.value && activeSong.value.playKey !== playKey) {
      recordHistory();
      songStore.updateSongMeta(activeSong.value.id, {
        playKey,
      });
    }
  };

  /** 更新歌曲变调夹品位（经 toCapo 收敛到合法范围）；值未变化时跳过。 */
  const updateCapo = (capo: number) => {
    if (activeSong.value && activeSong.value.capo !== capo) {
      recordHistory();
      songStore.updateSongMeta(activeSong.value.id, {
        capo: toCapo(capo),
      });
    }
  };

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
    if (activeSong.value?.id === target.id && !sanitizedLyrics.trim()) {
      activeTabRef.value = 'edit';
    }
  };

  /** 为当前歌曲的歌词字符槽位设置和弦，并记录撤销历史。 */
  const setSlotChord = (slotKey: SlotKey, chord: Chord) => {
    if (!activeSong.value) return;
    recordHistory();
    songStore.setCharChord(activeSong.value.id, slotKey, chord.id);
  };

  /** 移除当前歌曲指定槽位上的和弦，并记录撤销历史。 */
  const removeSlotChord = (slotKey: SlotKey) => {
    if (!activeSong.value) return;
    recordHistory();
    songStore.removeCharChord(activeSong.value.id, slotKey);
  };

  /** 清空指定歌词行内全部槽位的和弦绑定（按槽位键前缀匹配）。 */
  const clearLineChords = (lineId: string) => {
    if (!activeSong.value || !activeSong.value.chordMap) return;
    recordHistory();
    const linePrefix = `line_${lineId}_`;
    const updatedMap = new Map(activeSong.value.chordMap);
    let changed = false;
    for (const key of updatedMap.keys()) {
      if (key.startsWith(linePrefix)) {
        updatedMap.delete(key);
        changed = true;
      }
    }
    if (changed) {
      songStore.updateSongMeta(activeSong.value.id, { chordMap: updatedMap });
    }
  };

  /** 拖拽来源是 DOM data-slot-key（不可信边界）：校验前缀后再信任收窄 */
  const isSlotKey = (value: string): value is SlotKey => value.startsWith('line_');
  /** 交换两个槽位的和弦绑定（拖拽互换），并记录撤销历史。 */
  const swapSlotChords = (sourceKey: string, targetKey: string) => {
    if (!activeSong.value || sourceKey === targetKey) return;
    if (!isSlotKey(sourceKey) || !isSlotKey(targetKey)) return;
    recordHistory();
    songStore.swapSongSlotChords(activeSong.value.id, sourceKey, targetKey);
  };

  /** 复制并移动：把源槽位的和弦拷贝到目标槽位，源槽位保留（用于复制拖拽） */
  const copySlotChord = (sourceKey: string, targetKey: string) => {
    if (!activeSong.value || sourceKey === targetKey) return;
    if (!isSlotKey(sourceKey) || !isSlotKey(targetKey)) return;
    const sourceChordId = activeSong.value.chordMap.get(sourceKey);
    if (!sourceChordId) return;
    recordHistory();
    songStore.setCharChord(activeSong.value.id, targetKey, sourceChordId);
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
  };

  return {
    activeSongId,
    activeTab,
    selectedSlotKey,
    activeSong,
    hasLyrics,
    setActiveSong,
    updatePlayKey,
    updateCapo,
    updateLyrics,
    setSlotChord,
    removeSlotChord,
    clearLineChords,
    swapSlotChords,
    copySlotChord,
    moveSlotChord,
    fontScale,
    fretboardScale,
    effectiveFontScale,
    effectiveFretboardScale,
    undo,
    redo,
  };
});
