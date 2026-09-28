/**
 * 「无悬停能力的设备上不显示 hover / focus 触发的提示」的回归锚点（2026-09-27 用户实测：移动端不需要 tooltip）。
 *
 * 缺陷形态：触屏没有 hover，而浏览器会把点按**合成**为 `mouseenter`（Android 还会把焦点交给按钮、
 * 再派发 `focus`），于是每点一下都弹一枚提示。触屏上点按正是主要交互，提示几乎必然盖住内容，
 * 而且**没有任何「移开指针」的动作能把它收掉** —— 得再点别处。
 *
 * 判据是 `(hover: hover)`（见 vTooltip 的 canHover），三条不变量各自钉一个用例：
 *  1. 无悬停能力 → 合成的 `mouseenter` 不弹；有悬停能力 → 照旧悬停即显（防止一刀切把桌面一起关掉）；
 *  2. 无悬停能力 → 点按带来的 `focus` 不弹，但**键盘聚焦照常弹**：判据是 `:focus-visible`，
 *     无障碍路径不能跟着点按一起陪葬；
 *  3. `manual` 模式（程序驱动的读数气泡，如滑块数值）不受影响 —— 触屏上拖滑块正需要它。
 * 另有一条只在触屏上才出现的路径单独覆盖：挂载期的初始 `:hover` 检查 —— 触屏的 `:hover` 会「黏住」
 * （点过的元素保持 hover 直到点别处），不拦的话挂载即弹。
 *
 * 桩说明：jsdom 既没有 `matchMedia`，也不做命中测试（`:hover` / `:focus-visible` 恒为 false），
 * 故这两个查询在本文件里由用例给出答案；`matches` 的包装沿用同目录
 * `vTooltipDisableRecovery.test.ts` 的写法（避免直接引用未绑定的原型方法）。
 */
import { h, withDirectives } from 'vue';

import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { vTooltip } from '@/platform/directives/vTooltip';

import type { TooltipOptions } from '@/platform/directives/vTooltip';
import type { VueWrapper } from '@vue/test-utils';

/** 单例浮层的根节点（尚未显示过时不存在 —— 见 expectHidden） */
const boxEl = () => document.querySelector<HTMLElement>('.v-tooltip-root');

/** 浮层是模块级单例、跨用例存活，故只回收触发元素（unmount 会走立即隐藏那条路径收尾） */
const wrappers: VueWrapper[] = [];

/** 用例给出的「设备是否有悬停能力」——`(hover: hover)` 的桩答案 */
let hoverCapable = true;
/** 用例给出的「宿主是否处于 :hover」——触屏上点过的元素会一直保持它（黏住的 hover） */
let hostHovered = false;
/** 用例给出的「当前焦点是否来自键盘」——`:focus-visible` 的桩答案 */
let keyboardFocus = false;

const nativeMatches = (el: Element, selector: string): boolean => Element.prototype.matches.call(el, selector);

beforeEach(() => {
  hoverCapable = true;
  hostHovered = false;
  keyboardFocus = false;
  // jsdom 不实现 matchMedia：补一个只认 (hover: hover) 的最小实现（其余查询一律 false）
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({ matches: query === '(hover: hover)' && hoverCapable, media: query }),
  });
  vi.spyOn(HTMLElement.prototype, 'matches').mockImplementation(function (this: HTMLElement, selector: string) {
    if (selector === ':hover') return hostHovered;
    if (selector === ':focus-visible') return keyboardFocus;
    return nativeMatches(this, selector);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as Partial<Window>).matchMedia;
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
});

/**
 * 复刻真实消费方形态：指令挂在原生 `<button>` 上（顶栏图标 / 面板按钮都是这个形态）。
 * `attachTo` 是必需项而不是习惯：本文件要触发真实的 `focus` 事件，而 jsdom 对**游离**元素调
 * `focus()` 是空操作（不派发 focus、`activeElement` 也不动），不挂进文档这条用例就永远绿不了。
 */
const mountTip = (binding: TooltipOptions | string = '提示内容'): HTMLButtonElement => {
  const wrapper = mount(
    { setup: () => () => withDirectives(h('button', '动作'), [[vTooltip, binding]]) },
    { attachTo: document.body }
  );
  wrappers.push(wrapper);
  return wrapper.get('button').element as HTMLButtonElement;
};

const enter = (el: HTMLElement) => void el.dispatchEvent(new MouseEvent('mouseenter'));
const waitShown = () => vi.waitFor(() => expect(boxEl()?.style.opacity).toBe('1'));

/**
 * 断言「没显示」之前的等待。默认没有显示延迟，但 `executeShow` 是在 `await updatePosition()`
 * **之后**才写可见性的 —— 只等一个微任务就断言，有可能赶在它写可见性之前落，那样即使判据整个
 * 失效（提示其实弹出来了）用例也照样绿。跨过一个宏任务再落才问得出真答案。
 */
const settle = () => new Promise(resolve => setTimeout(resolve, 50));

/**
 * 断言「没有显示」。浮层是懒建的：从未显示过时节点根本不存在，与「已隐藏」在本判据下同义
 * —— 这里要问的只有「显没显示」，节点存在与否是实现细节。
 */
const expectHidden = () => expect(boxEl()?.style.visibility ?? 'hidden').toBe('hidden');

describe('vTooltip 在无悬停能力的设备上（触屏）', () => {
  it('点按合成的 mouseenter 不弹提示', async () => {
    hoverCapable = false;
    const el = mountTip();
    enter(el);
    await settle();
    expectHidden();
  });

  it('挂载时的黏住 :hover 也不弹（触屏点过的元素会一直保持 hover）', async () => {
    hoverCapable = false;
    hostHovered = true;
    mountTip();
    await settle();
    expectHidden();
  });

  it('点按带来的 focus 不弹，键盘聚焦照常弹', async () => {
    hoverCapable = false;
    const el = mountTip();

    // 触屏点按按钮：Android 会把焦点交给它并派发 focus，但这不是「键盘来的焦点」
    keyboardFocus = false;
    el.focus();
    await settle();
    expectHidden();

    // 键盘 Tab 聚焦：无障碍路径不能跟着点按一起陪葬
    el.blur();
    keyboardFocus = true;
    el.focus();
    await waitShown();
  });

  it('manual 模式的读数气泡不受影响（触屏上拖滑块正需要它）', async () => {
    hoverCapable = false;
    mountTip({ manual: true, visible: true, content: '42%', compact: true });
    await waitShown();
  });
});

describe('vTooltip 在有悬停能力的设备上', () => {
  it('悬停即显（回归锚点：别把桌面一起关掉）', async () => {
    const el = mountTip();
    enter(el);
    await waitShown();
  });
});
