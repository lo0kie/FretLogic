/**
 * 乐谱编辑的撤销-重做历史栈（与 Pinia store 解耦的 composable）：
 * 以「歌词 / 行序 / 和弦映射 / 调性 / 变调夹」为快照粒度，容量有限（默认 20），
 * 相邻重复快照不记录；撤销-重做窗口内暂停记录，避免恢复过程被再次入栈。
 */
import { nextTick, ref } from 'vue';

import type { ChordId } from '@/domains/chord/types';
import type { Capo, LineId, SlotKey, Song } from '@/domains/score/types';
import type { Ref } from 'vue';

export interface HistoryState {
  lyrics: string;
  lineIds: LineId[];
  chordMap: Map<SlotKey, ChordId>;
  playKey?: string;
  capo?: Capo;
}

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

export interface ScoreHistoryOptions {
  /** 取当前激活歌曲（快照来源） */
  getActiveSong: () => Song | null;
  /** 把快照写回歌曲（store 侧转发给 updateSongMeta） */
  applyState: (songId: string, state: HistoryState) => void;
  /** 栈容量上限，超出时丢弃最旧快照 */
  capacity?: number;
}

export const useScoreHistory = (options: ScoreHistoryOptions) => {
  const { getActiveSong, applyState, capacity = 20 } = options;

  const isUndoRedoAction: Ref<boolean> = ref(false);
  const historyStack: HistoryState[] = [];
  let historyIndex = -1;
  let currentSongId: string | null = null;

  /** 将当前歌曲的歌词/行序/和弦映射快照压入撤销栈（撤销-重做期间不记录）。 */
  const recordHistory = (song?: Song) => {
    const target = song || getActiveSong();
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
    if (historyStack.length > capacity) {
      historyStack.shift();
    }
    historyIndex = historyStack.length - 1;
  };

  /** 撤销：回退到上一快照并写回歌曲数据；标记撤销期以避免恢复过程被再次记录。 */
  const undo = async () => {
    if (historyIndex > 0 && getActiveSong()) {
      isUndoRedoAction.value = true;
      historyIndex--;
      // 快照可能被 songStore 以引用方式接管（chordMap 会被原地修改），恢复时必须克隆
      const state = cloneHistoryState(historyStack[historyIndex]!);
      applyState(getActiveSong()!.id, state);
      await nextTick();
      await nextTick();
      isUndoRedoAction.value = false;
    }
  };

  /** 重做：前进到下一快照并写回歌曲数据；标记撤销期以避免恢复过程被再次记录。 */
  const redo = async () => {
    if (historyIndex < historyStack.length - 1 && getActiveSong()) {
      isUndoRedoAction.value = true;
      historyIndex++;
      const state = cloneHistoryState(historyStack[historyIndex]!);
      applyState(getActiveSong()!.id, state);
      await nextTick();
      await nextTick();
      isUndoRedoAction.value = false;
    }
  };

  /**
   * 歌曲切换时重置历史栈（由 store 的 watch(activeSong) 转发）：
   * 同一首歌且已有记录时跳过，否则清空并压入初始快照。
   */
  const handleSongChange = (newSong: Song | null) => {
    if (newSong && newSong.id === currentSongId && historyStack.length > 0) {
      return;
    }
    currentSongId = newSong?.id ?? null;
    historyStack.length = 0;
    historyIndex = -1;
    if (!newSong) {
      return;
    }
    if (!isUndoRedoAction.value) {
      recordHistory(newSong);
    }
  };

  return { isUndoRedoAction, recordHistory, undo, redo, handleSongChange };
};
