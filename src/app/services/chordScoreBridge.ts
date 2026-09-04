/**
 * 和弦 ↔ 乐谱跨领域桥接（应用装配层专用）：
 * 订阅 chordStore 的「和弦删除 / 撤销恢复」事件，在乐谱域执行槽位解绑与撤销回填。
 * 由此 chord 域无需反向导入 songStore（切断 chord → score 依赖），跨领域副作用收敛于此。
 * 在 App 装配时调用一次即可。
 */
import { useChordStore } from '@/domains/chord/store/chordStore';
import { useSongStore } from '@/domains/score/library/store/songStore';

export function setupChordScoreBridge(): void {
  const chordStore = useChordStore();
  const songStore = useSongStore();

  /** 最近一次删除所解绑的槽位绑定；撤销时原样回填（与 chordStore「撤销最近一次」语义对齐） */
  let lastUnboundBindings: ReturnType<typeof songStore.unbindChordIds> = [];

  chordStore.onChordsRemoved(chordIds => {
    lastUnboundBindings = songStore.unbindChordIds(new Set(chordIds));
  });

  chordStore.onChordsRestored(() => {
    songStore.restoreChordBindings(lastUnboundBindings);
    lastUnboundBindings = [];
  });
}
