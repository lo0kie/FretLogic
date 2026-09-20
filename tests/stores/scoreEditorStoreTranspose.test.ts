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

import type { Chord } from '@/domains/chord/types';
import type { LineId } from '@/domains/score/types';

describe('乐谱编辑器移调与撤销栈 (scoreEditorStore Transpose & Undo)', () => {
  beforeEach(async () => {
    // 重置 kv 镜像（IDB kv 库 + 内存 Map），保证用例间小状态隔离
    await idb.clear('kv');
    await hydrateIdbKv();
    setActivePinia(createPinia());
  });

  it('transposeActiveSong: 移调并在撤销 (undo) 后恢复原调与和弦绑定，重做 (redo) 后重现', async () => {
    const songStore = useSongStore();
    const chordStore = useChordStore();
    const scoreEditorStore = useScoreEditorStore();

    // 准备原和弦 C
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

    // 创建歌曲并设置激活
    const song = songStore.createSong('乐谱移调撤销测试');
    song.lineIds = ['l1' as LineId];
    song.lyrics = '测试歌词';
    song.playKey = 'C';
    song.chordMap.set('l1' as LineId, { char: new Map(), start: [chordC.id], end: [] });

    scoreEditorStore.setActiveSong(song.id);
    await nextTick();
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
});
