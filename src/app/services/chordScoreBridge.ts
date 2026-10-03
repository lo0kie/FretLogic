/**
 * 和弦 ↔ 乐谱跨领域桥接（应用装配层专用）：
 * 订阅 chordStore 的「和弦删除 / 撤销恢复」事件，在乐谱域执行槽位解绑与撤销回填。
 * 由此 chord 域无需反向导入 songStore（切断 chord → score 依赖），跨领域副作用收敛于此。
 * 在 App 装配时调用一次即可。
 */
import { CHORD_HISTORY_CAPACITY, useChordStore } from '@/domains/chord/store/chordStore';
import { useSongStore } from '@/domains/score/library/store/songStore';
import { logger } from '@/platform/utils/logger';

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
  chordStore.onChordsMerged(mapping => void songStore.remapChordBindings(mapping));

  // 水合期清洗去重丢弃的重复项同样要重定向：水合先于本桥接装配，事件已错过，取暂存映射补偿。
  // 但装配**不保证**晚于水合 —— main.ts 给水合设了 8s 兜底超时，超时即挂载，此刻两个 store 都还在读。
  // 原先在这里同步取一次：超时路径下取到 null，之后水合写入的映射再无人消费，被去重丢弃的
  // 和弦 id 在乐谱槽位里就留成死引用。
  // 故改为再等一次 —— 两个 hydrate 都幂等（已水合即返回、进行中返回同一个 promise），
  // 等齐之后才消费：乐谱侧若还没数据，remapChordBindings 会打在空列表上等于没做，槽位照样是死引用。
  // 补 .catch：本链是 void 的（装配点不接返回值），hydrate 抛出会成为 unhandled rejection 且补偿静默不执行
  void Promise.all([chordStore.hydrate(), songStore.hydrate()])
    .then(() => {
      const pendingMerged = chordStore.consumeHydrateMergeMapping();
      if (pendingMerged && pendingMerged.size > 0) songStore.remapChordBindings(pendingMerged);
    })
    .catch((error: unknown) => logger.error('bridge', '水合后补偿去重映射失败', error));
}
