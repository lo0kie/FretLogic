/**
 * v-stagger 的回归锚点（2026-10-02 新增指令）。
 *
 * 钉住四条「改错了不报错、只是看起来怪」的判据：
 *  1. **挂载即播**：现有子元素出现内联 `opacity`（从 0 起）；
 *  2. **新增子元素接着浮入**：靠 MutationObserver 接住 childList，调用方不需要令牌；
 *  3. **减弱动效不写内联**：元素本来就在终态；
 *  4. **收口与卸载都清干净内联值**：留着内联 `opacity` 会盖掉悬停 / 禁用态，留着内联 `transform`
 *     会与 Tailwind 的 `translate-*` / `scale-*` 打架。
 *
 * 桩说明：`prefersReducedMotion` 由本文件给答案（jsdom 没有 matchMedia），走 `vi.mock` 保留模块
 * 其余导出 —— vStagger 在模块加载期就用同模块的 `compileEasing` 编译默认曲线，不能被替掉。
 * 动画由 anime.js（rAF）推进，故断言前先等几帧；等「收口」一律用下面的 `waitForSettle`
 * （`vi.waitFor` 默认的 1s 预算不够 —— 弹簧结算时长本身就有 ~0.95s，原因见该处注释）。
 */
import { defineComponent, h, nextTick, withDirectives } from 'vue';

import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { vStagger } from '@/platform/directives/animation/vStagger';

import type { StaggerBinding } from '@/platform/directives/animation/vStagger';

/** 用例给出的「系统是否要求减弱动效」 */
const env = vi.hoisted(() => ({ reduced: false }));

vi.mock('@/platform/utils/motion', async importOriginal => {
  const actual = await importOriginal<typeof import('@/platform/utils/motion')>();
  return { ...actual, prefersReducedMotion: () => env.reduced };
});

/** 等 n 帧（anime.js 靠 rAF 推进；jsdom 下 rAF 可用） */
const frames = (n: number): Promise<void> =>
  new Promise(resolve => {
    const step = (i: number) => (i >= n ? resolve() : requestAnimationFrame(() => step(i + 1)));
    step(0);
  });

/**
 * 等「本批动画收口」。
 *
 * 【为什么不能用 `vi.waitFor` 的默认预算】收口时机不由配置里的 `duration` 决定：`ease` 是 spring 时，
 * anime.js 用 `ease.settlingDuration` **覆盖** `duration`（anime 内部 `hasSpring ? settlingDuration :
 * duration`），而 `settlingDuration` 是按 stiffness/damping 解算出来的 —— 当前参数（240 / 22）约
 * 0.9s，再叠上 `stagger(40)` 给第二项的延迟，收口落在 ~0.95s。默认预算恰好是 1s，只差 5%：单跑能过，
 * 全量并发 / CI（132 个文件抢 CPU，runner 只有 2 核、rAF 与轮询定时器一起被拖慢）必翻，报出来就是
 * 「`expected '1' to be ''`」—— 看着像清理没生效，其实是等得不够久。
 *
 * 故显式放宽到 10s：本用例断言的是「收口后内联值被清掉」，不是「收口发生在 1s 内」。放宽只影响
 * 失败时多等一会儿，不影响通过时的耗时。
 *
 * 【为什么是 10s 而不是「刚好够」】上面的 ~0.95s 是**单跑**的数字（本文件 4 个用例合计约 3s）。
 * 全量下余量要按**倍数**留而不是按绝对值留：CI 的 runner 只有 2 核，132 个测试文件抢 CPU，rAF 与
 * `vi.waitFor` 的轮询定时器一起被拖慢，实测过的两次失败都出在「预算只比结算时长高一点」这一档
 * （1s 预算对 0.95s 结算，只差 5%）。5s 是 5 倍，10s 是 10 倍 —— 与「慢一个数量级」对齐。
 *
 * 上限由全局 `testTimeout`（`vite.config.ts` 里的 15s）兜住：超时值必须留在它之内，否则用例先被
 * vitest 判超时，报出来的错与「清理没生效」完全是两回事，会把这条锚点带偏。
 */
const waitForSettle = (assertion: () => void): Promise<void> => vi.waitFor(assertion, { timeout: 10000, interval: 25 });

/** 挂一个 v-stagger 宿主：内含两个 `.item` 子元素 */
const mountStagger = (binding: StaggerBinding) => {
  const wrapper = mount(
    defineComponent({
      setup: () => () =>
        withDirectives(h('div', [h('span', { class: 'item' }, 'a'), h('span', { class: 'item' }, 'b')]), [
          [vStagger, binding],
        ]),
    })
  );
  const host = wrapper.element as HTMLElement;
  return { wrapper, host, items: () => Array.from(host.querySelectorAll<HTMLElement>('.item')) };
};

beforeEach(() => {
  env.reduced = false;
});

describe('v-stagger', () => {
  it('挂载即播：子元素出现内联 opacity，收口后清掉', async () => {
    const { items } = mountStagger({ selector: '.item' });

    await frames(2);
    expect(items()[0]!.style.opacity).not.toBe('');

    await waitForSettle(() => expect(items()[0]!.style.opacity).toBe(''));
  });

  it('新增子元素由 MutationObserver 接住，接着浮入', async () => {
    const { host, items } = mountStagger({ selector: '.item' });
    await waitForSettle(() => expect(items()[0]!.style.opacity).toBe(''));

    const added = document.createElement('span');
    added.className = 'item';
    host.append(added);
    await nextTick();
    await frames(2);
    expect(added.style.opacity).not.toBe('');

    await waitForSettle(() => expect(added.style.opacity).toBe(''));
  });

  it('减弱动效时不写内联值', async () => {
    env.reduced = true;
    const { items } = mountStagger({ selector: '.item' });
    await frames(3);
    expect(items()[0]!.style.opacity).toBe('');
    expect(items()[0]!.style.transform).toBe('');
  });

  it('卸载时清掉内联值（动画进行中也不留半截）', async () => {
    const { wrapper, items } = mountStagger({ selector: '.item' });
    await frames(2);
    const el = items()[0]!;
    expect(el.style.opacity).not.toBe('');

    wrapper.unmount();
    expect(el.style.opacity).toBe('');
    expect(el.style.transform).toBe('');
  });
});
