import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import ChordSlotCell from '@/ui/views/score/ChordSlotCell.vue';

// stub 全局指令与重型依赖
const globalStubs = {
  directives: {
    wave: {},
  },
  components: {
    Fretboard: { template: '<div class="stub-fretboard" />' },
  },
};

const chord = {
  id: 'c1',
  chordName: 'C',
  strings: [
    [-1, false],
    [3, false],
    [2, false],
    [0, false],
    [1, false],
    [0, false],
  ],
  fretCount: 3,
  capo: 0,
  groupId: 'g1',
  tuning: 'STANDARD',
  rootStringIndex: null,
};

describe('ChordSlotCell 谱面槽位', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('char 槽位渲染字符', () => {
    const wrapper = mount(ChordSlotCell, {
      props: { slotKey: 'line_l1_char_0', variant: 'char', char: 'C', isExporting: false },
      global: globalStubs,
    });
    expect(wrapper.attributes('data-slot-key')).toBe('line_l1_char_0');
    expect(wrapper.find('.chord-display-slot').exists()).toBe(true);
  });

  it('点击触发 click 事件', async () => {
    const wrapper = mount(ChordSlotCell, {
      props: { slotKey: 'line_l1_char_0', variant: 'char', isExporting: false },
      global: globalStubs,
    });
    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
  });

  it('edge 槽位带和弦时渲染 chord-display-slot', () => {
    const wrapper = mount(ChordSlotCell, {
      props: { slotKey: 'line_l1_start_0', variant: 'edge', chord, isExporting: false },
      global: globalStubs,
    });
    expect(wrapper.classes()).toContain('edge-slot');
    expect(wrapper.classes()).toContain('has-edge-chord');
  });

  it('add 槽位渲染添加按钮样式', () => {
    const wrapper = mount(ChordSlotCell, {
      props: {
        slotKey: 'line_l1_start_0',
        variant: 'add',
        isExporting: false,
        addPlaceholderTitle: '点击添加行首和弦',
      },
      global: globalStubs,
    });
    expect(wrapper.classes()).toContain('add-btn-slot');
  });
});
