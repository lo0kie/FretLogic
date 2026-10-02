/**
 * v-shake 的回归锚点（2026-10-02 新增指令）。
 *
 * 钉住四条契约 —— 它们各自对应一个「改错了不报错、只是看起来怪」的形态：
 *  1. **挂载不抖**：进页面不是一次被拒（令牌在挂载时就有值也不该动）；
 *  2. 令牌变化抖一次、**同令牌重渲染不抖**：Vue 每次重渲染都会走到 `updated`，按对象身份或按
 *     「有值就抖」判都会变成持续抖动；
 *  3. 令牌非法（NaN / 空串）**不记录**：否则「合法 → 非法 → 回到同一个合法值」会白抖一次；
 *  4. 抖动写进宿主的 `style.transform`，收口与卸载都必须**还原宿主原值**（不是清空了事）。
 *
 * 桩说明：`prefersReducedMotion` 由本文件给答案（jsdom 没有 matchMedia），走 `vi.mock` 并保留
 * 模块其余导出 —— vShake 在模块加载期就用同模块的 `compileEasing` 编译默认曲线，不能被替掉。
 * 抖动本身交给 anime.js（rAF）推进，故断言前先等几帧；「不抖」的用例必须等到帧真的跑过再断言，
 * 否则「首帧还没到」与「压根没起抖」区分不开。
 */
import { defineComponent, h, nextTick, ref, withDirectives } from 'vue';

import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { vShake } from '@/platform/directives/animation/vShake';

import type { ShakeBinding } from '@/platform/directives/animation/vShake';

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

/** 挂一个 v-shake 宿主，返回可改令牌的 ref 与宿主元素 */
const mountShake = (initial: ShakeBinding) => {
  const binding = ref<ShakeBinding>(initial);
  const wrapper = mount(defineComponent({ setup: () => () => withDirectives(h('div'), [[vShake, binding.value]]) }));
  return { binding, wrapper, el: wrapper.element as HTMLElement };
};

/** 改令牌并等 Vue 走完一轮更新（指令的 updated 钩子在这里被调用） */
const rebind = async (binding: { value: ShakeBinding }, next: ShakeBinding) => {
  binding.value = next;
  await nextTick();
};

beforeEach(() => {
  env.reduced = false;
});

describe('v-shake', () => {
  it('挂载不抖（令牌在挂载时就有值也不动）', async () => {
    const { el } = mountShake(1);
    await frames(3);
    expect(el.style.transform).toBe('');
  });

  it('令牌变化抖一次，收口后还原宿主原值', async () => {
    const { binding, el } = mountShake(1);

    await rebind(binding, 2);
    await frames(2);
    expect(el.style.transform).toMatch(/^translateX\(-?\d/);

    await vi.waitFor(() => expect(el.style.transform).toBe(''));
  });

  it('同令牌重渲染不抖', async () => {
    const { binding, el } = mountShake(1);

    await rebind(binding, 1);
    await frames(3);
    expect(el.style.transform).toBe('');
  });

  it('令牌非法不记录：合法 → 非法 → 回到同一个合法值，不白抖一次', async () => {
    const { binding, el } = mountShake(1);

    await rebind(binding, Number.NaN);
    await frames(2);
    expect(el.style.transform).toBe('');

    await rebind(binding, 1);
    await frames(3);
    expect(el.style.transform).toBe('');
  });

  it('减弱动效时不抖', async () => {
    env.reduced = true;
    const { binding, el } = mountShake(1);

    await rebind(binding, 2);
    await frames(3);
    expect(el.style.transform).toBe('');
  });

  it('卸载时还原宿主原值（抖动进行中也不留半截偏移）', async () => {
    const { binding, wrapper, el } = mountShake(1);
    el.style.transform = 'rotate(3deg)';

    await rebind(binding, 2);
    await frames(2);
    expect(el.style.transform).toMatch(/^translateX\(/);

    wrapper.unmount();
    expect(el.style.transform).toBe('rotate(3deg)');
  });
});
