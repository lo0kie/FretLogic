import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import FretboardSvg from '@/components/fretboard/FretboardSvg.vue';
import type { BarreEntity } from '@/types';

const barre: BarreEntity = { fret: 1, fromString: 0, toString: 5, finger: 1 };

const mountSvg = (barres: BarreEntity[] = []) =>
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
      stringXPositions: [40, 70, 100, 130, 160, 190],
      barres,
    },
  });

describe('FretboardSvg 指板渲染', () => {
  it('正确渲染琴弦与按品音名圆点', () => {
    const wrapper = mountSvg();
    const notes = wrapper.findAllComponents({ name: 'FretboardNote' });
    expect(notes.length).toBe(6);
  });

  it('当传入已标记横按时渲染淡蓝色横按梁', () => {
    const wrapper = mountSvg([barre]);
    const barreGroup = wrapper.find('.fretboard-barre-group');
    expect(barreGroup.exists()).toBe(true);
    const rect = barreGroup.find('.fretboard-barre-beam');
    expect(rect.exists()).toBe(true);
    // 已标记横按为淡蓝色背景
    expect(rect.attributes('fill')).toContain('rgba(');
  });

  it('未传入已标记横按但指法满足条件时渲染推导横按（更淡蓝色）', () => {
    const wrapper = mountSvg([]);
    const barreGroup = wrapper.find('.fretboard-barre-group');
    expect(barreGroup.exists()).toBe(true);
    const rect = barreGroup.find('.fretboard-barre-beam');
    expect(rect.exists()).toBe(true);
    // 未标记横按为虚线描边
    expect(rect.attributes('stroke-dasharray')).toBe('6 4');
  });

  it('无横按指法且无标记时，不渲染横按分组', () => {
    const wrapper = mount(FretboardSvg, {
      props: {
        strings: [
          [-1, false],
          [3, false],
          [2, false],
          [0, false],
          [1, false],
          [0, false],
        ] as never,
        fretCount: 5,
        capo: 0,
        activeBaseStrings: [40, 45, 50, 55, 59, 64],
        isDarkMode: false,
        stringXPositions: [40, 70, 100, 130, 160, 190],
        barres: [],
      },
    });
    const barreGroup = wrapper.find('.fretboard-barre-group');
    expect(barreGroup.exists()).toBe(false);
  });
});
