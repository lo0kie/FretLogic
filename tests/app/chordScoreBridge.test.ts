// @vitest-environment jsdom
import { nextTick } from 'vue';

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { setupChordScoreBridge } from '@/app/services/chordScoreBridge';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { createChord } from '@/domains/chord/theory/entityFactories';
import { nameToSegments, Tuning } from '@/domains/chord/theory/theory';
import { useSongStore } from '@/domains/score/library/store/songStore';
import { charKey } from '@/domains/score/model/scoreModel';

import type { Chord } from '@/domains/chord/types';

const makeChord = (name: string): Chord =>
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
  });

describe('chordScoreBridge：和弦删除/撤销与乐谱槽位解绑的跨域桥接', () => {
  beforeEach(() => {
    localStorage.clear();
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
    const slotKey = charKey('l1', 0);
    songStore.updateSongMeta(song.id, {
      lyrics: 'ab',
      lineIds: ['l1'],
      playKey: 'C',
      capo: 0,
      chordMap: new Map([[slotKey, chord.id]]),
    });

    chordStore.removeChords([chord]);
    const afterDelete = songStore.songs.find(s => s.id === song.id)!;
    expect(afterDelete.chordMap.has(slotKey)).toBe(false);

    // chordStore 撤销历史为 flush:'post'，先等删除动作入史，再执行撤销
    await nextTick();
    chordStore.executeUndoRestore();
    const afterUndo = songStore.songs.find(s => s.id === song.id)!;
    expect(afterUndo.chordMap.get(slotKey)).toBe(chord.id);
  });

  it('删除未被乐谱引用的和弦时，桥接不产生副作用', () => {
    const chordStore = useChordStore();
    const songStore = useSongStore();

    const song = songStore.createSong('无引用歌');
    songStore.updateSongMeta(song.id, {
      lyrics: 'ab',
      lineIds: ['l1'],
      playKey: 'C',
      capo: 0,
      chordMap: new Map(),
    });

    chordStore.removeChords([makeChord('G7')]);
    chordStore.executeUndoRestore();

    const target = songStore.songs.find(s => s.id === song.id)!;
    expect(target.chordMap.size).toBe(0);
  });

  it('删除分组时，其名下和弦的乐谱绑定同样被解绑', () => {
    const chordStore = useChordStore();
    const songStore = useSongStore();

    const group = chordStore.addGroup('桥接分组');
    const chord = makeChord('Am');
    chord.groupId = group.id;
    chordStore.addChord(chord);
    const song = songStore.createSong('分组歌');
    const slotKey = charKey('l1', 1);
    songStore.updateSongMeta(song.id, {
      lyrics: 'ab',
      lineIds: ['l1'],
      playKey: 'C',
      capo: 0,
      chordMap: new Map([[slotKey, chord.id]]),
    });

    chordStore.deleteGroup(group.id);
    const afterDelete = songStore.songs.find(s => s.id === song.id)!;
    expect(afterDelete.chordMap.has(slotKey)).toBe(false);
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
    const slotKey = charKey('l1', 0);
    songStore.updateSongMeta(song.id, {
      lyrics: 'ab',
      lineIds: ['l1'],
      playKey: 'C',
      capo: 0,
      chordMap: new Map([[slotKey, moved.id]]),
    });

    chordStore.moveVariantsByName(sourceGroup.id, 'C', targetGroup.id);

    // 移入的重复项被丢弃，仅剩目标分组原有的完全相同和弦
    const remaining = chordStore.savedChordsList.filter(c => c.groupId === targetGroup.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe(kept.id);

    // 槽位引用被重定向到保留项，而不是变成死引用
    const target = songStore.songs.find(s => s.id === song.id)!;
    expect(target.chordMap.get(slotKey)).toBe(kept.id);
  });

  it('移动和弦到目标分组时，指法不同（横按不同）的同名和弦不会误合并', () => {
    const chordStore = useChordStore();
    const songStore = useSongStore();

    const sourceGroup = chordStore.addGroup('源分组2');
    const targetGroup = chordStore.addGroup('目标分组2');

    const moved = makeChord('C');
    moved.groupId = sourceGroup.id;
    moved.barres = [{ fret: 1, fromString: 0, toString: 5 }];
    chordStore.addChord(moved);
    const kept = makeChord('C');
    kept.groupId = targetGroup.id;
    chordStore.addChord(kept);

    const song = songStore.createSong('横按歌');
    const slotKey = charKey('l1', 0);
    songStore.updateSongMeta(song.id, {
      lyrics: 'ab',
      lineIds: ['l1'],
      playKey: 'C',
      capo: 0,
      chordMap: new Map([[slotKey, moved.id]]),
    });

    chordStore.moveVariantsByName(sourceGroup.id, 'C', targetGroup.id);

    // 横按不同不属于"完全相同"，两个和弦都保留，引用不动
    expect(chordStore.savedChordsList.filter(c => c.groupId === targetGroup.id)).toHaveLength(2);
    const target = songStore.songs.find(s => s.id === song.id)!;
    expect(target.chordMap.get(slotKey)).toBe(moved.id);
  });
});
