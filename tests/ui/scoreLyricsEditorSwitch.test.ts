import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ScoreLyricsEditor from '@/features/score-editor/ScoreLyricsEditor.vue';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useSongStore } from '@/stores/songStore';

// 用 fake timers 控制防抖提交，避免真实 300ms 等待
vi.useFakeTimers();

/**
 * 验证歌词编辑器在切换歌曲时是否真正刷新为"当前激活歌曲"的歌词。
 * 这正是"切歌后编辑器还显示上一首歌词、输入被追加到上一首"的用户可见 bug 的组件级根源。
 */
describe('ScoreLyricsEditor 切换歌曲刷新', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('切到 B 后（ScoreView 以 :key 按 activeSong 重挂载编辑器），新实例应显示 B 的歌词而非残留 A 的歌词', async () => {
    const songStore = useSongStore();
    const editor = useScoreEditorStore();

    const a = songStore.createSong('A');
    songStore.updateSongMeta(a.id, { lyrics: '甲1\n乙1', lineIds: ['la1', 'la2'] });
    const b = songStore.createSong('B');
    songStore.updateSongMeta(b.id, { lyrics: '甲2\n乙2', lineIds: ['lb1', 'lb2'] });

    editor.setActiveSong(a.id);

    // 编辑器实例按当前 activeSong 绑定歌词（与 ScoreView 的 :key 行为一致）
    const wrapperA = mount(ScoreLyricsEditor);
    const textareaA = wrapperA.get('textarea');
    expect((textareaA.element as HTMLTextAreaElement).value).toBe('甲1\n乙1');

    // 切到 B：A 的旧实例被卸载，mounted 一个绑定 B 的新实例
    editor.setActiveSong(b.id);
    wrapperA.unmount();
    await wrapperA.vm.$nextTick();

    const wrapperB = mount(ScoreLyricsEditor);
    expect((wrapperB.get('textarea').element as HTMLTextAreaElement).value).toBe('甲2\n乙2');
  });

  it('切歌后编辑当前歌，不应把上一首歌的歌词写入当前歌，也不该动上一首歌的任何数据', async () => {
    const songStore = useSongStore();
    const editor = useScoreEditorStore();

    const a = songStore.createSong('A');
    songStore.updateSongMeta(a.id, { lyrics: '甲1\n乙1', lineIds: ['la1', 'la2'] });
    // 给 A（被离开的歌）摆一个和弦，作为"不被污染"的观测点
    songStore.setCharChord(a.id, 'line_la1_char_0', 'c1');
    const b = songStore.createSong('B');
    songStore.updateSongMeta(b.id, { lyrics: '甲2\n乙2', lineIds: ['lb1', 'lb2'] });

    editor.setActiveSong(b.id);
    const wrapper = mount(ScoreLyricsEditor);

    // 在 B 上清空全部歌词（模拟"删掉当前所有歌词"）
    const textarea = wrapper.get('textarea');
    (textarea.element as HTMLTextAreaElement).value = '';
    await textarea.trigger('input');
    vi.advanceTimersByTime(350);
    await wrapper.vm.$nextTick();

    // B 的歌词被清空；A 的歌词与和弦必须原样保留（跨歌串写根因防线）
    const aNow = songStore.songs.find(s => s.id === a.id);
    expect(songStore.songs.find(s => s.id === b.id)?.lyrics).toBe('');
    expect(aNow?.lyrics).toBe('甲1\n乙1');
    expect(aNow?.chordMap.get('line_la1_char_0')).toBe('c1');
  });

  it('在 A 上删空歌词后切到 B，卸载时 flush 必须只动 A（bound 定向），不得清空 B', async () => {
    const songStore = useSongStore();
    const editor = useScoreEditorStore();

    const a = songStore.createSong('A');
    songStore.updateSongMeta(a.id, { lyrics: '甲1\n乙1', lineIds: ['la1', 'la2'] });
    songStore.setCharChord(a.id, 'line_la1_char_0', 'c1');
    const b = songStore.createSong('B');
    songStore.updateSongMeta(b.id, { lyrics: '甲2\n乙2', lineIds: ['lb1', 'lb2'] });

    editor.setActiveSong(a.id);
    const wrapper = mount(ScoreLyricsEditor);

    // 在 A 上"删掉当前所有歌词"：本地文本置空（防抖尚未触发，留给卸载时的 flush）
    const textarea = wrapper.get('textarea');
    (textarea.element as HTMLTextAreaElement).value = '';
    await textarea.trigger('input');

    // 模拟 ScoreView 按 activeSong 用 :key 重挂载：切到 B 后旧编辑器被卸载，
    // 此刻 live activeSongId 已是 B —— flush 若读 live 值会把 '' 清到 B 上（历史根因）。
    editor.setActiveSong(b.id);
    await wrapper.vm.$nextTick();
    wrapper.unmount();

    // flush 定向到 bound 歌 A：A 被清空，B 的歌词必须原样保留
    expect(songStore.songs.find(s => s.id === a.id)?.lyrics).toBe('');
    expect(songStore.songs.find(s => s.id === b.id)?.lyrics).toBe('甲2\n乙2');
    expect(songStore.songs.find(s => s.id === b.id)?.chordMap.size).toBe(0);
  });
});
