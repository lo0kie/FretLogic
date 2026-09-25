/**
 * 折叠体「高度挂起」的回归锚点 —— 内容分批补齐期间不得把每一批都放成一次可见的长高动画。
 *
 * 缺陷形态（2026-09-25 用户实测）：侧栏在打开和弦的分组里刷新，刷新后先看到折叠面板变高、
 * 随后才定位到和弦卡片，同一次刷新呈现两段变化。成因是分块补挂（`useChunkedMount`）每帧
 * 提高一次挂载上限，而折叠体把每次内容高度变化都写成带过渡的 px（`vAutoHeight`），于是
 * 「补齐」被渲染成一段渐次展开；补挂结束后的卡片定位（`.delay-220`）是第二段变化。
 *
 * 挂起期间写 `auto`：高度跟随内容自然流动、不走过渡，内容出现即到位；补齐结束后交回测量路径
 * 写回 px（恢复后续过渡能力）。
 *
 * jsdom 不做布局，`offsetHeight` 恒为 0 —— 而 vAutoHeight 的测量路径把 0 视作无效值退化为
 * `auto`，那会让「挂起」与「未挂起」落成同一个结果、断言变成空跑。故这里给测量目标打上
 * 非零的 `offsetHeight` 桩，把两条分支真正分开。
 */
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import BaseCollapse from '@/platform/ui/collapse/BaseCollapse.vue';

import type { VueWrapper } from '@vue/test-utils';

/** 折叠体（`data-collapse` 的直接子元素后一个，即 v-auto-height 的宿主） */
const bodyEl = (wrapper: VueWrapper) => wrapper.get('[data-collapse] > div:last-child').element as HTMLElement;

/**
 * 把实测高度钉成固定值。jsdom 无布局，`offsetHeight` 恒为 0，而 vAutoHeight 的测量路径把 0
 * 视作无效值退化为 `auto` —— 不桩的话「挂起」与「未挂起」会落成同一个结果，断言变成空跑。
 *
 * 必须在挂载**之前**生效（`mounted` 里就会走一次测量），故直接打在原型上、由用例自行收回。
 */
const withStubbedHeight = (px: number) => {
  const offsetHeight = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(px);
  const scrollHeight = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(px);
  return () => {
    offsetHeight.mockRestore();
    scrollHeight.mockRestore();
  };
};

/** 在被钉住的实测高度下挂载，返回折叠体元素与恢复函数 */
const mountWithHeight = (bodyHold: boolean, px: number, expanded = true) => {
  const restore = withStubbedHeight(px);
  const wrapper = mount(BaseCollapse, { props: { bodyHold, expanded, title: '分组' }, slots: { default: '内容' } });
  return { wrapper, body: bodyEl(wrapper), restore };
};

describe('折叠体的高度挂起', () => {
  it('挂起时写 auto，而不是实测 px', () => {
    const { body, restore } = mountWithHeight(true, 480);

    // 挂起态下无论如何变化都保持 auto：这才是「内容补齐不播放长高动画」的那条不变量
    expect(body.style.height).toBe('auto');
    restore();
  });

  it('未挂起时按实测高度写 px', () => {
    const { body, restore } = mountWithHeight(false, 480);

    // 解除挂起后必须交回测量路径，否则容器永久停在 auto、后续高度变化失去过渡能力
    expect(body.style.height).toBe('480px');
    restore();
  });

  it('挂起期间内容长高不写 px，解除挂起后才落定实测值', async () => {
    const { wrapper, body, restore } = mountWithHeight(true, 120);
    expect(body.style.height).toBe('auto');

    // 内容补齐一批（挂起期）：仍须是 auto —— 写 px 就会变成一次可见的长高过渡
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(480);
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(480);
    await wrapper.setProps({ bodyHold: true });
    expect(body.style.height).toBe('auto');

    // 补齐结束：落定实测高度
    await wrapper.setProps({ bodyHold: false });
    expect(body.style.height).toBe('480px');
    restore();
  });

  it('收起态不受挂起影响，仍然写 0px', () => {
    const { body, restore } = mountWithHeight(true, 480, false);

    // 挂起只针对「展开中、内容未定型」的窗口；收起方向必须照常收缩到 0
    expect(body.style.height).toBe('0px');
    restore();
  });
});
