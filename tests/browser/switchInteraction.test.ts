/// <reference types="@vitest/browser/providers/playwright" />
/**
 * 开关的**真实指针**交互（Chromium）。
 *
 * 为什么必须在真机跑：开关的滑槽形态有一整套自研手势（指针捕获、拖拽过半结算、拖拽收尾那次 click
 * 必须吞掉、`setPointerCapture` 需要真实指针）。jsdom 下 PointerEvent 是仿的、捕获会抛
 * `NotFoundError`、浏览器也不会在 mouseup 后补一次 click —— 也就是说这条链路上最容易坏的一环
 * （「拖完又切一次，值弹回原处」）在 jsdom 里根本没有发生的条件。
 *
 * 拖拽用 CDP 派发**真实鼠标事件**：合成 PointerEvent 无法让 `setPointerCapture` 成功，
 * 而捕获失败会让整条手势链路走上另一条分支（自愈），测的就不是真实路径了。
 *
 * ⚠️ 首次运行需要浏览器二进制：`npx playwright install chromium`；单跑 `pnpm test:browser`。
 *
 * 首行的 `/// <reference>` 不可删：`@vitest/browser` 的 `CDPSession` 是个**空接口**，
 * 它的方法（`send` / `on` / `once` / `off`）由 provider 的类型增强补上 —— 不引这一行，
 * `cdp().send(...)` 在 `tsconfig.tests.json` 下就是「属性不存在」。
 */
import { nextTick } from 'vue';

import { cdp } from '@vitest/browser/context';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import BaseSwitch from '@/platform/ui/switch/BaseSwitch.vue';

/** 挂一个带文字标签的开关（有标签 ⇒ 按钮够宽，拖拽终点仍落在按钮内、mouseup 后浏览器会补一次 click） */
const mountSwitch = () => {
  const updates: boolean[] = [];
  // 泛型组件的 `update:modelValue` 载荷是 `string | number | boolean` 的联合，用例只关心开关的
  // 布尔语义，故收下后统一折算成 boolean（本用例里它只会是 true / false）
  const wrapper = mount(BaseSwitch, {
    props: { 'label': '自动横按', 'modelValue': false, 'onUpdate:modelValue': v => updates.push(Boolean(v)) },
    attachTo: document.body,
  });
  return { wrapper, updates };
};

/** 元素中心在**页面视口**里的坐标（CDP 的坐标是页面级的，而用例跑在 iframe 里，需补上 iframe 偏移） */
const pageCenterOf = (el: HTMLElement) => {
  const box = el.getBoundingClientRect();
  const frame = window.frameElement?.getBoundingClientRect();
  return {
    x: Math.round(box.left + box.width / 2 + (frame?.left ?? 0)),
    y: Math.round(box.top + box.height / 2 + (frame?.top ?? 0)),
  };
};

/**
 * 派发一次 CDP 鼠标事件：`type` / 坐标 / 按键数 / 连击数**逐项给**，不叫调用方自己拼一个对象。
 *
 * 原先这里是 `(params: Record<string, unknown>) => cdp().send('Input.dispatchMouseEvent', params as never)`
 * —— 形状被 `as never` 整个绕过：少一个字段、多一处拼写错误都不会有人发现，协议一升级也无从知道。
 * 而这三个事件真正用到的字段只有下面这几个，写在签名上既是文档也是校验。
 *
 * 断言去掉之后，形状由 provider 的类型增强（见文件头的 `/// <reference>`）兜着 ——
 * 对不上就在这里当场报出来，而不是推到运行时才发现事件没生效。
 */
const mouseEvent = (
  type: 'mousePressed' | 'mouseMoved' | 'mouseReleased',
  x: number,
  y: number,
  buttons: number,
  /** 连击数：只有「按下 / 抬起」用得上（缺省 0 = 移动事件不参与连击计数） */
  clickCount = 0
) => cdp().send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount });

describe('开关的真实指针交互', () => {
  it('点击切换一次', async () => {
    const { wrapper, updates } = mountSwitch();
    const { x, y } = pageCenterOf(wrapper.get<HTMLElement>('.switch-track').element);

    await mouseEvent('mousePressed', x, y, 1, 1);
    await mouseEvent('mouseReleased', x, y, 0, 1);
    await nextTick();

    expect(updates).toEqual([true]);
    wrapper.unmount();
  });

  it('拖拽过半结算为开，且拖拽收尾那次 click 不会二次切换', async () => {
    const { wrapper, updates } = mountSwitch();
    const track = wrapper.get<HTMLElement>('.switch-track').element;
    const { x, y } = pageCenterOf(track);
    // 行程（md 档 16px）的一半是 8px：拖 20px 稳过半，且终点仍在按钮内（按钮含标签，够宽）
    const dragTo = x + 20;

    await mouseEvent('mousePressed', x, y, 1, 1);
    await mouseEvent('mouseMoved', dragTo, y, 1);
    await mouseEvent('mouseReleased', dragTo, y, 0, 1);
    await nextTick();

    // 只切一次：拖拽在 pointerup 结算，紧随其后那次 click 必须被吞掉 ——
    // 不吞的话这里会得到 [true, false]（值弹回原处，肉眼就是「拖完没反应」）
    expect(updates).toEqual([true]);

    wrapper.unmount();
  });
});
