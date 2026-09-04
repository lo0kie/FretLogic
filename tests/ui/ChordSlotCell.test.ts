import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import ChordSlotCell from '@/domains/score/editor/components/ChordSlotCell.vue';

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
  fretOffset: 0,
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
      props: { slotKey: 'line_l1_char_0', variant: 'char', char: 'C' },
      global: globalStubs,
    });
    expect(wrapper.attributes('data-slot-key')).toBe('line_l1_char_0');
    expect(wrapper.find('.chord-display-slot').exists()).toBe(true);
  });

  it('点击触发 click 事件', async () => {
    const wrapper = mount(ChordSlotCell, {
      props: { slotKey: 'line_l1_char_0', variant: 'char' },
      global: globalStubs,
    });
    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
  });

  it('edge 槽位带和弦时渲染 chord-display-slot', () => {
    const wrapper = mount(ChordSlotCell, {
      props: { slotKey: 'line_l1_start_0', variant: 'edge', chord },
      global: globalStubs,
    });
    // 重构后改用 Tailwind 工具类，不再有 edge-slot/has-edge-chord 这类语义 class；
    // 稳定结构：始终渲染 chord-display-slot，且带和弦时内含 inline-fretboard-card
    expect(wrapper.find('.chord-display-slot').exists()).toBe(true);
    expect(wrapper.find('.inline-fretboard-card').exists()).toBe(true);
  });

  it('add 槽位渲染添加按钮样式', () => {
    const wrapper = mount(ChordSlotCell, {
      props: {
        slotKey: 'line_l1_start_0',
        variant: 'add',
        addPlaceholderTitle: '点击添加行首和弦',
      },
      global: globalStubs,
    });
    // 重构后 add 变体不再有 add-btn-slot 语义 class；稳定结构为 chord-display-slot 内含带 Plus 图标的占位按钮
    expect(wrapper.find('.chord-display-slot').exists()).toBe(true);
    expect(wrapper.find('.chord-display-slot span').exists()).toBe(true);
  });
});
