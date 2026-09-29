/**
 * 真实浏览器（Chromium）下的布局相关行为。
 *
 * 为什么这个文件必须跑在真实浏览器里：它断言的是**「内容溢出 → 自绘滚动条出现」**这条链路，
 * 而链路两端在 jsdom 下都是死的 —— `getBoundingClientRect()` 恒为 0、`scrollHeight` / `clientHeight`
 * 也恒为 0，于是 `scrollableY = max(0, scrollHeight - clientHeight)` 永远是 0，指令必然判定
 * 「无可滚动区域」。也就是说这两条用例在 jsdom 里**无论组件对不对都只会得到同一个结果**，
 * 把它们放进 tests/ui 只会得到一个恒绿的假信号。这正是 `tests/setup.ts` 里那句
 * 「jsdom 下不能断言依赖实际尺寸的布局结果……那些场景应改用真实浏览器（Playwright）」指的场景。
 *
 * ⚠️ 首次运行需要浏览器二进制：`npx playwright install chromium`。
 * 本文件不并进 `pnpm test`（`test` 脚本只列 logic + ui 两个 project），单跑 `pnpm test:browser`。
 */
import { h } from 'vue';

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import BaseScrollArea from '@/platform/ui/scroll-area/BaseScrollArea.vue';
import { vEdgeFade } from '@/platform/directives/vEdgeFade';
import { vScrollbar } from '@/platform/directives/vScrollbar';
import { vWheelScroll } from '@/platform/directives/vWheelScroll';

/**
 * BaseScrollArea 的三个指令都由 `main.ts` 在应用启动时全局注册，而测试不跑 `main.ts` ——
 * 不显式挂上就只是「指令不存在」，Vue 会静默跳过它们（连 overlay 都不会创建），
 * 于是断言失败在「找不到滚动条」上，指向的却是错误的原因。
 */
const GLOBAL_DIRECTIVES = {
  'scrollbar': vScrollbar,
  'edge-fade': vEdgeFade,
  'wheel-scroll': vWheelScroll,
} as const;

const CONTAINER_HEIGHT_PX = 100;

/**
 * 等指令把 overlay 建好并跑完一次几何刷新。
 *
 * 指令的刷新走 rAF 节流（见 `useRafThrottle`），且「挂载 → 注入 overflow → 读到真实溢出量 →
 * 建 overlay」之间隔了不止一帧，故连等三帧而不是一帧。
 */
const settle = async (): Promise<void> => {
  for (let frame = 0; frame < 3; frame += 1) await new Promise(resolve => requestAnimationFrame(resolve));
};

/**
 * 挂载一个「外层相对定位容器 + 内层 BaseScrollArea」。
 *
 * 外层刻意带 `position: relative`：自绘滚动条的 overlay 是**宿主的兄弟节点**、挂在宿主父元素上
 * 做绝对定位（见 `resolveOverlayParent` 的注释 —— 绝不能挂在滚动容器内部，否则会跟着内容滚走）。
 * 父元素没有定位上下文时 overlay 的 inset 会退到最近的定位祖先，断言就不成立。
 */
const mountScrollArea = async (contentHeightPx: number) => {
  const wrapper = mount(
    {
      render: () =>
        h('div', { style: 'position: relative; width: 200px' }, [
          h(
            BaseScrollArea as never,
            { style: `height: ${CONTAINER_HEIGHT_PX}px` },
            { default: () => h('div', { style: `height: ${contentHeightPx}px` }) }
          ),
        ]),
    },
    { attachTo: document.body, global: { directives: { ...GLOBAL_DIRECTIVES } } }
  );
  await settle();
  return wrapper;
};

/** 纵向自绘滚动条的拇指；overlay 挂在宿主父元素上，故从外层容器查 */
const verticalThumb = (wrapper: { element: Element }): HTMLElement | null =>
  wrapper.element.querySelector<HTMLElement>('.v-scrollbar-thumb--y');

describe('BaseScrollArea 的滚动条显隐（真实布局）', () => {
  it('内容超出容器高度时，纵向滚动条可见', async () => {
    const wrapper = await mountScrollArea(CONTAINER_HEIGHT_PX * 4);

    const thumb = verticalThumb(wrapper);
    expect(thumb, '内容溢出时应创建纵向滚动条').not.toBeNull();
    // 断 computed style 而不是 class：用户可见与否的判据是渲染结果，不是实现切换了哪个类
    expect(getComputedStyle(thumb!).visibility).toBe('visible');

    // 顺带钉住前提：容器确实处于「可纵向滚动」状态（若这条不成立，上面那条就是碰巧过的）
    const host = wrapper.element.firstElementChild as HTMLElement;
    expect(host.scrollHeight).toBeGreaterThan(host.clientHeight);

    wrapper.unmount();
  });

  it('内容不超出容器高度时，纵向滚动条结构性隐藏', async () => {
    const wrapper = await mountScrollArea(Math.floor(CONTAINER_HEIGHT_PX / 2));

    const thumb = verticalThumb(wrapper);
    expect(thumb, '无溢出时 overlay 仍应在位（只是被隐藏）').not.toBeNull();
    expect(getComputedStyle(thumb!).visibility).toBe('hidden');

    const host = wrapper.element.firstElementChild as HTMLElement;
    expect(host.scrollHeight).toBeLessThanOrEqual(host.clientHeight);

    wrapper.unmount();
  });
});
