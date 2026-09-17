/**
 * 和弦 ↔ 乐谱跨领域桥接（应用装配层专用）：
 * 订阅 chordStore 的「和弦删除 / 撤销恢复」事件，在乐谱域执行槽位解绑与撤销回填。
 * 由此 chord 域无需反向导入 songStore（切断 chord → score 依赖），跨领域副作用收敛于此。
 * 在 App 装配时调用一次即可。
 */
import { CHORD_HISTORY_CAPACITY, useChordStore } from '@/domains/chord/store/chordStore';
import { useSongStore } from '@/domains/score/library/store/songStore';

/** 解绑记录保留步数：直接取和弦撤销容量，使「连续删除 N 批 → 逐次撤销」都能各自归位，
 *  且两处深度不会各自漂移；超出深度的最旧记录被丢弃。 */
const MAX_UNBOUND_RECORDS = CHORD_HISTORY_CAPACITY;

export function setupChordScoreBridge(): void {
  const chordStore = useChordStore();
  const songStore = useSongStore();

  /** 一次删除产生的解绑记录：chordIds 用于把「撤销恢复」事件回溯到对应那一步 */
  interface UnboundRecord {
    chordIds: Set<string>;
    bindings: ReturnType<typeof songStore.unbindChordIds>;
  }

  // 由「单槽只记最近一次解绑」改为「按删除步成栈」：
  // 连续删两批和弦再撤销时，单槽只剩最后一批，先前那批在乐谱里的指向永久找不回来。
  const unboundRecords: UnboundRecord[] = [];

  chordStore.onChordsRemoved(chordIds => {
    unboundRecords.push({
      chordIds: new Set(chordIds),
      bindings: songStore.unbindChordIds(new Set(chordIds)),
    });
    if (unboundRecords.length > MAX_UNBOUND_RECORDS) unboundRecords.shift();
  });

  chordStore.onChordsRestored(restoredIds => {
    // 回溯到「产生这批解绑的那一步」，而不是无脑弹栈顶：
    // 删除与撤销之间可能夹着其他会推进历史的操作，栈顶未必对应本次撤销。
    for (let i = unboundRecords.length - 1; i >= 0; i -= 1) {
      const record = unboundRecords[i];
      if (!record || !restoredIds.some(id => record.chordIds.has(id))) continue;
      unboundRecords.splice(i, 1);
      songStore.restoreChordBindings(record.bindings);
      return;
    }
  });

  /** 和弦合并（移动时去重）：被丢弃的重复项引用重定向到保留项，避免槽位死引用 */
  chordStore.onChordsMerged(mapping => {
    songStore.remapChordBindings(mapping);
  });
}
