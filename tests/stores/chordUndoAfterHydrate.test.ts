// @vitest-environment jsdom
import { nextTick } from 'vue';

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { chordRepository } from '@/domains/chord/model/chordRepository';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { createChord, toGroupId } from '@/domains/chord/theory/entityFactories';
import { nameToSegments, Tuning } from '@/domains/chord/theory/theory';
import { GroupSortRule } from '@/domains/chord/types';

import type { Chord, Group } from '@/domains/chord/types';

vi.mock('@/domains/chord/model/chordRepository', async importOriginal => {
  const mod = await importOriginal<typeof import('@/domains/chord/model/chordRepository')>();
  return {
    ...mod,
    chordRepository: {
      load: vi.fn(),
      save: vi.fn(async () => undefined),
    },
  };
});

const testGroup: Group = {
  id: toGroupId('g_test'),
  name: '测试分组',
  sortRule: GroupSortRule.ROOT_PITCH,
  createdAt: 100,
  updatedAt: 100,
};

const makeChord = (name: string, id: string): Chord =>
  createChord({
    nameSegments: nameToSegments(name),
    strings: [
      { fret: -1, preferFlat: false },
      { fret: 3, preferFlat: false },
      { fret: 2, preferFlat: false },
      { fret: 0, preferFlat: false },
      { fret: 1, preferFlat: false },
      { fret: 0, preferFlat: false },
    ],
    fretCount: 3,
    groupId: 'g_test',
    tuning: Tuning.STANDARD,
    rootStringIndex: 5,
    id,
  });

describe('chordStore 撤销历史与水合的时序（删除后撤销不得清空整库）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('水合后首次删除再撤销：恢复的是水合数据快照而非初始空列表', async () => {
    const chordA = makeChord('C', 'chord-a');
    const chordB = makeChord('Am', 'chord-b');
    vi.mocked(chordRepository.load).mockResolvedValue({ groups: [testGroup], chords: [chordA, chordB] });

    const chordStore = useChordStore();
    await chordStore.hydrate();
    expect(chordStore.savedChordsList).toHaveLength(2);

    chordStore.removeChords([chordA]);
    expect(chordStore.savedChordsList).toHaveLength(1);

    // 撤销历史为 flush:'post'：等删除动作入史再撤销
    await nextTick();
    chordStore.executeUndoRestore();

    // 回归断言：修复前 last 快照停留在初始空列表，undo 会把整库清成 []
    expect(chordStore.savedChordsList).toHaveLength(2);
    expect(chordStore.savedChordsList.map(c => c.id).sort()).toEqual(['chord-a', 'chord-b']);
  });
});

describe('chordStore 水合晚到与写回接管', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('水合 await 期间已被 replaceAllData 接管时，晚到的磁盘快照不得覆盖内存（内存是空库也一样）', async () => {
    let resolveLoad!: (snapshot: { groups: Group[]; chords: Chord[] }) => void;
    vi.mocked(chordRepository.load).mockReturnValue(
      new Promise<{ groups: Group[]; chords: Chord[] }>(resolve => {
        resolveLoad = resolve;
      })
    );

    const chordStore = useChordStore();
    const pending = chordStore.hydrate();
    // 窗口期：用户经导入 / 恢复交出一份**空**库（「清空后再恢复」正是这种形态）
    chordStore.replaceAllData({ groups: [], chords: [] });
    resolveLoad({ groups: [testGroup], chords: [makeChord('C', 'disk-c')] });
    await pending;

    // 回归断言：修复前按「列表是否非空」判定接管，空库会放过这次覆盖，用户刚清空的库被磁盘旧内容灌回
    expect(chordStore.groups).toHaveLength(0);
    expect(chordStore.savedChordsList).toHaveLength(0);
  });

  it('窗口期已有本地改动时，晚到的磁盘快照必须与内存改动合并后再落盘', async () => {
    let resolveLoad!: (snapshot: { groups: Group[]; chords: Chord[] }) => void;
    vi.mocked(chordRepository.load).mockReturnValue(
      new Promise<{ groups: Group[]; chords: Chord[] }>(resolve => {
        resolveLoad = resolve;
      })
    );

    const chordStore = useChordStore();
    const pending = chordStore.hydrate();
    // 窗口期：内存是空初值，用户只能新建（新 id），无从编辑或删除磁盘上的记录
    chordStore.addChord(makeChord('G', 'window-c'));
    resolveLoad({ groups: [testGroup], chords: [makeChord('C', 'disk-c')] });
    await pending;
    await nextTick();

    // 合并：磁盘的与窗口期的都在
    expect(chordStore.savedChordsList.map(c => c.id).sort()).toEqual(['disk-c', 'window-c']);
    expect(chordStore.groups.map(g => g.id)).toEqual(['g_test']);

    // 关键的一半：送进 save 的快照必须含磁盘记录。原实现「跳过赋值 + 直接落盘」只送内存那几条，
    // 而 save 的删除判据是「上一次落库镜像里有、本次快照里没有 ⇒ delete」——镜像刚由 load()
    // 用磁盘快照填满，于是那一次落盘会把磁盘上内存里没有的记录全部删掉（落盘即清库）。
    const persisted = vi.mocked(chordRepository.save).mock.calls.at(-1)?.[0];
    expect(persisted?.chords.map(c => c.id).sort()).toEqual(['disk-c', 'window-c']);

    // 另一半（本用例真正的回归点）：合并同样是一次「水合写入」，不得在撤销栈里留下任何能退回
    // 合并前状态的入口。修复前这条分支既没 pauseHistory 也没 commit + clear —— 合并赋值本身被
    // useRefHistory 记成撤销点、last 快照又停在初值 []，用户此后第一次点撤销会把内存库退到
    // 「窗口期那一条」甚至空库，随后落盘即真删。
    chordStore.executeUndoRestore();
    expect(chordStore.savedChordsList.map(c => c.id).sort()).toEqual(['disk-c', 'window-c']);
  });
});
