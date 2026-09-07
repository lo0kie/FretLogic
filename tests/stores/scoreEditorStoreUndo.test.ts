// @vitest-environment jsdom
import { nextTick } from 'vue';

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { useChordStore } from '@/domains/chord/store/chordStore';
import { toChordId, toGroupId } from '@/domains/chord/theory/entityFactories';
import { nameToSegments, Tuning } from '@/domains/chord/theory/theory';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useSongStore } from '@/domains/score/library/store/songStore';

import type { Chord } from '@/domains/chord/types';
import type { LineId, SlotKey } from '@/domains/score/types';

describe('乐谱编辑器基础撤销栈 (scoreEditorStore Undo & Redo)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('删除单行歌词后，首次点击撤销 (undo) 必须立即生效并恢复该行', async () => {
    const songStore = useSongStore();
    const scoreEditorStore = useScoreEditorStore();

    const song = songStore.createSong('撤销测试曲');
    song.lyrics = '第一行歌词\n第二行歌词\n第三行歌词';
    song.lineIds = ['l1' as LineId, 'l2' as LineId, 'l3' as LineId];
    scoreEditorStore.setActiveSong(song.id);
    await nextTick();

    // 第一次删除行（删除第 2 行）
    scoreEditorStore.updateLyrics('第一行歌词\n第三行歌词');
    expect(scoreEditorStore.activeSong?.lyrics).toBe('第一行歌词\n第三行歌词');

    // 首次撤销：必须直接生效恢复 3 行
    await scoreEditorStore.undo();
    expect(scoreEditorStore.activeSong?.lyrics).toBe('第一行歌词\n第二行歌词\n第三行歌词');

    // 重做：重新变为 2 行
    await scoreEditorStore.redo();
    expect(scoreEditorStore.activeSong?.lyrics).toBe('第一行歌词\n第三行歌词');
  });

  it('连续删除两行歌词后，两次点击撤销按序逐步恢复每一行', async () => {
    const songStore = useSongStore();
    const scoreEditorStore = useScoreEditorStore();

    const song = songStore.createSong('多行删除撤销');
    song.lyrics = '行1\n行2\n行3';
    song.lineIds = ['l1' as LineId, 'l2' as LineId, 'l3' as LineId];
    scoreEditorStore.setActiveSong(song.id);
    await nextTick();

    // 删除行 2 -> 剩余 行1\n行3
    scoreEditorStore.updateLyrics('行1\n行3');
    // 再删行 3 -> 剩余 行1
    scoreEditorStore.updateLyrics('行1');

    expect(scoreEditorStore.activeSong?.lyrics).toBe('行1');

    // 第 1 次撤销：恢复行 3
    await scoreEditorStore.undo();
    expect(scoreEditorStore.activeSong?.lyrics).toBe('行1\n行3');

    // 第 2 次撤销：恢复行 2
    await scoreEditorStore.undo();
    expect(scoreEditorStore.activeSong?.lyrics).toBe('行1\n行2\n行3');
  });

  it('修改和弦槽位 (setSlotChord / removeSlotChord) 首次撤销立即生效', async () => {
    const songStore = useSongStore();
    const chordStore = useChordStore();
    const scoreEditorStore = useScoreEditorStore();

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
    chordStore.savedChordsList = [chordC];

    const song = songStore.createSong('和弦槽位撤销测试');
    song.lyrics = '单行歌词';
    song.lineIds = ['l1' as LineId];
    scoreEditorStore.setActiveSong(song.id);
    await nextTick();

    const slotKey = 'line_l1_char_0' as SlotKey;
    expect(scoreEditorStore.activeSong?.chordMap.get(slotKey)).toBeUndefined();

    // 绑定和弦
    scoreEditorStore.setSlotChord(slotKey, chordC);
    expect(scoreEditorStore.activeSong?.chordMap.get(slotKey)).toBe(chordC.id);

    // 首次撤销：和弦应被移除
    await scoreEditorStore.undo();
    expect(scoreEditorStore.activeSong?.chordMap.get(slotKey)).toBeUndefined();

    // 重做：和弦恢复
    await scoreEditorStore.redo();
    expect(scoreEditorStore.activeSong?.chordMap.get(slotKey)).toBe(chordC.id);

    // 移除和弦
    scoreEditorStore.removeSlotChord(slotKey);
    expect(scoreEditorStore.activeSong?.chordMap.get(slotKey)).toBeUndefined();

    // 首次撤销：和弦应重新出现
    await scoreEditorStore.undo();
    expect(scoreEditorStore.activeSong?.chordMap.get(slotKey)).toBe(chordC.id);
  });
});
