// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { FOCUSABLE_OUTLINE_SELECTOR } from '@/platform/ui/focus-ring/focusRingOverlay';

/**
 * 锁定 `data-focusable-outline` 的**值语义**：只有显式写 `false` 才是关。
 *
 * 为什么要锁：Vue 的布尔绑定在假值时渲染出的是 `="false"`、不是把属性摘掉（只有 `null` / `undefined`
 * 才摘），所以「纯属性选择器」会让 `:data-focusable-outline="someBool"` 关不掉 —— 而失效形态是
 * **静默且双向的**：清原生 outline 的那条规则与画环的那条若判据不一致，元素会既没有原生 outline、
 * 也没有顶层环（聚焦反馈彻底不可见），肉眼只在键盘操作时才发现。
 */
const matches = (html: string): boolean => {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host.firstElementChild!.matches(FOCUSABLE_OUTLINE_SELECTOR);
};

describe('聚焦环目标标记的值语义', () => {
  it.each([
    { label: '只写属性名（空串）算开', html: '<button data-focusable-outline></button>', on: true },
    { label: '显式空串算开', html: '<button data-focusable-outline=""></button>', on: true },
    { label: 'true 算开', html: '<button data-focusable-outline="true"></button>', on: true },
    { label: '显式 false 算关', html: '<button data-focusable-outline="false"></button>', on: false },
    // 白名单会把未知值静默判成关 —— 那类「标记写错 → 聚焦反馈消失」的失效比多画一圈环难查得多
    {
      label: '"0" 不当作关：认的是那一个字符串，不是「看起来像假值」',
      html: '<button data-focusable-outline="0"></button>',
      on: true,
    },
  ])('$label', ({ html, on }) => {
    expect(matches(html)).toBe(on);
  });
});
