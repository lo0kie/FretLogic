import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useSongStore } from '@/stores/songStore';

/**
 * 复现用户上报的跨乐谱联动 bug：
 * 「5 个乐谱，编辑第 1 首的第 2 行，第 2 首及之后的和弦被清空」。
 * 若多首乐谱共享了 chordMap/lineIds 引用，此测试会失败。
 */
describe('歌曲间数据隔离', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('新建的两首乐谱不共享 chordMap/lineIds 引用', () => {
    const store = useSongStore();
    const s1 = store.createSong('S1');
    const s2 = store.createSong('S2');
    expect(s1).not.toBe(s2);
    expect(s1.chordMap).not.toBe(s2.chordMap);
    expect(s1.lineIds).not.toBe(s2.lineIds);
  });

  it('编辑第 1 首的第 2 行歌词，不影响第 2 首的和弦', () => {
    const store = useSongStore();
    const editor = useScoreEditorStore();

    const s1 = store.createSong('S1');
    const s2 = store.createSong('S2');

    store.updateSongMeta(s1.id, { lyrics: '第一行\n第二行', lineIds: ['l1', 'l2'] });
    store.updateSongMeta(s2.id, { lyrics: '甲行\n乙行', lineIds: ['a1', 'a2'] });

    // 给第 2 首摆一个和弦（作为"应被保留"的观测点）
    store.setCharChord(s2.id, 'line_a1_char_0', 'c1');
    const s2ChordMapBefore = new Map(s2.chordMap);
    expect(s2ChordMapBefore.size).toBeGreaterThan(0);

    // 切到第 1 首，编辑第 2 行（真实歌词编辑路径：matchLineIds + garbageCollectChordMap）
    editor.setActiveSong(s1.id);
    editor.updateLyrics('第一行\n第二行X');

    // 第 2 首的和弦必须原样保留
    expect(s2.chordMap.get('line_a1_char_0')).toBe('c1');

    // 触发落盘后，第 2 首在 localStorage 里的条目也必须原样保留
    store.flushSongsNow();
    const persistedS2 = JSON.parse(localStorage.getItem(`CHORD_LAB_SONG_ENTRY_V1:${s2.id}`) ?? '{}');
    expect(persistedS2.chordMap?.['line_a1_char_0']).toBe('c1');
  });

  it('切歌后防抖挂起的旧歌词仍应写回原歌，而非串写到当前歌曲并清空其和弦', () => {
    const store = useSongStore();
    const editor = useScoreEditorStore();

    const s1 = store.createSong('S1');
    const s2 = store.createSong('S2');
    store.updateSongMeta(s1.id, { lyrics: '第一行\n第二行', lineIds: ['l1', 'l2'] });

    // 给第 2 首摆和弦并激活，模拟"正在编辑第 1 首时不落盘就切到第 2 首"
    store.updateSongMeta(s2.id, { lyrics: '甲行\n乙行', lineIds: ['a1', 'a2'] });
    store.setCharChord(s2.id, 'line_a1_char_0', 'c1');
    editor.setActiveSong(s2.id);

    // 旧 bug：挂起回调此时若以"当前激活歌曲"为提交对象，会把第 1 首的歌词写进第 2 首，
    // 随之 garbageCollectChordMap 清空第 2 首和弦。修复后必须按调度时锁定的 s1 定向提交。
    editor.updateLyrics('第一行\n第二行X', s1.id);

    // 第 1 首歌词更新
    expect(s1.lyrics).toBe('第一行\n第二行X');
    // 第 2 首歌词与和弦都保持原样
    expect(s2.lyrics).toBe('甲行\n乙行');
    expect(s2.chordMap.get('line_a1_char_0')).toBe('c1');

    store.flushSongsNow();
    const persistedS2 = JSON.parse(localStorage.getItem(`CHORD_LAB_SONG_ENTRY_V1:${s2.id}`) ?? '{}');
    expect(persistedS2.chordMap?.['line_a1_char_0']).toBe('c1');
  });
});
