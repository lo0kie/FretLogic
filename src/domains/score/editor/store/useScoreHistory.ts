/**
 * 乐谱编辑的撤销-重做历史栈（与 Pinia store 解耦的 composable）：
 * 以「歌词 / 行序 / 和弦映射 / 调性 / 变调夹」为快照粒度，容量有限（默认 20），
 * 相邻重复快照不记录；撤销-重做窗口内暂停记录，避免恢复过程被再次入栈。
 */
import { computed, ref } from 'vue';

import { cloneChordMap } from '@/domains/score/model/chordSlots';
import { wait } from '@/platform/utils/common';

import type { Chord } from '@/domains/chord/types';
import type { Capo, ChordLineSlots, LineId, Song } from '@/domains/score/types';

export interface HistoryState {
  lyrics: string;
  lineIds: LineId[];
  chordMap: Map<LineId, ChordLineSlots>;
  playKey?: string;
  capo?: Capo;
  /**
   * 产生该快照的那一步在用户和弦库里**自动新建**的和弦（如移调补弦）。
   * 快照一旦离开撤销栈（redo 分支被截断 / 超出容量 / 切换歌曲），该状态就再也回不到，
   * 这些和弦便成了库里够不到的孤儿 —— 由 {@link ScoreHistoryOptions.onSnapshotsDiscarded} 回收；
   * 不记这个字段的话，「移调 → 撤销」会让每次自动建弦永久留在库里并跟着备份走。
   */
  createdChords?: Chord[];
}

const cloneHistoryState = (state: HistoryState): HistoryState => ({
  lyrics: state.lyrics,
  lineIds: [...state.lineIds],
  chordMap: cloneChordMap(state.chordMap),
  playKey: state.playKey,
  capo: state.capo,
  // 旁挂记录按引用带走：它描述的是「产生这条快照的那一步」，与快照同生命周期
  createdChords: state.createdChords,
});

const chordMapsEqual = (a: Map<LineId, ChordLineSlots>, b: Map<LineId, ChordLineSlots>): boolean => {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [lineId, slots] of a) {
    const other = b.get(lineId);
    if (!other) return false;
    if (slots.char.size !== other.char.size) return false;
    for (const [idx, id] of slots.char) if (other.char.get(idx) !== id) return false;

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
  /**
   * 快照离开撤销栈时的回收钩子（redo 分支被截断、超出容量、切换歌曲三种情形）。
   * 调用方据此处理快照旁挂的 `createdChords`：那些和弦已不可能再被任何状态引用。
   */
  onSnapshotsDiscarded?: (states: HistoryState[]) => void;
}

export const useScoreHistory = (options: ScoreHistoryOptions) => {
  const { getActiveSong, applyState, onSnapshotsDiscarded, capacity = 20 } = options;

  /**
   * 撤销-重做进行中的**嵌套深度**（计数，不是布尔）。
   *
   * 为什么必须是计数：窗口的解除发生在 `await settleReactivePropagation()` 之后。若两次
   * undo/redo 重叠（第一次的宏任务边界尚未到期，第二次已经进来），布尔标志会被**先到期的那次**
   * 提前清掉，第二次仍在窗口内派生的写入于是被记入撤销栈 —— 表现为「跳步 / 幽灵历史」，
   * 正是下面 settleReactivePropagation 那段注释想消灭的现象。计数保证只有最后一层退出时才真正解除。
   */
  const undoRedoDepth = ref(0);
  const isUndoRedoAction = computed(() => undoRedoDepth.value > 0);
  const historyStack: HistoryState[] = [];
  let historyIndex = -1;
  let currentSongId: string | null = null;

  /**
   * 离栈快照的旁挂资源回收。只在快照真带 `createdChords` 时才排队，且**延迟一个宏任务**：
   * 回收动作会经应用层桥接改写乐谱，若在 recordHistory 的同步段里执行就等于在「记录历史」
   * 的过程中再次改动状态、重入本函数。
   */
  const schedulePrune = (discarded: HistoryState[]): void => {
    if (!onSnapshotsDiscarded || !discarded.some(s => s.createdChords?.length)) return;
    void wait().then(() => onSnapshotsDiscarded(discarded));
  };

  /**
   * 将当前歌曲的歌词/行序/和弦映射快照压入撤销栈（撤销-重做期间不记录）。
   * @param createdChords 本步在用户和弦库里自动新建的和弦，随快照一起登记以便离栈回收；
   *                      与栈顶内容等价而早退时该登记一并丢弃——状态未变意味着这些和弦仍被当前谱面引用
   */
  const recordHistory = (song?: Song, createdChords?: Chord[]) => {
    const target = song || getActiveSong();
    if (!target || isUndoRedoAction.value) return;
    const nextState = cloneHistoryState({
      lyrics: target.lyrics,
      lineIds: target.lineIds,
      chordMap: target.chordMap,
      playKey: target.playKey,
      capo: target.capo,
      createdChords,
    });
    const currentTop = historyStack[historyIndex];
    if (
      currentTop &&
      currentTop.lyrics === nextState.lyrics &&
      currentTop.playKey === nextState.playKey &&
      currentTop.capo === nextState.capo &&
      lineIdsEqual(currentTop.lineIds, nextState.lineIds) &&
      chordMapsEqual(currentTop.chordMap, nextState.chordMap)
    )
      return;

    // 新记录使 redo 分支失效：被截断的快照再也回不到，其旁挂的自动新建和弦可回收
    const discarded = historyStack.splice(historyIndex + 1);
    historyStack.push(nextState);
    let overflowed: HistoryState | undefined;
    if (historyStack.length > capacity) overflowed = historyStack.shift();

    historyIndex = historyStack.length - 1;
    schedulePrune(overflowed ? [...discarded, overflowed] : discarded);
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
      undoRedoDepth.value += 1;
      try {
        historyIndex--;
        // 快照可能被 songStore 以引用方式接管（chordMap 会被原地修改），恢复时必须克隆
        const state = cloneHistoryState(historyStack[historyIndex]!);
        applyState(getActiveSong()!.id, state);
        await settleReactivePropagation();
      } finally {
        // 递减必须放在 finally：applyState 抛错时若把窗口留在打开状态，之后所有编辑都不再入栈
        //（历史静默停摆，且没有任何提示）
        undoRedoDepth.value -= 1;
      }
      return true;
    }
    return false;
  };

  /** 重做：前进到下一快照并写回歌曲数据；标记撤销期以避免恢复过程被再次记录。 */
  const redo = async () => {
    if (historyIndex < historyStack.length - 1 && getActiveSong()) {
      undoRedoDepth.value += 1;
      try {
        historyIndex++;
        const state = cloneHistoryState(historyStack[historyIndex]!);
        applyState(getActiveSong()!.id, state);
        await settleReactivePropagation();
      } finally {
        undoRedoDepth.value -= 1;
      }
    }
  };

  /**
   * 歌曲切换时重置历史栈（由 store 的 watch(activeSong) 转发）：
   * 同一首歌且已有记录时跳过，否则清空并压入初始快照。
   */
  const handleSongChange = (newSong: Song | null) => {
    if (newSong && newSong.id === currentSongId && historyStack.length > 0) return;

    currentSongId = newSong?.id ?? null;
    // 整栈作废同样是离栈：旧歌那几步自动新建、且此刻已无任何乐谱引用的和弦在此回收
    schedulePrune([...historyStack]);
    historyStack.length = 0;
    historyIndex = -1;
    if (!newSong) return;

    if (!isUndoRedoAction.value) recordHistory(newSong);
  };

  return { isUndoRedoAction, recordHistory, undo, redo, handleSongChange };
};
