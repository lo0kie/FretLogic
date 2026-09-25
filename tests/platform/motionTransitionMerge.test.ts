import { describe, expect, it } from 'vitest';

import { FADE_TRANSITION_PROPS, fadeTransition } from '@/platform/utils/dom';
import { mergeTransitionItem } from '@/platform/utils/motion';

/**
 * 独立判据：transition 串里各条目的属性名。
 * 刻意不复用 motion 内部未导出的 splitTransitionItems —— 断言必须独立于被测实现。
 *
 * 括号感知：`var(--x, fallback)` / `cubic-bezier(a, b, c, d)` 的实参里含逗号，
 * 朴素 `split(',')` 会把一个条目切成几个 —— 下面「括号内的逗号」那条用例专门覆盖它，
 * 故这里也按顶层逗号切（与实现同口径，但实现独立）。
 */
const propsOf = (value: string): string[] => {
  const items: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i <= value.length; i++) {
    const ch = value[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if ((ch === ',' && depth === 0) || i === value.length) {
      const part = value.slice(start, i).trim();
      if (part) items.push(part);
      start = i + 1;
    }
  }
  return items.map(item => item.trim().split(/\s+/)[0] ?? '');
};

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

  it('括号内的逗号不当作条目分隔符（v-auto-height 注入的那条 height 过渡的真实形态）', () => {
    // 括号感知是 splitTransitionItems 的**唯一**复杂点，而本文件此前的输入全不含括号
    //（原头注释自陈「裸逗号分隔与括号感知拆分等价」）—— 也就是它从未被执行过。
    // 这里直接用真实形态：vAutoHeight 注入的正是这条（两个 var() 缺省值里各有一个逗号）。
    const injected = 'height var(--duration-base, 0.18s) var(--ease-standard, ease)';

    // ① 同属性覆盖：原条目必须被**整体**替换。朴素 split(',') 会把它切成三段假条目
    //    （属性名分别被读成 `height` / `0.18s)` / `ease)`），只有第一段被换掉，留下两段碎串。
    expect(mergeTransitionItem(injected, 'height 5s')).toBe('height 5s');

    // ② 他属性合入：带 var() 的那条必须**原样**保留在后面
    expect(mergeTransitionItem(injected, 'opacity 1s')).toBe(`${injected}, opacity 1s`);
  });
});
