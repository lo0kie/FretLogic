/**
 * v-draw 的回归锚点（2026-10-02 新增指令）。
 *
 * 这里只覆盖**不依赖 SVG 几何 API** 的两条路径 —— 真正的描边过程要 `getTotalLength()`，jsdom 没有
 * 实现，只能留给 `tests/browser/`（本项目 browser 项目跑真实 Chromium）。故本文件钉的是那两条
 * 「改错了会静默失效」的判据：
 *  1. **减弱动效不写 dash**：`createDrawable` 一旦被调用就会往元素上写 dash 属性，这条守住「压根没调」；
 *  2. **选择器查不到元素时什么都不做**：不抛、不写。
 * 两条都只要求「目标被找到」这一步成立，故用普通元素当靶子即可，不必真造 SVG 线。
 *
 * ⚠️ `once` 同名只播一次**不在本文件测**：它的可观测效果（第二次不写 dash）同样要求
 * `createDrawable` 真的跑起来，而 jsdom 下没有 SVG 几何 API、createDrawable 必然提前失败 ——
 * 此前那条用例把 `env.reduced` 置真来「验证」once，两条断言都恒真，删掉 once 注册表也照绿
 * （2026-10-03 已删除）。该分支的覆盖归 `tests/browser/`。
 *
 * 桩说明：`prefersReducedMotion` 由本文件给答案（jsdom 没有 matchMedia），走 `vi.mock` 保留模块
 * 其余导出 —— vDraw 在模块加载期就用同模块的 `compileEasing` 编译默认曲线，不能被替掉。
 */
import { defineComponent, h, withDirectives } from 'vue';

import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { vDraw } from '@/platform/directives/animation/vDraw';

import type { DrawBinding } from '@/platform/directives/animation/vDraw';

/** 用例给出的「系统是否要求减弱动效」 */
const env = vi.hoisted(() => ({ reduced: false }));

vi.mock('@/platform/utils/motion', async importOriginal => {
  const actual = await importOriginal<typeof import('@/platform/utils/motion')>();
  return { ...actual, prefersReducedMotion: () => env.reduced };
});

/** 挂一个 v-draw 宿主：宿主内自带一个可被 selector 命中的靶子 */
const mountDraw = (binding: DrawBinding) => {
  const wrapper = mount(
    defineComponent({
      setup: () => () => withDirectives(h('div', [h('span', { class: 'draw-target' })]), [[vDraw, binding]]),
    })
  );
  const target = wrapper.element.querySelector('.draw-target')!;
  return { wrapper, target };
};

/** 元素上是否被写过 dash（createDrawable 的唯一痕迹） */
const hasDash = (el: Element): boolean =>
  el.hasAttribute('stroke-dasharray') ||
  el.hasAttribute('stroke-dashoffset') ||
  (el as HTMLElement).style.getPropertyValue('stroke-dasharray') !== '' ||
  (el as HTMLElement).style.getPropertyValue('stroke-dashoffset') !== '';

beforeEach(() => {
  env.reduced = false;
});

describe('v-draw', () => {
  it('减弱动效时不调用 createDrawable（靶子上不出现任何 dash）', () => {
    env.reduced = true;
    const { target } = mountDraw({ selector: '.draw-target' });
    expect(hasDash(target)).toBe(false);
  });

  it('选择器查不到元素时什么都不做', () => {
    const { target } = mountDraw({ selector: '.not-here' });
    expect(hasDash(target)).toBe(false);
  });
});
