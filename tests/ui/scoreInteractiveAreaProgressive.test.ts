import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ScoreInteractiveArea from '@/domains/score/editor/components/ScoreInteractiveArea.vue';
import ScoreView from '@/domains/score/editor/components/ScoreView.vue';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useSongStore } from '@/domains/score/library/store/songStore';

describe('ScoreInteractiveArea 渐进式视口渲染与按需隔离守卫', () => {
  let pinia: ReturnType<typeof createPinia>;
  beforeEach(() => {
    localStorage.clear();
    pinia = createPinia();
    setActivePinia(pinia);
    vi.restoreAllMocks();
  });

  it('长乐谱（100 行）初次挂载仅渲染前 30 行，点击滚动到底部可展开全量行', async () => {
    const songStore = useSongStore();
    const editor = useScoreEditorStore();

    // 生成 100 行测试乐谱
    const lines = Array.from({ length: 100 }, (_, i) => `歌词第${i + 1}行测试文本`);
    const lineIds = Array.from({ length: 100 }, (_, i) => `line_${i + 1}`);
    const song = songStore.createSong('百行长乐谱');
    songStore.updateSongMeta(song.id, { lyrics: lines.join('\n'), lineIds });

    editor.setActiveSong(song.id);
    editor.activeTab = 'interactive';

    const wrapper = mount(ScoreInteractiveArea, {
      global: {
        plugins: [pinia],
        directives: {
          scrollbar: {},
          wave: {},
        },
        stubs: {
          ChordSlotCell: true,
          ActionButton: true,
          EmptyState: true,
        },
      },
    });
    await wrapper.vm.$nextTick();

    // 首屏渐进渲染断言：初始按批次挂载（测试环境 MockIntersectionObserver 在 observe 时自动触发一次，渲染至 60 行，仍未全量渲染）
    const lineRows = wrapper.findAll('.line-row');
    expect(lineRows).toHaveLength(60);

    // 哨兵元素应在当前渲染窗口末尾存在
    expect(wrapper.find('[aria-hidden="true"].pointer-events-none').exists()).toBe(true);

    // 触发执行「滚动到底部」，应一次性全部展开为 100 行
    await wrapper.vm.handleScrollToBottom();
    await wrapper.vm.$nextTick();

    const allLineRows = wrapper.findAll('.line-row');
    expect(allLineRows).toHaveLength(100);
  });

  it('在编辑歌词 Tab 下切换乐谱时，ScoreInteractiveArea 不会被错误实例化与挂载', async () => {
    const songStore = useSongStore();
    const editor = useScoreEditorStore();

    const songA = songStore.createSong('乐谱A');
    songStore.updateSongMeta(songA.id, { lyrics: '歌词A1\n歌词A2', lineIds: ['la1', 'la2'] });

    const songB = songStore.createSong('乐谱B');
    songStore.updateSongMeta(songB.id, { lyrics: '歌词B1\n歌词B2', lineIds: ['lb1', 'lb2'] });

    editor.setActiveSong(songA.id);
    editor.activeTab = 'edit';

    const wrapper = mount(ScoreView, {
      global: {
        directives: {
          scrollbar: {},
          wave: {},
        },
        stubs: {
          ScoreLyricsEditor: { template: '<div class="lyrics-editor-stub" />' },
          ScoreInteractiveArea: { template: '<div class="interactive-area-stub" />' },
          ScorePreviewPane: { template: '<div class="preview-pane-stub" />' },
          ChordPickerModal: true,
          EmptyState: true,
        },
      },
    });
    await wrapper.vm.$nextTick();

    // 当前处于编辑页，不应存在排列和弦组件
    expect(wrapper.find('.lyrics-editor-stub').exists()).toBe(true);
    expect(wrapper.find('.interactive-area-stub').exists()).toBe(false);

    // 切换至乐谱 B
    editor.setActiveSong(songB.id);
    await wrapper.vm.$nextTick();

    // 编辑页切歌过程中，ScoreInteractiveArea 依然绝对不被挂载或实例化
    expect(wrapper.find('.lyrics-editor-stub').exists()).toBe(true);
    expect(wrapper.find('.interactive-area-stub').exists()).toBe(false);
  });

  it('在排列和弦 Tab 下切换乐谱时，保持组件实例稳定不触发 Transition 重建闪烁，且平滑更新内容', async () => {
    const songStore = useSongStore();
    const editor = useScoreEditorStore();

    const songA = songStore.createSong('乐谱A');
    songStore.updateSongMeta(songA.id, { lyrics: '歌词A1\n歌词A2', lineIds: ['la1', 'la2'] });

    const songB = songStore.createSong('乐谱B');
    songStore.updateSongMeta(songB.id, { lyrics: '歌词B1\n歌词B2', lineIds: ['lb1', 'lb2'] });

    editor.setActiveSong(songA.id);
    editor.activeTab = 'interactive';

    const wrapper = mount(ScoreInteractiveArea, {
      global: {
        plugins: [pinia],
        directives: {
          scrollbar: {},
          wave: {},
        },
        stubs: {
          ChordSlotCell: true,
          ActionButton: true,
          EmptyState: true,
        },
      },
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('歌词A1');

    // 切换到歌曲 B
    editor.setActiveSong(songB.id);
    await wrapper.vm.$nextTick();

    // 应平滑直接呈现 B 的歌词，无需重挂载
    expect(wrapper.text()).toContain('歌词B1');
    expect(wrapper.text()).not.toContain('歌词A1');
  });
});
