/**
 * BaseSlider 的无障碍回归（vitest-axe）。
 *
 * 为什么这个组件值得专门守：它是全站唯一以 `role="slider"` 暴露的原生角色控件，而它的可访问名称
 * **完全来自 `aria-labelledby`** —— 那个 id 由 `BaseFormRow` 经 `useFormRowLabelId` 注入，
 * `label` prop 渲染出的只是视觉标签、不参与名称计算。也就是说：滑块脱离 FormRow 挂载时
 * `aria-labelledby` 会是 undefined，Vue 连这条属性都不渲染，读屏只会报「滑块」而不报它调的是什么。
 *
 * 所以下面一律**按真实形态挂载**（FormRow 包 Slider）。全仓 7 处使用点（`HeaderConfigPopover` 6 处、
 * `ScorePreviewPane` 1 处）都在 BaseFormRow 内，这正是要锁住的不变量：一旦有人在 FormRow 之外直接
 * 用 BaseSlider，可访问名称就没了 —— 那种形态由本文件的挂载方式之外的地方负责，不在这里断言。
 *
 * 断言口径：只跑 axe 的默认规则集，不手写 aria 属性断言（那等于把实现抄一遍）。
 * 颜色对比度（`color-contrast`）在 jsdom 下无法计算（没有真实布局与计算样式），axe 会自动跳过。
 *
 * 不用 vitest-axe 的 `toHaveNoViolations` matcher —— 0.1.0 的两个入口在本仓库都用不了：
 * `extend-expect` 的产物是**空文件**（打包漏了），而 `matchers.d.ts` 只写了 `export type *`，
 * 在 `verbatimModuleSyntax` 下值导入会被整条擦除、`expect.extend(undefined)` 静默无效。
 * 直接断言 axe 的 `violations` 数组：`axe` runner 本身照常工作，报错时把违规摘要打出来。
 */
import { h } from 'vue';

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import BaseFormRow from '@/platform/ui/form/BaseFormRow.vue';
import BaseSlider from '@/platform/ui/slider/BaseSlider.vue';

const expectNoViolations = async (element: Element): Promise<void> => {
  // 关掉 color-contrast：jsdom 没有真实布局与计算样式，该规则得不出结论，只会去调
  // `HTMLCanvasElement.prototype.getContext`（图标连字检测）—— jsdom 未实现，于是刷一屏
  // "Not implemented" 噪音却拿不到任何判断。对比度属于真实浏览器（Playwright）的检查项。
  const results = await axe(element, { rules: { 'color-contrast': { enabled: false } } });
  expect(
    results.violations.map(violation => `${violation.id}: ${violation.help}（${violation.nodes.length} 处）`)
  ).toEqual([]);
};

/** 按真实形态挂载：FormRow 提供标签 id，Slider 消费它作 `aria-labelledby` */
const mountInFormRow = (sliderProps: Record<string, unknown>) =>
  mount(
    {
      render: () => h(BaseFormRow as never, { label: '音量' }, { default: () => h(BaseSlider as never, sliderProps) }),
    },
    { attachTo: document.body }
  );

describe('BaseSlider 无障碍', () => {
  it('单值形态无 axe 违规', async () => {
    const wrapper = mountInFormRow({ modelValue: 50 });
    await expectNoViolations(wrapper.element);
    wrapper.unmount();
  });

  it('区间形态无 axe 违规', async () => {
    const wrapper = mountInFormRow({ modelValue: [20, 80], range: true });
    await expectNoViolations(wrapper.element);
    wrapper.unmount();
  });

  it('纵向 + 禁用形态无 axe 违规', async () => {
    const wrapper = mountInFormRow({ modelValue: 30, vertical: true, disabled: true });
    await expectNoViolations(wrapper.element);
    wrapper.unmount();
  });
});
