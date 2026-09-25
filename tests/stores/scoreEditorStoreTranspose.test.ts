// @vitest-environment jsdom
import { nextTick } from 'vue';

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { useChordStore } from '@/domains/chord/store/chordStore';
import { toChordId, toGroupId } from '@/domains/chord/theory/entityFactories';
import { nameToSegments, Tuning } from '@/domains/chord/theory/theory';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useSongStore } from '@/domains/score/library/store/songStore';
import { idb } from '@/platform/services/storage';
import { hydrateIdbKv } from '@/platform/services/storage/idbKv';
import { wait } from '@/platform/utils/common';

import type { Chord } from '@/domains/chord/types';
import type { LineId } from '@/domains/score/types';

/** 夹具：和弦库里只有一个 C，激活歌曲在 l1 起始槽引用它（库里无目标调指法，移调必然自动新建和弦） */
const seedSongOnChordC = async (title: string) => {
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

  const song = songStore.createSong(title);
  song.lineIds = ['l1' as LineId];
  song.lyrics = '测试歌词';
  song.playKey = 'C';
  song.chordMap.set('l1' as LineId, { char: new Map(), start: [chordC.id], end: [] });

  scoreEditorStore.setActiveSong(song.id);
  await nextTick();
  return { songStore, chordStore, scoreEditorStore, chordC };
};

describe('乐谱编辑器移调与撤销栈 (scoreEditorStore Transpose & Undo)', () => {
  beforeEach(async () => {
    // 重置 kv 镜像（IDB kv 库 + 内存 Map），保证用例间小状态隔离
    await idb.clear('kv');
    await hydrateIdbKv();
    setActivePinia(createPinia());
  });

  it('transposeActiveSong: 移调并在撤销 (undo) 后恢复原调与和弦绑定，重做 (redo) 后重现', async () => {
    const { scoreEditorStore, chordC } = await seedSongOnChordC('乐谱移调撤销测试');
    expect(scoreEditorStore.activeSong?.playKey).toBe('C');

    // 移调 +2 半音 (C -> D)
    scoreEditorStore.transposeActiveSong(2);

    expect(scoreEditorStore.activeSong?.playKey).toBe('D');
    const newChordId = scoreEditorStore.activeSong?.chordMap.get('l1' as LineId)?.start[0];
    expect(newChordId).toBeDefined();
    expect(newChordId).not.toBe(chordC.id);

    // 撤销 undo
    await scoreEditorStore.undo();
    expect(scoreEditorStore.activeSong?.playKey).toBe('C');
    expect(scoreEditorStore.activeSong?.chordMap.get('l1' as LineId)?.start[0]).toBe(chordC.id);

    // 重做 redo
    await scoreEditorStore.redo();
    expect(scoreEditorStore.activeSong?.playKey).toBe('D');
    expect(scoreEditorStore.activeSong?.chordMap.get('l1' as LineId)?.start[0]).toBe(newChordId);
  });

  it('transposeActiveCapo: 变调夹微调并支持 undo/redo', async () => {
    const songStore = useSongStore();
    const scoreEditorStore = useScoreEditorStore();

    const song = songStore.createSong('Capo测试曲');
    song.lyrics = '歌词';
    song.capo = 1;
    scoreEditorStore.setActiveSong(song.id);
    await nextTick();

    scoreEditorStore.transposeActiveCapo(2); // 1 + 2 = 3
    expect(scoreEditorStore.activeSong?.capo).toBe(3);

    await scoreEditorStore.undo();
    expect(scoreEditorStore.activeSong?.capo).toBe(1);

    await scoreEditorStore.redo();
    expect(scoreEditorStore.activeSong?.capo).toBe(3);
  });

  it('移调自动新建的和弦：redo 分支仍在时保留，被新编辑截断后回收', async () => {
    const { chordStore, scoreEditorStore, chordC } = await seedSongOnChordC('回收测试');

    scoreEditorStore.transposeActiveSong(2);
    const createdId = scoreEditorStore.activeSong?.chordMap.get('l1' as LineId)?.start[0];
    expect(chordStore.savedChordsList.some(c => c.id === createdId)).toBe(true);

    await scoreEditorStore.undo();
    // 撤销后该快照仍留在 redo 分支上：再 redo 就要用这个和弦，此刻回收会把用户带回一个坏引用
    expect(chordStore.savedChordsList.some(c => c.id === createdId)).toBe(true);

    // 新一步编辑截断 redo 分支 → 该自动建弦再也无法被任何状态引用，随离栈快照一并回收；原和弦不受影响
    scoreEditorStore.transposeActiveCapo(1);
    await wait();
    expect(chordStore.savedChordsList.some(c => c.id === createdId)).toBe(false);
    expect(chordStore.savedChordsList.some(c => c.id === chordC.id)).toBe(true);
  });

  it('移调自动新建的和弦仍被其他乐谱引用时不回收', async () => {
    const { songStore, chordStore, scoreEditorStore } = await seedSongOnChordC('引用保护测试');
    const created = songStore.createSong('另一首歌');
    // 必须取 store 侧的响应式代理：createSong 返回的是**裸对象**，在它上面写入不过代理，
    // 而「是否仍被别的乐谱引用」读的是 chordReferencesIndex 这个 computed —— 裸对象写入不触发重算，
    // 于是本用例的绿色会退化成「那个 computed 恰好还没被求值过」的巧合（下一行把这条巧合钉死）。
    const otherSong = songStore.songs.find(s => s.id === created.id)!;
    otherSong.lineIds = ['l1' as LineId];
    otherSong.lyrics = '歌词';
    // 先强制引用索引求值一次：此后新引用必须靠响应式触发重算才被看见，不能再靠「还没算过」
    songStore.getChordReferences([]);

    scoreEditorStore.transposeActiveSong(2);
    const createdId = scoreEditorStore.activeSong?.chordMap.get('l1' as LineId)?.start[0];
    expect(createdId).toBeTruthy();
    // 另一首歌也引用了这套新指法（替换整 Map 走不可变更新，与 songStore.setCharChord 的写法一致：
    // 先就地改 Map 内容、再整体换新引用触发响应式）
    otherSong.chordMap.set('l1' as LineId, { char: new Map(), start: [createdId!], end: [] });
    otherSong.chordMap = new Map(otherSong.chordMap);

    await scoreEditorStore.undo();
    scoreEditorStore.transposeActiveCapo(1);
    await wait();
    expect(chordStore.savedChordsList.some(c => c.id === createdId)).toBe(true);
  });
});
