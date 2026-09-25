import { describe, expect, it } from 'vitest';

import { FADE_TRANSITION_PROPS, fadeTransition } from '@/platform/utils/dom';
import { mergeTransitionItem } from '@/platform/utils/motion';

/**
 * 独立判据：transition 串里各条目的属性名。
 * 刻意不复用 motion 内部未导出的 splitTransitionItems —— 断言必须独立于被测实现；
 * 且这里的输入（`fadeTransition` 的产出与手写条目）都不含括号，裸逗号分隔与括号感知拆分等价。
 */
const propsOf = (value: string): string[] =>
  value
    .split(',')
    .map(item => item.trim().split(/\s+/)[0] ?? '')
    .filter(Boolean);

describe('mergeTransitionItem：多条目串的逐条合并', () => {
  it('同一批 fade 条目被反复改写时不产生重复（applyFadeOffsetInstantly 的真实形态）', () => {
    // 元素上先有别的指令的过渡，再按「瞬时收起 → 恢复」两连写 fade 条目 ——
    // 第二次写入时 existing 里已经有整套 fade 条目，这才是重复条目的产生条件
    const instant = mergeTransitionItem('height 0.3s ease', fadeTransition(0));
    const merged = mergeTransitionItem(instant, fadeTransition(120));
    const props = propsOf(merged);

    // 每个属性名只应出现一次：旧实现把整串当一条处理，只滤掉首属性 --fade-start，
    // 其余 6 条与 existing 里的同名条目并存（且旧的 0ms 版本还在）
    expect(new Set(props).size).toBe(props.length);
    expect(props).toHaveLength(FADE_TRANSITION_PROPS.length + 1);
    for (const prop of FADE_TRANSITION_PROPS) expect(merged).toContain(`${prop} 120ms ease`);
    expect(merged).toContain('height 0.3s ease');
  });

  it('重复写入是幂等的：串不随调用次数单调膨胀', () => {
    let value = 'height 0.3s ease';
    for (let i = 0; i < 5; i += 1) value = mergeTransitionItem(value, fadeTransition(120));

    expect(propsOf(value)).toHaveLength(FADE_TRANSITION_PROPS.length + 1);
  });

  it('同属性覆盖、他属性原位保留（单条目路径行为不变）', () => {
    const merged = mergeTransitionItem('opacity 0.2s ease, height 0.3s ease', 'height 0.5s ease');
    const props = propsOf(merged);

    expect(new Set(props).size).toBe(props.length);
    expect(merged).toContain('height 0.5s ease');
    expect(merged).not.toContain('height 0.3s ease');
    expect(merged).toContain('opacity 0.2s ease');
  });
});
