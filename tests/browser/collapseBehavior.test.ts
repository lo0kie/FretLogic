/**
 * 折叠段的**真实布局**行为（Chromium）。
 *
 * 为什么这个文件必须跑在真实浏览器里：折叠体的高度由 `v-auto-height` 按**实测**内容高度写成内联 px，
 * 而 jsdom 的 `offsetHeight` / `scrollHeight` / `getBoundingClientRect()` 恒为 0 —— 在那边
 * 「展开后高度正确」与「完全没量到」是同一个结果，断言只会得到恒绿的假信号（见 `tests/setup.ts`
 * 里那句「jsdom 下不能断言依赖实际尺寸的布局结果……那些场景应改用真实浏览器」）。
 *
 * 这里钉三件事：展开后折叠体高度＝内容高度（内容不被裁）、收起后回到 0、头部按钮的 `aria-controls`
 * 解析得到折叠体（读屏可从标题跳到面板）。
 *
 * 两处刻意的写法：
 * - 内容区用 `unpadded`：内边距会叠在内容高度上，而 padding 档位来自本项目的令牌标度 ——
 *   断言「高度＝内容高度」时不该顺带把令牌标度也钉进去；
 * - 断言分两步：先看指令写下的内联 px（立刻可见），等过渡跑完再看实测高度 —— 只测一次会在
 *   过渡中段读到中间值（真机上第一次写这条用例就踩到了：读到 115px 而不是 180px）。
 *
 * ⚠️ 首次运行需要浏览器二进制：`npx playwright install chromium`。
 * 本文件不并进 `pnpm test`（`test` 脚本只列 logic + ui 两个 project），单跑 `pnpm test:browser`。
 */
import { h } from 'vue';

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import BaseCollapse from '@/platform/ui/collapse/BaseCollapse.vue';
import { vAutoHeight } from '@/platform/directives/animation/vAutoHeight';

import type { VueWrapper } from '@vue/test-utils';

/**
 * `v-auto-height` 由 `main.ts` 在应用启动时全局注册，而测试不跑 `main.ts` —— 不显式挂上就只是
 * 「指令不存在」，Vue 会静默跳过它（高度永远不写），断言失败在「高度是 0」上、指向的却是错误的原因。
 */
const GLOBAL_DIRECTIVES = { 'auto-height': vAutoHeight } as const;

const CONTENT_PX = 180;
/** 高度过渡的时长（令牌 `--duration-base` 的量级）＋余量：等它跑完再量实测高度 */
const TRANSITION_SETTLE_MS = 400;

const mountCollapse = (expanded: boolean) =>
  mount(BaseCollapse, {
    props: { expanded, title: '分组', unpadded: true },
    slots: { default: () => h('div', { style: `height: ${CONTENT_PX}px` }, '内容') },
    attachTo: document.body,
    global: { directives: { ...GLOBAL_DIRECTIVES } },
  });

const bodyEl = (wrapper: VueWrapper) => wrapper.get('[data-collapse] > div:last-child').element as HTMLElement;
const heightOf = (el: HTMLElement) => Math.round(el.getBoundingClientRect().height);

/** 等指令的重测走完：它经 rAF 合帧，且展开态变化后还要一帧才把高度写进去 */
const settle = async (): Promise<void> => {
  for (let frame = 0; frame < 4; frame += 1) await new Promise(resolve => requestAnimationFrame(resolve));
};

describe('折叠段的真实布局', () => {
  it('展开后折叠体高度＝内容高度（内容不被裁），收起后回到 0', async () => {
    const wrapper = mountCollapse(false);
    await settle();
    expect(bodyEl(wrapper).style.height, '收起态应把折叠体压到 0').toBe('0px');

    await wrapper.setProps({ expanded: true });
    await settle();
    const body = bodyEl(wrapper);
    expect(body.style.height, '展开态应写下内容实测高度').toBe(`${CONTENT_PX}px`);

    // 等过渡跑完再量实测高度：过渡中段读到的是中间值
    await new Promise(resolve => setTimeout(resolve, TRANSITION_SETTLE_MS));
    const inner = body.firstElementChild as HTMLElement;
    expect(heightOf(body)).toBe(CONTENT_PX);
    // 前提校验：内容确实有高度（否则上面那条是碰巧过的），且没有被裁剪盒裁掉
    expect(heightOf(inner)).toBe(CONTENT_PX);
    expect(heightOf(inner)).toBeLessThanOrEqual(heightOf(body));

    await wrapper.setProps({ expanded: false });
    await settle();
    expect(bodyEl(wrapper).style.height, '再次收起应回到 0').toBe('0px');

    wrapper.unmount();
  });

  it('头部按钮的 aria-controls 解析得到折叠体', async () => {
    const wrapper = mountCollapse(true);
    await settle();

    const head = wrapper.get('[data-collapse-head]');
    const controls = head.attributes('aria-controls');
    expect(controls, '头部按钮必须给出面板引用').toBeTruthy();

    // 在组件自己的子树里查：`useId` 的 id 按 app 实例计数，同文件里前后两个 wrapper 会拿到同一个
    // 串，用 document.getElementById 可能命中上一个尚未卸载的实例
    expect(wrapper.get(`#${controls}`).element, 'aria-controls 必须解析得到折叠体').toBe(bodyEl(wrapper));

    wrapper.unmount();
  });
});
