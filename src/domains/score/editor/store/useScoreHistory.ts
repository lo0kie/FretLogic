/**
 * 乐谱编辑的撤销-重做历史栈（与 Pinia store 解耦的 composable）：
 * 以「歌词 / 行序 / 和弦映射 / 调性 / 变调夹」为快照粒度，容量有限（默认 20），
 * 相邻重复快照不记录；撤销-重做窗口内暂停记录，避免恢复过程被再次入栈。
 */
import { ref } from 'vue';

import { wait } from '@/platform/utils/common';

import type { Capo, ChordLineSlots, LineId, Song } from '@/domains/score/types';
import type { Ref } from 'vue';

export interface HistoryState {
  lyrics: string;
  lineIds: LineId[];
  chordMap: Map<LineId, ChordLineSlots>;
  playKey?: string;
  capo?: Capo;
}

/** 深拷贝嵌套 chordMap：char Map 与 start/end 数组都要复制，否则快照间共享行容器，编辑会污染历史 */
const cloneChordMap = (chordMap: Map<LineId, ChordLineSlots>): Map<LineId, ChordLineSlots> => {
  const copy = new Map<LineId, ChordLineSlots>();
  for (const [lineId, slots] of chordMap) {
    copy.set(lineId, { char: new Map(slots.char), start: [...slots.start], end: [...slots.end] });
  }
  return copy;
};

const cloneHistoryState = (state: HistoryState): HistoryState => ({
  lyrics: state.lyrics,
  lineIds: [...state.lineIds],
  chordMap: cloneChordMap(state.chordMap),
  playKey: state.playKey,
  capo: state.capo,
});

const chordMapsEqual = (a: Map<LineId, ChordLineSlots>, b: Map<LineId, ChordLineSlots>): boolean => {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [lineId, slots] of a) {
    const other = b.get(lineId);
    if (!other) return false;
    if (slots.char.size !== other.char.size) return false;
    for (const [idx, id] of slots.char) {
      if (other.char.get(idx) !== id) return false;
    }
    if (slots.start.length !== other.start.length || slots.end.length !== other.end.length) return false;
    if (!slots.start.every((id, i) => id === other.start[i])) return false;
    if (!slots.end.every((id, i) => id === other.end[i])) return false;
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

  /**
   * 恢复快照后、解除撤销期标记前等待响应式传播结算。
   *
   * isUndoRedoAction 为 true 期间的写入都不进撤销栈，所以必须在 applyState 引发的传播全部
   * 结算完之后才解除。传播不止一帧：store 字段变更先进 pre 队列（消费方 watcher / 组件更新），
   * 其中又可能派生出新的变更进入下一轮队列（编辑器本地缓冲回写、lineIds / chordMap 的连带同步），
   * 而级联上的 watcher 还能自己 `await nextTick()` 把后续写入再往后推若干帧。
   *
   * 为什么不用固定帧数、也不用「采样到状态稳定就收工」：
   * 帧数是拍出来的下界，级联深度取决于派生链长度（歌词 → 行序重排 → 和弦槽位再对齐…），
   * 猜小了级联尾部的写入就会落到窗口外被误记入栈，表现为撤销「跳步」（再撤销一次仿佛没动）；
   * 而按帧采样「状态有没有变」同样判不出来——一条自延迟 N 帧的派生链，在每个采样点上都与
   * 「已经结算完」长得一模一样（都是「这一帧没有变化」），深度超过采样窗口时必然漏判。
   *
   * 改用的判据是「任务边界」：恢复发生在某个宏任务的同步段内，它派生的一切响应式副作用 ——
   * Vue 的 flush 队列（pre / post）以及 watcher 内部 `await nextTick()` 这类自延迟续延 ——
   * 都是该任务微任务链的后人；事件循环会把微任务队列排空到「不再产生新微任务」之后才执行
   * 下一个宏任务。所以让出一个宏任务再解除，级联无论多深都已跑完，且没有任何需要调的魔数。
   *
   * 残留边界（有意为之，非疏漏）：自身跨宏任务再回写的派生层（debounce / setTimeout / rAF
   * 之后再写）不在覆盖范围内 —— 那类写入与「用户自己发起的一次编辑」在信号上不可区分，无法归因。
   *
   * 覆盖用例见 tests/stores/scoreEditorStoreUndoCascade.test.ts：同帧级联与跨 1/2/3/6 帧的级联，
   * 其记录调用都不得入栈（把窗口改回固定帧数时，3 / 6 两档会红）。
   */
  // wait() 默认 0ms，即上面说的「让出一个宏任务边界」（Promise 化的 setTimeout）。
  const settleReactivePropagation = (): Promise<void> => wait();

  /** 撤销：回退到上一快照并写回歌曲数据；标记撤销期以避免恢复过程被再次记录。
   * 返回是否真正执行了回退（无可撤销快照时为 false，供调用方避免空操作提示）。 */
  const undo = async (): Promise<boolean> => {
    if (historyIndex > 0 && getActiveSong()) {
      isUndoRedoAction.value = true;
      historyIndex--;
      // 快照可能被 songStore 以引用方式接管（chordMap 会被原地修改），恢复时必须克隆
      const state = cloneHistoryState(historyStack[historyIndex]!);
      applyState(getActiveSong()!.id, state);
      await settleReactivePropagation();
      isUndoRedoAction.value = false;
      return true;
    }
    return false;
  };

  /** 重做：前进到下一快照并写回歌曲数据；标记撤销期以避免恢复过程被再次记录。 */
  const redo = async () => {
    if (historyIndex < historyStack.length - 1 && getActiveSong()) {
      isUndoRedoAction.value = true;
      historyIndex++;
      const state = cloneHistoryState(historyStack[historyIndex]!);
      applyState(getActiveSong()!.id, state);
      await settleReactivePropagation();
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
