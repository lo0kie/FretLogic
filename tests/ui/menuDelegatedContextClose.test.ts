/**
 * 委托式右键菜单的**区域判定**回归锚点：容器里没有触发语义的空白处，右键必须关闭菜单。
 *
 * 背景：列表级单例菜单把 `contextTriggerEl` 报成**整片列表容器**（只有它才有真实尺寸，
 * 内部那个只包默认插槽的包裹层是 `display: contents`、恒为零矩形）。而容器里既有卡片 /
 * 分组头 / 页面盒这类带触发语义的元素，也有行间空白与列表底部留白。修复前 BasePopover 对
 * 右键的「是否在区域内」判据是 `contextTriggerEl.contains(target)` —— 空白处同样为真，
 * 于是右键空白走成：委托 handler 反查不到目标、什么都不做；区域判定又判为「内部」、
 * 不关闭。**两条路都不走，菜单卡在屏幕上不动**，这正是用户报的现象。
 *
 * 修法是让调用方声明「容器里哪些后代才算触发目标」（`contextTriggerSelector`），
 * 判定改为「命中该选择器且在容器内」。本用例钉住三件事，缺一都会静默退化：
 *
 *  ① **空白处 → 关闭**（修复的核心）；
 *  ② **触发元素上 → 不关闭**（右键触发器应复用同一实例换位重开，不是关掉）——
 *     这条同时挡住「改过头成无条件关闭」；
 *  ③ **不给选择器时整片容器仍算内部**（`BaseInput` 搜索面板那类「容器本身就是触发器」的用法
 *     靠这条不变）。
 *
 * 断言对象是**菜单的开关事件**（BaseMenu 的 `close`），不是 DOM 结构或样式 —— 「关没关」
 * 是这条链路的全部可观测结果，结构细节（面板在哪、长什么样）与本次修复无关。
 */
import { nextTick } from 'vue';

import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import BaseMenu from '@/platform/ui/menu/BaseMenu.vue';

import type { MenuItem } from '@/platform/ui/menu/types';
import type { VueWrapper } from '@vue/test-utils';

const ITEMS: MenuItem[] = [{ label: '复制', action: () => {} }];

/** 委托反查与区域判定共用的选择器 —— 真实消费方里这两处必须同源，此处照同一约定写 */
const TRIGGER_SELECTOR = '[data-trigger]';

/** 开了的包装器都留着，用例结束时统一卸载 */
let wrappers: VueWrapper[] = [];

/** 外部容器（真实消费方里它是列表元素，挂在组件外）：一个触发器 + 一块空白 */
const makeContainer = (): HTMLElement => {
  const host = document.createElement('div');
  host.innerHTML = '<div data-trigger><span>卡片</span></div><div data-blank><span>行间空白</span></div>';
  document.body.appendChild(host);
  return host;
};

const mountMenu = (contextTriggerEl: HTMLElement, contextTriggerSelector?: string) => {
  const wrapper = mount(BaseMenu, {
    props: {
      trigger: 'contextmenu' as const,
      items: ITEMS,
      contextTriggerEl,
      ...(contextTriggerSelector === undefined ? {} : { contextTriggerSelector }),
    },
    attachTo: document.body,
  });
  wrappers.push(wrapper);
  return wrapper;
};

/**
 * 挂载结果的类型 —— **不要**写成 `VueWrapper`（那会把泛型落到默认的 `ComponentPublicInstance`，
 * `vm` 上没有 `defineExpose` 暴露的方法，`openMenuAt` 直接报 TS2339）。
 * `mount` 的返回类型里带着 `ComponentExposed<C>`，从 `mountMenu` 的返回值推导才有那几个方法。
 */
type MenuWrapper = ReturnType<typeof mountMenu>;

/** 打开菜单并等它真正进入「已显示」态 —— 外点监听的挂载判据含 isShown，它晚于 model 一拍置真 */
const openMenu = async (wrapper: MenuWrapper): Promise<void> => {
  await wrapper.vm.openMenuAt(10, 20);
  await nextTick();
  await nextTick();
  await nextTick();
};

const closeCount = (wrapper: VueWrapper): number => wrapper.emitted('close')?.length ?? 0;

/** 在容器内某个后代上派发右键（冒泡到 window，命中 BasePopover 的捕获期监听） */
const rightClickOn = (container: HTMLElement, selector: string): void => {
  const target = container.querySelector(selector);
  if (!target) throw new Error(`容器里没有 ${selector}`);
  target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
};

beforeEach(() => {
  wrappers = [];
});

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
  document.body.innerHTML = '';
});

describe('委托式右键菜单的区域判定', () => {
  it('右键容器里没有触发语义的空白处会关闭菜单', async () => {
    const host = makeContainer();
    const wrapper = mountMenu(host, TRIGGER_SELECTOR);

    await openMenu(wrapper);
    expect(closeCount(wrapper), '打开后不应有关闭事件').toBe(0);

    rightClickOn(host, '[data-blank]');
    await nextTick();

    expect(closeCount(wrapper), '右键空白处必须关闭菜单，否则菜单会卡在屏幕上不动').toBe(1);
  });

  it('右键触发元素本身不关闭菜单（应由委托换位重开）', async () => {
    const host = makeContainer();
    const wrapper = mountMenu(host, TRIGGER_SELECTOR);

    await openMenu(wrapper);
    rightClickOn(host, '[data-trigger]');
    await nextTick();

    expect(closeCount(wrapper), '右键触发器是「内部」，不该被外点判定关掉').toBe(0);
  });

  it('嵌套在触发元素里的后代同样算内部（closest 反查，不是只看直接子元素）', async () => {
    const host = makeContainer();
    const wrapper = mountMenu(host, TRIGGER_SELECTOR);

    await openMenu(wrapper);
    // 右键落在触发器内部的 <span> 上 —— 委托 handler 也是 closest 反查，两者必须一致
    rightClickOn(host, '[data-trigger] span');
    await nextTick();

    expect(closeCount(wrapper)).toBe(0);
  });

  it('不给选择器时整片容器都算内部（容器本身就是触发器的用法不受影响）', async () => {
    const host = makeContainer();
    const wrapper = mountMenu(host);

    await openMenu(wrapper);
    rightClickOn(host, '[data-blank]');
    await nextTick();

    expect(closeCount(wrapper), '无选择器是旧口径：容器内一律视为内部').toBe(0);
  });

  it('容器之外依然关闭（区域判定没有被放宽到整页）', async () => {
    const host = makeContainer();
    const wrapper = mountMenu(host, TRIGGER_SELECTOR);

    await openMenu(wrapper);
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    outside.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await nextTick();

    expect(closeCount(wrapper)).toBe(1);
  });
});
