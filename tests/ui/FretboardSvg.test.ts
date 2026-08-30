import FretboardSvg from '@/components/fretboard/FretboardSvg.vue';
import type { BarreEntity } from '@/types';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

const candidate: BarreEntity = { fret: 1, fromString: 0, toString: 5, finger: 1 };

const mountSvg = (barreCandidates: BarreEntity[]) =>
  mount(FretboardSvg, {
    props: {
      strings: [
        [1, false],
        [3, false],
        [3, false],
        [2, false],
        [1, false],
        [1, false],
      ] as never,
      fretCount: 5,
      capo: 0,
      activeBaseStrings: [40, 45, 50, 55, 59, 64],
      isDarkMode: false,
      interactive: false,
      stringXPositions: [40, 70, 100, 130, 160, 190],
      showPitchNames: false,
      barrePickMode: true,
      barreCandidates,
    },
  });

describe('FretboardSvg 横按候选拾取', () => {
  it('候选命中区可聚焦且具备按钮语义与可读标签', () => {
    const wrapper = mountSvg([candidate]);
    const hit = wrapper.find('rect[role="button"]');
    expect(hit.exists()).toBe(true);
    expect(hit.attributes('tabindex')).toBe('0');
    expect(hit.attributes('aria-label')).toContain('横按');
  });

  it('Enter / Space / 点击 均派发 barre-click', async () => {
    const wrapper = mountSvg([candidate]);
    const hit = wrapper.find('rect[role="button"]');

    await hit.trigger('keydown', { key: 'Enter' });
    await hit.trigger('keydown', { key: ' ' });
    await hit.trigger('click');

    const clicks = wrapper.emitted('barre-click');
    expect(clicks).toHaveLength(3);
    expect(clicks![0]).toEqual([candidate]);
  });

  it('键盘聚焦时外扩虚线框强调显示，失焦后恢复', async () => {
    const wrapper = mountSvg([candidate]);
    const hit = wrapper.find('rect[role="button"]');
    const dash = wrapper.find('rect[stroke-dasharray]');

    expect(dash.attributes('stroke-opacity')).toBe('0.6');
    await hit.trigger('focus');
    expect(dash.attributes('stroke-opacity')).toBe('1');
    await hit.trigger('blur');
    expect(dash.attributes('stroke-opacity')).toBe('0.6');
  });

  it('无候选时不渲染可聚焦命中区', () => {
    const wrapper = mountSvg([]);
    expect(wrapper.find('rect[role="button"]').exists()).toBe(false);
  });
});
