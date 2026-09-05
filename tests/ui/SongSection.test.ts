import { nextTick } from 'vue';

import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import SongSection from '@/domains/score/library/components/SongSection.vue';
import { useSongStore } from '@/domains/score/library/store/songStore';
import type { Song } from '@/domains/score/types';
import type { ContextMenuItem } from '@/platform/ui/context-menu/ContextMenuItems.vue';

const buildSong = (id: string): Song => ({
  id,
  title: `Song-${id}`,
  lyrics: 'la la la',
  lineIds: ['line-1'],
  playKey: 'C',
  capo: 0,
  chordMap: new Map([['line_line-1_char_0', 'chord-1']]),
  version: 1,
});

// 隔离重型依赖：拖拽库与浮层菜单不需要参与本用例
const globalStubs = {
  directives: { 'marquee': {}, 'grid-nav': {}, 'scroll-into-view': {} },
  components: {
    VueDraggable: { template: '<div><slot /></div>' },
    ContextMenu: { template: '<div><slot :is-open="false" /></div>' },
  },
};

describe('SongSection 乐谱菜单', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('切换当前乐谱后，非当前乐谱的「清空和弦」应变为禁用', async () => {
    const songStore = useSongStore();
    const scoreEditor = useScoreEditorStore();
    songStore.overwriteSongs([buildSong('s1'), buildSong('s2')]);
    scoreEditor.setActiveSong('s1');
    await nextTick();

    const wrapper = mount(SongSection, { global: globalStubs });
    const vm = wrapper.vm as unknown as { getSongMenuItems: (song: Song) => ContextMenuItem[] };

    const clearItemDisabled = (song: Song) =>
      vm.getSongMenuItems(song).find(item => item.label === '清空和弦')?.disabled;

    const first = songStore.songs[0]!;
    const second = songStore.songs[1]!;

    // s1 是当前乐谱且有和弦 -> 可点击
    expect(clearItemDisabled(first)).toBe(false);

    scoreEditor.setActiveSong('s2');
    await nextTick();

    // s1 不再是当前乐谱 -> 应禁用
    expect(clearItemDisabled(first)).toBe(true);
    // s2 成为当前乐谱且有和弦 -> 可点击
    expect(clearItemDisabled(second)).toBe(false);
  });

  it('乐谱内没有和弦时「清空和弦」保持禁用', async () => {
    const songStore = useSongStore();
    const scoreEditor = useScoreEditorStore();
    const empty = { ...buildSong('s1'), chordMap: new Map() };
    songStore.overwriteSongs([empty]);
    scoreEditor.setActiveSong('s1');
    await nextTick();

    const wrapper = mount(SongSection, { global: globalStubs });
    const vm = wrapper.vm as unknown as { getSongMenuItems: (song: Song) => ContextMenuItem[] };

    const items = vm.getSongMenuItems(songStore.songs[0]!);

    expect(items.find(item => item.label === '清空和弦')?.disabled).toBe(true);
  });

  it('关闭乐谱再打开时，恢复关闭前的标签页', async () => {
    const songStore = useSongStore();
    const scoreEditor = useScoreEditorStore();
    songStore.overwriteSongs([buildSong('s1')]);

    scoreEditor.setActiveSong('s1');
    scoreEditor.activeTab = 'preview';
    expect(scoreEditor.activeTab).toBe('preview');

    // 关闭乐谱（置空）
    scoreEditor.setActiveSong(null);
    expect(scoreEditor.activeSong).toBeNull();

    // 重新打开乐谱
    scoreEditor.setActiveSong('s1');
    expect(scoreEditor.activeTab).toBe('preview');
  });
});
