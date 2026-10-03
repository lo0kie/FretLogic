/**
 * `v-note-glide` 的**落位曲线分档**（真实 Chromium）。
 *
 * 为什么必须跑在真实浏览器里：这条补间要按宿主所在的文档读 `:root` 上的 `--bezier-sidebar`
 * 并编译成三次贝塞尔，jsdom 既拿不到自定义属性、也没有真实的帧时序 —— 而本文件钉的正是**帧间速度分布**。
 *
 * 分档的依据是实测出来的（逐帧位移，单格 25px）：
 * - **离散变化**（换和弦，上一段补间已播完）走令牌曲线 —— 首帧吃掉 56%、随后单调减速，是设计要的
 *   「即刻起步 + 单调减速」；
 * - **拖拽中的重定向**走 `linear`。目标是**逐品跳变**的，而减速曲线每次重起都把距离的一大半压进首帧、
 *   尾段几乎不动；下一个品位的跳变到来时又从「几乎不动」骤然回到「一大跳」，逐帧位移于是变成
 *   `13.6 → 5.2 → 2.6 → 1.5 → 0.9 → 0.5 → 0.35 → 6.8 → 7.8` 的**锯齿**（峰谷比 22×）——
 *   观感就是「整排整排切换时一顿一顿」。线性下稳态每帧推进量恒定（实测 2.1~3.4，峰谷比 2.0×）。
 *
 * 下面两条用例分别钉住这两档；把拖拽那一档换回令牌曲线，第二条当场红。
 */
import { defineComponent, h, nextTick, ref, withDirectives } from 'vue';

import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { vNoteGlide } from '@/domains/fretboard/directives/vNoteGlide';

import type { NoteGlideTarget } from '@/domains/fretboard/directives/vNoteGlide';
import type { Ref } from 'vue';

const STEP = 25;
const STRING_COUNT = 6;
/** 拖拽场景里每隔几帧跨一品 */
const STEP_EVERY = 8;
/** 探针页面不加载项目的全局样式表，故用样式表规则（与 tokens.scss 同形）补上令牌 */
const TOKEN_STYLE = ':root{--bezier-sidebar:cubic-bezier(0.2, 0.8, 0.2, 1)}';

const readY = (svg: Element, index: number): number => {
  const child = svg.querySelectorAll('g')[0]?.children[index];
  const raw = (child as SVGGElement | undefined)?.style.transform ?? '';
  const match = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(raw);

  return match ? Number(match[2]) : Number.NaN;
};

const makeHost = (targets: Ref<NoteGlideTarget[]>) =>
  defineComponent({
    setup() {
      return () =>
        h('svg', { width: 200, height: 400 }, [
          withDirectives(
            h(
              'g',
              {},
              Array.from({ length: STRING_COUNT }, (_, i) => h('circle', { cx: 20 + i * 20, cy: 0, r: 5 }))
            ),
            [[vNoteGlide, targets.value]]
          ),
        ]);
    },
  });

/** 跑一段场景，返回逐帧位移（第 0 根弦的 Δy，已滤掉没动的帧） */
const runScenario = async (driveFrames: number, targetAt: (frame: number) => number): Promise<number[]> => {
  const initial: NoteGlideTarget[] = Array.from({ length: STRING_COUNT }, (_, i) => ({ x: 20 + i * 20, y: 0 }));
  const targets = ref<NoteGlideTarget[]>(initial);
  const wrapper = mount(makeHost(targets));
  await nextTick();

  // 采样走** DOM 变更事件**，不走 rAF 轮询。
  //
  // 【为什么不能用 rAF 轮询】指令每帧写一次内联 `transform`（`onUpdate` 里逐个 `writePosition`），
  // 用 MutationObserver 盯 `style` 属性就能拿到**每一次**更新 —— 不多也不少。而轮询是另一条 rAF：
  // 它与动画自己的 rAF 落在同一帧上，但两个回调的先后顺序不保证 —— 某帧读到「anime 还没更新」的
  // 位置时该帧位移为 0，被下面那道过滤滤掉，下一帧就把**两帧的量**记在一起。位置本身是单调的，
  // 抖的是区间宽度，于是逐帧位移出现反弹（CI 上实测报过「前帧 4.19、后帧 6.41」）。
  const deltas: number[] = [];
  let last = readY(wrapper.element, 0);
  const observer = new MutationObserver(() => {
    const y = readY(wrapper.element, 0);
    if (Number.isNaN(y)) return;
    deltas.push(Number((y - last).toFixed(3)));
    last = y;
  });
  observer.observe(wrapper.element.querySelector('g')!, {
    attributes: true,
    attributeFilter: ['style'],
    subtree: true,
  });

  const start = performance.now();
  await new Promise<void>(resolve => {
    let frame = 0;
    const tick = () => {
      const now = performance.now();
      if (frame < driveFrames) {
        const y = targetAt(frame);
        targets.value = initial.map((t, i) => ({ x: t.x, y: i === 0 ? y : 0 }));
      }
      frame++;
      if (now - start < 900) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });

  observer.disconnect();
  wrapper.unmount();

  return deltas.filter(delta => delta > 0.01);
};

let style: HTMLStyleElement;

beforeEach(() => {
  style = document.createElement('style');
  style.textContent = TOKEN_STYLE;
  document.head.append(style);
});

afterEach(() => {
  style.remove();
});

describe('v-note-glide 的落位曲线', () => {
  it('离散变化（换和弦）走令牌曲线：首帧吃掉大半，随后单调减速', async () => {
    const moving = await runScenario(1, () => STEP);

    // 减速段要有若干帧，而不是一帧跳完
    expect(moving.length).toBeGreaterThan(6);

    const sum = (xs: number[]): number => xs.reduce((acc, x) => acc + x, 0);
    const total = sum(moving);

    // 下面三条一律用**相对量**判形状，不写死百分比、也不逐帧比。
    //
    // 【为什么不写死数字】「首帧吃掉 56%」那类数字是某一次探针在某一套采样下的读数：采样方式一换
    // （rAF 轮询 → 监听 DOM 变更）或帧率一变，同一个曲线的首帧占比就会从 56% 落到 40% —— 拿它当
    // 阈值，钉住的是那次探针的运气，不是曲线形状。判据要表达的是「令牌曲线相对 linear 的形状差异」，
    // 那就只能用相对量。
    //
    // 【为什么不逐帧比】逐帧位移是曲线在一个**帧间隔**上的增量，而帧间隔本身在抖（rAF 帧率不稳）：
    // 区间宽一点，增量就反弹回去。位置是单调的，抖的是区间宽度 —— 逐帧单调钉的是采样精度。

    // ① 首帧显著大于平均值。linear 下首帧 ≈ 平均值（比值 ~1），令牌曲线实测 3 倍以上
    const average = total / moving.length;
    expect(moving[0]!).toBeGreaterThan(average * 2);

    // ② 前 1/3 帧吃掉六成以上。linear 下约 1/3，令牌曲线实测八成以上
    const head = moving.slice(0, Math.max(1, Math.ceil(moving.length / 3)));
    expect(sum(head) / total).toBeGreaterThan(0.6);

    // ③ 前半段的位移多于后半段 —— 「随后单调减速」的粗粒度判据，对单帧抖动免疫
    const mid = Math.floor(moving.length / 2);
    expect(sum(moving.slice(0, mid))).toBeGreaterThan(sum(moving.slice(mid)));
  });

  it('拖拽跟手走 linear：稳态每帧推进量基本恒定，没有锯齿', async () => {
    const moving = await runScenario(40, frame => Math.floor(frame / STEP_EVERY) * STEP);

    // 跳过首次离散跳变的那一格（它走令牌曲线、本就该减速），并丢掉末尾落位那一帧
    const steady = moving.slice(STEP_EVERY - 1, -1);
    expect(steady.length).toBeGreaterThan(20);

    // 峰谷比：线性实测 2.0×；换回令牌曲线是 22×（0.35 ↔ 7.8），这一条当场红
    expect(Math.max(...steady) / Math.min(...steady)).toBeLessThan(2.5);

    // 任何一帧都不该吃掉单格的 1/4 —— 那是「一跳」而不是「滑」
    expect(Math.max(...steady)).toBeLessThan(STEP / 4);
  });
});
