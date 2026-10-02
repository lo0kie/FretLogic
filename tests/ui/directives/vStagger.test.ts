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
 * 动画由 anime.js（rAF）推进，故断言前先等几帧。
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

    await vi.waitFor(() => expect(items()[0]!.style.opacity).toBe(''));
  });

  it('新增子元素由 MutationObserver 接住，接着浮入', async () => {
    const { host, items } = mountStagger({ selector: '.item' });
    await vi.waitFor(() => expect(items()[0]!.style.opacity).toBe(''));

    const added = document.createElement('span');
    added.className = 'item';
    host.append(added);
    await nextTick();
    await frames(2);
    expect(added.style.opacity).not.toBe('');

    await vi.waitFor(() => expect(added.style.opacity).toBe(''));
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
