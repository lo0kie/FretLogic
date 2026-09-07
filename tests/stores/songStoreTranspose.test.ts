// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { toChordId, toGroupId } from '@/domains/chord/theory/entityFactories';
import { nameToSegments, Tuning } from '@/domains/chord/theory/theory';
import { useSongStore } from '@/domains/score/library/store/songStore';

import type { Chord, ChordId } from '@/domains/chord/types';
import type { LineId, SlotKey } from '@/domains/score/types';

describe('歌曲移调动作 (songStore.transposeSong & transposeSongCapo)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('transposeSong: 移调 playKey 并换算 chordMap 中和弦引用', () => {
    const songStore = useSongStore();
    const song = songStore.createSong('移调测试曲');

    const chordC: Chord = {
      id: toChordId('c_c'),
      groupId: toGroupId('g1'),
      nameSegments: nameToSegments('C'),
      strings: [
        [-1, false],
        [3, false],
        [2, false],
        [0, false],
        [1, false],
        [0, false],
      ],
      fretCount: 4,
      fretOffset: 0,
      tuning: Tuning.STANDARD,
      rootStringIndex: 1,
      createdAt: 100,
      updatedAt: 100,
    };

    const chordD: Chord = {
      id: toChordId('c_d'),
      groupId: toGroupId('g1'),
      nameSegments: nameToSegments('D'),
      strings: [
        [-1, false],
        [-1, false],
        [0, false],
        [2, false],
        [3, false],
        [2, false],
      ],
      fretCount: 4,
      fretOffset: 0,
      tuning: Tuning.STANDARD,
      rootStringIndex: 2,
      createdAt: 100,
      updatedAt: 100,
    };

    const library = new Map<ChordId, Chord>([
      [chordC.id, chordC],
      [chordD.id, chordD],
    ]);

    const slotKey = 'line_l1_start_0' as SlotKey;
    song.lineIds = ['l1' as LineId];
    song.chordMap.set(slotKey, chordC.id);
    song.playKey = 'C';

    // 移调 +2 半音 (C -> D)
    songStore.transposeSong(song.id, 2, {
      chordResolver: id => library.get(id),
      chordFinder: targetName => (targetName === 'D' ? chordD : undefined),
    });

    const updated = songStore.songs.find(s => s.id === song.id)!;
    expect(updated.playKey).toBe('D');
    expect(updated.chordMap.get(slotKey)).toBe(chordD.id);
  });

  it('transposeSongCapo: 增减变调夹品位并 clamp 在 [0, 12]', () => {
    const songStore = useSongStore();
    const song = songStore.createSong('Capo测试');
    song.capo = 2;

    songStore.transposeSongCapo(song.id, 3);
    let updated = songStore.songs.find(s => s.id === song.id)!;
    expect(updated.capo).toBe(5);

    // 减到负数自动 clamp 为 0
    songStore.transposeSongCapo(song.id, -10);
    updated = songStore.songs.find(s => s.id === song.id)!;
    expect(updated.capo).toBe(0);

    // 超过 12 自动 clamp 为 12
    songStore.transposeSongCapo(song.id, 20);
    updated = songStore.songs.find(s => s.id === song.id)!;
    expect(updated.capo).toBe(12);
  });
});
