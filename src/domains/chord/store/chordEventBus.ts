/**
 * 和弦 store 的跨领域事件总线（纯机制，与 Pinia 无关）：
 * 和弦被删除 / 撤销恢复 / 合并（重复项丢弃）时向外广播，
 * 由应用层桥接乐谱槽位解绑，避免 chord → score 反向依赖。
 */

type ChordIdsListener = (chordIds: string[]) => void;
/** 和弦合并事件参数：key 为被丢弃的重复和弦 id，value 为合并后保留的和弦 id */
type ChordsMergedListener = (mapping: Map<string, string>) => void;

export interface ChordEventBus {
  /** 订阅「和弦被删除」事件；返回取消订阅函数 */
  onChordsRemoved: (cb: ChordIdsListener) => () => void;
  /** 订阅「和弦被撤销恢复」事件；返回取消订阅函数 */
  onChordsRestored: (cb: ChordIdsListener) => () => void;
  /** 订阅「和弦被合并（重复项丢弃）」事件；返回取消订阅函数 */
  onChordsMerged: (cb: ChordsMergedListener) => () => void;
  emitChordsRemoved: (chordIds: string[]) => void;
  emitChordsRestored: (chordIds: string[]) => void;
  emitChordsMerged: (mapping: Map<string, string>) => void;
}

export const createChordEventBus = (): ChordEventBus => {
  const chordsRemovedListeners: ChordIdsListener[] = [];
  const chordsRestoredListeners: ChordIdsListener[] = [];
  const chordsMergedListeners: ChordsMergedListener[] = [];

  const subscribe = <T extends unknown[]>(listeners: ((...args: T) => void)[], cb: (...args: T) => void) => {
    listeners.push(cb);
    return () => {
      const idx = listeners.indexOf(cb);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  };

  return {
    onChordsRemoved: cb => subscribe(chordsRemovedListeners, cb),
    onChordsRestored: cb => subscribe(chordsRestoredListeners, cb),
    onChordsMerged: cb => subscribe(chordsMergedListeners, cb),
    emitChordsRemoved: chordIds => {
      if (chordIds.length === 0) return;
      chordsRemovedListeners.forEach(cb => cb(chordIds));
    },
    emitChordsRestored: chordIds => {
      if (chordIds.length === 0) return;
      chordsRestoredListeners.forEach(cb => cb(chordIds));
    },
    emitChordsMerged: mapping => {
      if (mapping.size === 0) return;
      chordsMergedListeners.forEach(cb => cb(mapping));
    },
  };
};
