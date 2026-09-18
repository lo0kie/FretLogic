// @vitest-environment jsdom
import { nextTick } from 'vue';

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { chordRepository } from '@/domains/chord/model/chordRepository';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { createChord } from '@/domains/chord/theory/entityFactories';
import { nameToSegments, Tuning } from '@/domains/chord/theory/theory';

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
  id: 'g_test',
  name: '测试分组',
  sortRule: 'ROOT_PITCH' as Group['sortRule'],
  createdAt: 100,
  updatedAt: 100,
};

const makeChord = (name: string, id: string): Chord =>
  createChord({
    nameSegments: nameToSegments(name),
    strings: [
      [-1, false],
      [3, false],
      [2, false],
      [0, false],
      [1, false],
      [0, false],
    ] as Chord['strings'],
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
