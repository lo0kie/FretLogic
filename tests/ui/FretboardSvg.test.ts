import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import FretboardSvg from '@/domains/fretboard/components/FretboardSvg.vue';

import type { BarreEntity } from '@/domains/fretboard/types';

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
      fretOffset: 0,
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

  it('左侧品号数字精准对齐横向品丝 Y 坐标', () => {
    const wrapper = mountSvg();
    // 查找品号元素
    const fretNumSpans = wrapper.findAll('.z-inner span');
    expect(fretNumSpans.length).toBeGreaterThanOrEqual(4);
    // 1 品品丝在 80 + 1 * 100 = 180px
    expect(fretNumSpans[0]?.attributes('style')).toContain('top: 180px');
    // 2 品品丝在 80 + 2 * 100 = 280px
    expect(fretNumSpans[1]?.attributes('style')).toContain('top: 280px');
    // 3 品品丝在 80 + 3 * 100 = 380px
    expect(fretNumSpans[2]?.attributes('style')).toContain('top: 380px');
  });

  it('当传入已标记横按时渲染淡蓝色横按梁并带有从左到右动画类', () => {
    const wrapper = mountSvg([barre]);
    const barreGroup = wrapper.find('.fretboard-barre-group');
    expect(barreGroup.exists()).toBe(true);
    const rect = barreGroup.find('.fretboard-barre-beam');
    expect(rect.exists()).toBe(true);
    expect(rect.classes()).toContain('barre-slide-in');
    // 已标记横按为淡蓝色背景
    expect(rect.attributes('fill')).toContain('rgba(');
  });

  it('未传入已标记横按但指法满足条件时渲染推导横按（更淡蓝色）', () => {
    const wrapper = mountSvg([]);
    const barreGroup = wrapper.find('.fretboard-barre-group');
    expect(barreGroup.exists()).toBe(true);
    const rect = barreGroup.find('.fretboard-barre-beam');
    expect(rect.exists()).toBe(true);
    expect(rect.classes()).toContain('barre-slide-in');
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
        fretOffset: 0,
        activeBaseStrings: [40, 45, 50, 55, 59, 64],
        isDarkMode: false,
        stringXPositions: [40, 70, 100, 130, 160, 190],
        barres: [],
      },
    });
    const barreGroup = wrapper.find('.fretboard-barre-group');
    expect(barreGroup.exists()).toBe(false);
  });

  it('指法从 xxx222 扩展到 xx2222 时，横按梁复用同一品位节点并挂载 barre-transition 平滑延展', async () => {
    // xxx222: 3, 4, 5 弦按 2 品
    const wrapper = mount(FretboardSvg, {
      props: {
        strings: [
          [-1, false],
          [-1, false],
          [-1, false],
          [2, false],
          [2, false],
          [2, false],
        ] as never,
        fretCount: 5,
        fretOffset: 0,
        activeBaseStrings: [40, 45, 50, 55, 59, 64],
        isDarkMode: false,
        stringXPositions: [40, 70, 100, 130, 160, 190],
        barres: [],
      },
    });

    const rectBefore = wrapper.find('.fretboard-barre-beam');
    expect(rectBefore.exists()).toBe(true);
    expect(rectBefore.classes()).toContain('barre-transition');
    const xBefore = parseFloat(rectBefore.attributes('x') ?? '0');

    // 扩展为 xx2222: 2, 3, 4, 5 弦按 2 品（向左侧扩展一根弦）
    await wrapper.setProps({
      strings: [
        [-1, false],
        [-1, false],
        [2, false],
        [2, false],
        [2, false],
        [2, false],
      ] as never,
    });

    const rectAfter = wrapper.find('.fretboard-barre-beam');
    expect(rectAfter.exists()).toBe(true);
    expect(rectAfter.classes()).toContain('barre-transition');
    const xAfter = parseFloat(rectAfter.attributes('x') ?? '0');

    // 向左扩展后，x 坐标变小（从 3 弦位置向左平滑过渡到 2 弦位置）
    expect(xAfter).toBeLessThan(xBefore);
  });

  it('当品数从 4 品切到 3 品时，外层立即收缩目标高度，内部暂存 4 品网格避免动画闪断', async () => {
    const wrapper = mountSvg();
    await wrapper.setProps({ fretCount: 4 });

    // 4 品时初始内部 SVG 视口高度
    const initialSvgHeight = parseFloat(wrapper.find('svg').attributes('height') ?? '0');

    // 切换为 3 品
    await wrapper.setProps({ fretCount: 3 });

    // 外层容器高度立即变更为 3 品目标高度，触发 CSS transition-[height]
    const containerDiv = wrapper.find('.overflow-y-clip');
    expect(containerDiv.attributes('style')).toContain('height');

    // 在收起动画过渡期间，内部 SVG 视口依然保持 4 品高度，使第 4 品平滑被 overflow 向上裁切收起
    const duringTransitionSvgHeight = parseFloat(wrapper.find('svg').attributes('height') ?? '0');
    expect(duringTransitionSvgHeight).toBe(initialSvgHeight);
  });

  it('单弦添加音符时（0 -> N），音符实体保持恒定，transform 沿弦滑动至对应品位', async () => {
    // 初始状态：第 3 弦为 0 品（空弦）
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
        fretCount: 4,
        fretOffset: 0,
        activeBaseStrings: [40, 45, 50, 55, 59, 64],
        isDarkMode: false,
        stringXPositions: [40, 70, 100, 130, 160, 190],
        barres: [],
      },
    });

    // 一弦一音符持久模型：6 根弦恒定渲染 6 颗 FretboardNote
    const notesBefore = wrapper.findAllComponents({ name: 'FretboardNote' });
    expect(notesBefore.length).toBe(6);

    // 第 3 弦初始为空弦音符，处于空弦坐标 34px
    const noteNodesBefore = wrapper.findAll('.string-note-move');
    expect(noteNodesBefore.length).toBe(6);
    expect(noteNodesBefore[3].attributes('style')).toContain('translate(130px, 34px)');
    expect(notesBefore[3].props('isOpenString')).toBe(true);

    // 单弦变更：第 3 弦按下 2 品
    await wrapper.setProps({
      strings: [
        [-1, false],
        [3, false],
        [2, false],
        [2, false],
        [1, false],
        [0, false],
      ] as never,
    });

    // 音符实体恒为 6 颗，无需销毁或重建 DOM
    const notesAfter = wrapper.findAllComponents({ name: 'FretboardNote' });
    expect(notesAfter.length).toBe(6);

    // 第 3 弦音符平滑移动至 2 品中心位置 (80 + 1.5 * 100 = 230px)，isOpenString 变为 false
    const noteNodesAfter = wrapper.findAll('.string-note-move');
    expect(noteNodesAfter[3].attributes('style')).toContain('translate(130px, 230px)');
    expect(notesAfter[3].props('isOpenString')).toBe(false);
  });

  it('单弦取消音符时（N -> 0），音符实体保持恒定，transform 沿弦滑回空弦基准位置', async () => {
    const wrapper = mount(FretboardSvg, {
      props: {
        strings: [
          [-1, false],
          [3, false],
          [2, false],
          [2, false],
          [1, false],
          [0, false],
        ] as never,
        fretCount: 4,
        fretOffset: 0,
        activeBaseStrings: [40, 45, 50, 55, 59, 64],
        isDarkMode: false,
        stringXPositions: [40, 70, 100, 130, 160, 190],
        barres: [],
      },
    });

    // 初始第 3 弦在 2 品位置 (230px)
    expect(wrapper.findAllComponents({ name: 'FretboardNote' }).length).toBe(6);
    const noteNodesBefore = wrapper.findAll('.string-note-move');
    expect(noteNodesBefore[3].attributes('style')).toContain('translate(130px, 230px)');
    expect(wrapper.findAllComponents({ name: 'FretboardNote' })[3].props('isOpenString')).toBe(false);

    // 单弦取消：第 3 弦变为空弦 (0 品)
    await wrapper.setProps({
      strings: [
        [-1, false],
        [3, false],
        [2, false],
        [0, false],
        [1, false],
        [0, false],
      ] as never,
    });

    // 音符实体未销毁，位置平滑滑回 34px 空弦基准点，且变动的第 3 弦激活 is-moving 过渡类，未变动弦保持静态
    expect(wrapper.findAllComponents({ name: 'FretboardNote' }).length).toBe(6);
    const noteNodesAfter = wrapper.findAll('.string-note-move');
    expect(noteNodesAfter[3].attributes('style')).toContain('translate(130px, 34px)');
    expect(noteNodesAfter[3].classes()).toContain('is-moving');
    expect(noteNodesAfter[1].classes()).not.toContain('is-moving');
    expect(wrapper.findAllComponents({ name: 'FretboardNote' })[3].props('isOpenString')).toBe(true);
  });
});
