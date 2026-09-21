/**
 * 和弦 store 的跨领域事件总线（纯机制，与 Pinia 无关）：
 * 和弦被删除 / 撤销恢复 / 合并（重复项丢弃）时向外广播，
 * 由应用层桥接乐谱槽位解绑，避免 chord → score 反向依赖。
 *
 * 底层基于 `mitt`（<200B）承担订阅表与派发机制；本文件只保留
 * 类型化事件载荷与「空载荷不发事件」的领域语义。
 */
import mitt from 'mitt';

type ChordIdsListener = (chordIds: string[]) => void;
/** 和弦合并事件参数：key 为被丢弃的重复和弦 id，value 为合并后保留的和弦 id */
type ChordsMergedListener = (mapping: Map<string, string>) => void;

/**
 * 注意：必须用 type 而非 interface——mitt 的泛型约束是
 * `Events extends Record<EventType, unknown>`（`EventType = string | symbol`），
 * 而 TS 的隐式索引签名只赋予**对象字面量类型**，interface 因可被声明合并扩展而不参与：
 * 一旦改成 interface，`mitt<ChordEvents>()` 会直接不满足约束。
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- 见上：interface 不获得隐式索引签名，会破坏 mitt 的泛型约束
type ChordEvents = {
  removed: string[];
  restored: string[];
  merged: Map<string, string>;
};

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
  const emitter = mitt<ChordEvents>();

  return {
    onChordsRemoved: cb => {
      const handler = (ids: string[]): void => cb(ids);
      emitter.on('removed', handler);
      return () => emitter.off('removed', handler);
    },
    onChordsRestored: cb => {
      const handler = (ids: string[]): void => cb(ids);
      emitter.on('restored', handler);
      return () => emitter.off('restored', handler);
    },
    onChordsMerged: cb => {
      const handler = (mapping: Map<string, string>): void => cb(mapping);
      emitter.on('merged', handler);
      return () => emitter.off('merged', handler);
    },
    emitChordsRemoved: chordIds => {
      if (chordIds.length === 0) return;
      emitter.emit('removed', chordIds);
    },
    emitChordsRestored: chordIds => {
      if (chordIds.length === 0) return;
      emitter.emit('restored', chordIds);
    },
    emitChordsMerged: mapping => {
      if (mapping.size === 0) return;
      emitter.emit('merged', mapping);
    },
  };
};
