// @vitest-environment jsdom
import { nextTick } from 'vue';

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { setupChordScoreBridge } from '@/app/services/chordScoreBridge';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { createChord } from '@/domains/chord/theory/entityFactories';
import { nameToSegments, Tuning } from '@/domains/chord/theory/theory';
import { useSongStore } from '@/domains/score/library/store/songStore';
import { lineCharChord } from '@/domains/score/model/scoreModel';
import { idb } from '@/platform/services/storage';
import { hydrateIdbKv } from '@/platform/services/storage/idbKv';

import type { BarreEntity, BarreFret, Chord } from '@/domains/chord/types';
import type { LineId } from '@/domains/score/types';

/** 夹具窄化：lineId 在源码里是 branded string，测试按字面量书写后集中转换一次（每次返回新数组，避免用例间共享引用） */
const toLineIds = (...values: string[]): LineId[] => values.map(v => v as LineId);

/** 夹具窄化：横按品位是 branded BarreFret，按 tests/utils/barre.test.ts 的形态集中转换 */
const barre = (fret: number, fromString: number, toString: number): BarreEntity => ({
  fret: fret as BarreFret,
  fromString,
  toString,
});

const makeChord = (name: string): Chord =>
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
  });

describe('chordScoreBridge：和弦删除/撤销与乐谱槽位解绑的跨域桥接', () => {
  beforeEach(async () => {
    // 重置 kv 镜像（IDB kv 库 + 内存 Map），保证用例间小状态隔离
    await idb.clear('kv');
    await hydrateIdbKv();
    setActivePinia(createPinia());
    setupChordScoreBridge();
  });

  it('删除和弦后，乐谱中的槽位绑定被解绑；撤销恢复后绑定回填', async () => {
    const chordStore = useChordStore();
    const songStore = useSongStore();

    const chord = makeChord('C');
    chordStore.addChord(chord);
    // 撤销历史为 flush:'post'：先等「添加」入史，删除后才存在可撤销的快照
    await nextTick();
    const song = songStore.createSong('测试歌');
    songStore.updateSongMeta(song.id, {
      lyrics: 'ab',
      lineIds: toLineIds('l1'),
      playKey: 'C',
      capo: 0,
      chordMap: new Map([['l1' as LineId, { char: new Map([[0, chord.id]]), start: [], end: [] }]]),
    });

    chordStore.removeChords([chord]);
    const afterDelete = songStore.songs.find(s => s.id === song.id)!;
    expect(lineCharChord(afterDelete.chordMap, 'l1', 0)).toBeNull();

    // chordStore 撤销历史为 flush:'post'，先等删除动作入史，再执行撤销
    await nextTick();
    chordStore.executeUndoRestore();
    const afterUndo = songStore.songs.find(s => s.id === song.id)!;
    expect(lineCharChord(afterUndo.chordMap, 'l1', 0)).toBe(chord.id);
  });

  it('删除未被乐谱引用的和弦时，不影响其它和弦的乐谱绑定', async () => {
    const chordStore = useChordStore();
    const songStore = useSongStore();

    // 对照夹具：绑一条「不会被删」的和弦。原夹具 chordMap 为空、被删和弦从未绑定，
    // 断言 size===0 恒真（把桥接监听整个删掉也是绿），根本测不出「不产生副作用」这一语义
    const bound = makeChord('C');
    const unreferenced = makeChord('G7');
    chordStore.addChord(bound);
    chordStore.addChord(unreferenced);
    // 撤销历史为 flush:'post'：先等「添加」入史，删除后才存在可撤销的快照
    await nextTick();

    const song = songStore.createSong('无引用歌');
    songStore.updateSongMeta(song.id, {
      lyrics: 'ab',
      lineIds: toLineIds('l1'),
      playKey: 'C',
      capo: 0,
      chordMap: new Map([['l1' as LineId, { char: new Map([[0, bound.id]]), start: [], end: [] }]]),
    });

    chordStore.removeChords([unreferenced]);
    await nextTick();
    chordStore.executeUndoRestore();

    const target = songStore.songs.find(s => s.id === song.id)!;
    // 未被删和弦的绑定必须原样在位（桥接不得误伤无关绑定）
    expect(lineCharChord(target.chordMap, 'l1', 0)).toBe(bound.id);
  });

  it('删除分组时，其名下和弦的乐谱绑定同样被解绑', () => {
    const chordStore = useChordStore();
    const songStore = useSongStore();

    const group = chordStore.addGroup('桥接分组');
    const chord = makeChord('Am');
    chord.groupId = group.id;
    chordStore.addChord(chord);
    const song = songStore.createSong('分组歌');
    songStore.updateSongMeta(song.id, {
      lyrics: 'ab',
      lineIds: toLineIds('l1'),
      playKey: 'C',
      capo: 0,
      chordMap: new Map([['l1' as LineId, { char: new Map([[1, chord.id]]), start: [], end: [] }]]),
    });

    chordStore.deleteGroup(group.id);
    const afterDelete = songStore.songs.find(s => s.id === song.id)!;
    expect(lineCharChord(afterDelete.chordMap, 'l1', 1)).toBeNull();
  });

  it('移动和弦到目标分组遇到完全相同指法时自动合并，槽位引用重定向到保留项', () => {
    const chordStore = useChordStore();
    const songStore = useSongStore();

    const sourceGroup = chordStore.addGroup('源分组');
    const targetGroup = chordStore.addGroup('目标分组');

    // 两个同指纹同横按的完全相同和弦，分别位于源/目标分组（id 不同）
    const moved = makeChord('C');
    moved.groupId = sourceGroup.id;
    chordStore.addChord(moved);
    const kept = makeChord('C');
    kept.groupId = targetGroup.id;
    chordStore.addChord(kept);

    // 乐谱绑定的是"将被合并丢弃"的移入项，合并后应重定向到保留项
    const song = songStore.createSong('合并歌');
    songStore.updateSongMeta(song.id, {
      lyrics: 'ab',
      lineIds: toLineIds('l1'),
      playKey: 'C',
      capo: 0,
      chordMap: new Map([['l1' as LineId, { char: new Map([[0, moved.id]]), start: [], end: [] }]]),
    });

    chordStore.moveVariantsByName(sourceGroup.id, 'C', targetGroup.id);

    // 移入的重复项被丢弃，仅剩目标分组原有的完全相同和弦
    const remaining = chordStore.savedChordsList.filter(c => c.groupId === targetGroup.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe(kept.id);

    // 槽位引用被重定向到保留项，而不是变成死引用
    const target = songStore.songs.find(s => s.id === song.id)!;
    expect(lineCharChord(target.chordMap, 'l1', 0)).toBe(kept.id);
  });

  it('移动和弦到目标分组时，指法不同（横按不同）的同名和弦不会误合并', () => {
    const chordStore = useChordStore();
    const songStore = useSongStore();

    const sourceGroup = chordStore.addGroup('源分组2');
    const targetGroup = chordStore.addGroup('目标分组2');

    const moved = makeChord('C');
    moved.groupId = sourceGroup.id;
    moved.barres = [barre(1, 0, 5)];
    chordStore.addChord(moved);
    const kept = makeChord('C');
    kept.groupId = targetGroup.id;
    chordStore.addChord(kept);

    const song = songStore.createSong('横按歌');
    songStore.updateSongMeta(song.id, {
      lyrics: 'ab',
      lineIds: toLineIds('l1'),
      playKey: 'C',
      capo: 0,
      chordMap: new Map([['l1' as LineId, { char: new Map([[0, moved.id]]), start: [], end: [] }]]),
    });

    chordStore.moveVariantsByName(sourceGroup.id, 'C', targetGroup.id);

    // 横按不同不属于"完全相同"，两个和弦都保留，引用不动
    expect(chordStore.savedChordsList.filter(c => c.groupId === targetGroup.id)).toHaveLength(2);
    const target = songStore.songs.find(s => s.id === song.id)!;
    expect(lineCharChord(target.chordMap, 'l1', 0)).toBe(moved.id);
  });
});
