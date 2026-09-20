// @vitest-environment jsdom
/**
 * 撤销栈「结算窗口」的集成测试。
 *
 * 背景：`useScoreHistory` 的 undo/redo 用 `isUndoRedoAction` 屏蔽恢复过程的再次入栈，而解除时机
 * 判定为「让出一个宏任务」（`settleReactivePropagation`，此前是「等两帧」）。这是全项目唯一一处
 * 需要覆盖「响应式级联深度」的地方 —— 快照内容本身好测，**窗口够不够长没人测**：一旦将来某处
 * 新增一层派生更新（歌词变化 → 行序重排 → 和弦槽位再对齐），且这层派生也按生产写法调用记录入口，
 * 恢复过程中的中间态就会被误记入栈，表现为撤销「跳步」（再撤销一次仿佛没动）。
 * 本文件把这条假设钉成回归锚点。
 *
 * 两类用例：
 * 1. 历史栈 + 派生消费者（派生侧调用与 store 内部完全相同的记录入口 `recordHistory`），
 *    逐档加深级联（同帧 / 跨一帧 / 跨多帧），直接探窗口边界；
 * 2. 经 `scoreEditorStore` / `songStore` 公共 API 的端到端：派生消费者在场时，逐次撤销
 *    必须逐次落到**不同的**真实快照（不跳步）。
 *
 * 「跨多帧」那一档是判定窗口判据的试金石：固定的「等两帧」下它必然漏（级联尾部的记录落到窗口外），
 * 任务边界判据下它必然被覆盖。改动 `settleReactivePropagation` 时先看这一档。
 */
import { nextTick, watch } from 'vue';

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { useChordStore } from '@/domains/chord/store/chordStore';
import { toChordId, toGroupId } from '@/domains/chord/theory/entityFactories';
import { nameToSegments, Tuning } from '@/domains/chord/theory/theory';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useScoreHistory } from '@/domains/score/editor/store/useScoreHistory';
import { useSongStore } from '@/domains/score/library/store/songStore';
import { lineCharChord } from '@/domains/score/model/scoreModel';
import { idb } from '@/platform/services/storage';
import { hydrateIdbKv } from '@/platform/services/storage/idbKv';

import type { Chord } from '@/domains/chord/types';
import type { LineId } from '@/domains/score/types';

/**
 * 搭建「store 侧响应式歌曲 + 真实历史栈」：applyState 走与生产接线完全一致的 updateSongMeta，
 * 并把生产代码的双记录写法（`recordHistory(); 改数据; recordHistory();`，见 scoreEditorStore
 * 的各 action）收敛成一个 edit。
 */
const buildHistoryHarness = () => {
  const songStore = useSongStore();
  const created = songStore.createSong('级联撤销测试');
  // 必须取 store 侧的响应式代理：直接改 createSong 返回的裸对象不会触发响应式（写入不过代理），
  // 派生消费者永远观测不到变化，下面的「级联」就成了空跑
  const song = songStore.songs.find(s => s.id === created.id)!;
  song.lyrics = 'A';
  song.lineIds = ['line_1' as LineId];

  const history = useScoreHistory({
    getActiveSong: () => song,
    applyState: (songId, state) => songStore.updateSongMeta(songId, state),
  });
  history.handleSongChange(song);

  const edit = (lyrics: string) => {
    history.recordHistory();
    songStore.updateSongMeta(song.id, {
      lyrics,
      lineIds: lyrics.split('\n').map((_, i) => `line_${i + 1}` as LineId),
    });
    history.recordHistory();
  };

  return { song, history, edit };
};

beforeEach(async () => {
  // 重置 kv 镜像（IDB kv 库 + 内存 Map），保证用例间小状态隔离
  await idb.clear('kv');
  await hydrateIdbKv();
  setActivePinia(createPinia());
});

describe('撤销的级联结算下界（派生写入不得混入历史栈）', () => {
  it('撤销恢复引发的同帧派生记录调用不入栈，逐次撤销落到不同快照', async () => {
    const { song, history, edit } = buildHistoryHarness();
    edit('A\nB');
    edit('A\nB\nC');

    // 派生消费者：与 store 内 watcher 同档（pre），在数据变化后按生产写法调一次记录入口。
    // 真实场景形状：歌词/行序变化 → 派生数据回写 → 回写处调 recordHistory
    let cascadeRecords = 0;
    const stopCascade = watch(
      () => song.lyrics,
      () => {
        cascadeRecords++;
        history.recordHistory();
      },
      { flush: 'pre' }
    );

    await history.undo();
    // 派生确实在撤销窗口内执行过 —— 否则本用例是同义反复（断言的是「空跑没污染」）
    expect(cascadeRecords).toBeGreaterThan(0);
    expect(song.lyrics).toBe('A\nB');

    // 关键断言：栈未被派生记录污染。若中间态被入栈，这一步会停在 'A\nB'（看似没动 = 跳步）
    await history.undo();
    expect(song.lyrics).toBe('A');

    // 重做原路走回，证明栈里仍是三个不同的快照
    await history.redo();
    expect(song.lyrics).toBe('A\nB');
    await history.redo();
    expect(song.lyrics).toBe('A\nB\nC');

    stopCascade();
  });

  /**
   * 派生链「自延迟若干帧才回写」的覆盖表。
   *
   * 实测边界（把 settleReactivePropagation 换回「等两帧」跑本表即可复现）：旧实现覆盖到 2 帧，
   * 从第 3 帧起级联尾部的 recordHistory 落到窗口之外、被记成新的栈项 —— 此时 redo 的下一步已被
   * 顶掉，重做原地不动，即用户看到的「撤销后数据不完整 / 重做失效」。任务边界判据下任意深度都留在窗口内。
   *
   * 用 redo 而不是「再撤销一次」来判定污染：晚到的逃逸记录会被下一次 undo 自己的窗口顺手吞掉，
   * 使「再撤销一次」的断言对 3 帧以上的逃逸失明（只有 redo 会稳定暴露多出来的栈项）。
   */
  it.each([1, 2, 3, 6])('派生链自延迟 %i 帧时仍留在结算窗口内（栈不被污染，重做原路可回）', async depth => {
    const { song, history, edit } = buildHistoryHarness();
    edit('A\nB');
    edit('A\nB\nC');

    let derivedWrites = 0;
    const stopCascade = watch(
      () => song.lyrics,
      async () => {
        // 只在恢复窗口内动作：编辑期的变化不参与（真实形状：本地缓冲 / 异步重算在后续帧才落地）
        if (!history.isUndoRedoAction.value) return;
        for (let i = 0; i < depth; i++) await nextTick();
        derivedWrites++;
        song.capo = 3;
        history.recordHistory();
      },
      { flush: 'pre' }
    );

    await history.undo();
    expect(song.lyrics).toBe('A\nB');
    // 级联确实跑过、且数据侧照常落地，否则断言会退化成「空跑没污染」
    expect(derivedWrites).toBeGreaterThan(0);
    expect(song.capo).toBe(3);

    // 空转若干帧，让自延迟的派生链彻底落地
    for (let i = 0; i < 12; i++) await nextTick();

    // 关键断言：级联尾部的记录调用没有成为新栈项 —— 否则 redo 的下一步已被顶掉，这里会原地不动
    await history.redo();
    expect(song.lyrics).toBe('A\nB\nC');

    stopCascade();
  });

  it('窗口关闭后的独立编辑必须正常入栈（撤销抑制不得越界吞掉后续编辑）', async () => {
    const { song, history, edit } = buildHistoryHarness();
    edit('A\nB');
    await history.undo();
    expect(song.lyrics).toBe('A');
    await nextTick();

    // 撤销之后用户的新编辑：它必须被记录，否则这次 undo 会因栈顶同内容而「看似无效」
    edit('A\nZ');
    await nextTick();
    await history.undo();
    expect(song.lyrics).toBe('A');
  });
});

describe('经 store 公共 API 的多级联撤销（集成）', () => {
  it('派生消费者（幂等回写）在场时，逐次撤销仍逐次落到不同的真实快照', async () => {
    const songStore = useSongStore();
    const chordStore = useChordStore();
    const scoreEditorStore = useScoreEditorStore();

    const chordC: Chord = {
      id: toChordId('c_c'),
      groupId: toGroupId('g1'),
      nameSegments: nameToSegments('C'),
      strings: [
        { fret: -1, preferFlat: false },
        { fret: 3, preferFlat: false },
        { fret: 2, preferFlat: false },
        { fret: 0, preferFlat: false },
        { fret: 1, preferFlat: false },
        { fret: 0, preferFlat: false },
      ],
      fretCount: 4,
      fretOffset: 0,
      tuning: Tuning.STANDARD,
      rootStringIndex: 1,
      createdAt: 100,
      updatedAt: 100,
    };
    chordStore.savedChordsList = [chordC];

    const song = songStore.createSong('多级联撤销');
    song.lyrics = '行1\n行2';
    song.lineIds = ['l1' as LineId, 'l2' as LineId];
    scoreEditorStore.setActiveSong(song.id);
    await nextTick();

    const slotKey = 'line_l1_char_0' as SlotKey;

    // 派生消费者：模拟「行序 / 和弦映射变化后重算并幂等回写」的派生层（真实形状：和弦槽位随行序
    // 重排后，把仍挂在原槽位上的绑定重新落一次）。它走的是**真实的记录入口** setSlotChord。
    // 回写必须是幂等的（同槽同和弦时 store 自己会跳过写入）：否则被撤销掉的绑定会被它绑回去，
    // 与撤销结果互相打架 —— 那是派生层自己的 bug，不是本用例要测的结算窗口
    let derivedRebinds = 0;
    const stopCascade = watch(
      () => scoreEditorStore.activeSong?.chordMap,
      () => {
        derivedRebinds++;
        if (scoreEditorStore.activeSong && lineCharChord(scoreEditorStore.activeSong.chordMap, 'l1', 0) === chordC.id) {
          scoreEditorStore.setSlotChord(slotKey, chordC);
        }
      },
      { flush: 'pre' }
    );

    scoreEditorStore.setSlotChord(slotKey, chordC);
    scoreEditorStore.updateLyrics('行1');
    await nextTick();
    // 派生消费者确实参与过（编辑期与撤销期都会触发），否则本用例是同义反复
    expect(derivedRebinds).toBeGreaterThan(0);

    // 撤销第 1 步：回到 s1（两行歌词 + 和弦仍绑定）
    await scoreEditorStore.undo();
    expect(scoreEditorStore.activeSong?.lyrics).toBe('行1\n行2');
    expect(lineCharChord(scoreEditorStore.activeSong!.chordMap, 'l1', 0)).toBe(chordC.id);

    // 撤销第 2 步：s0 与 s1 只差在和弦绑定上，它必须真的消失。若派生写入在撤销期被误记入栈，
    // 这一步会停在同一个状态（跳步）、和弦仍在
    await scoreEditorStore.undo();
    expect(lineCharChord(scoreEditorStore.activeSong!.chordMap, 'l1', 0)).toBeNull();

    // 重做原路走回 s1
    await scoreEditorStore.redo();
    expect(lineCharChord(scoreEditorStore.activeSong!.chordMap, 'l1', 0)).toBe(chordC.id);

    stopCascade();
  });
});
