import { describe, expect, it } from 'vitest';

import { buildArrowPanelPath } from '@/platform/ui/popover/arrowPanelPath';

import type { ArrowPanelPathInput, ArrowSide } from '@/platform/ui/popover/arrowPanelPath';

/**
 * 轮廓几何的回归测试。这里只钉两类**会静默画错、且肉眼容易漏**的失效：
 *
 * ① 箭头所在的那条边被截断。旧实现里箭头三段之后漏了「走完这条边剩下的部分」，路径就从远侧交点
 *    直接连到角点 —— 那段圆弧的弦长超过直径，渲染器按规范把半径放大到刚好够用，于是气泡旁凭空
 *    多出一个圆环。它离接缝很远，盯着箭头看根本注意不到。
 * ② 楔形底宽超过该边的直边段。底边越过四角圆弧会让路径折返、在角上挑出一根刺。
 *
 * 断言对象是「路径本身可验证的几何性质」（弦长 / 极值 / 越出量），不是某一串坐标字面量：
 * 调 `n()` 的精度或换个圆角取值都不该让它们变红。
 */

const SIDES: ArrowSide[] = ['top', 'right', 'bottom', 'left'];

/** 解析 d 为「命令 + 参数」序列（本模块只产出 M/H/V/L/A/Z） */
const tokenize = (d: string): { cmd: string; nums: number[] }[] =>
  [...d.matchAll(/([A-Za-z])([^A-Za-z]*)/g)].map(m => ({
    cmd: m[1]!,
    nums: (m[2]!.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number),
  }));

interface Segment {
  cmd: string;
  from: [number, number];
  to: [number, number];
  /** A 命令的圆弧半径 */
  r?: number;
}

/** 还原每段的绝对起止点（相对命令按当前点补全缺失的那个坐标） */
const trace = (d: string): Segment[] => {
  const segs: Segment[] = [];
  let cur: [number, number] = [0, 0];
  let start: [number, number] = [0, 0];
  for (const { cmd, nums } of tokenize(d)) {
    if (cmd === 'M') {
      cur = [nums[0]!, nums[1]!];
      start = cur;
      continue;
    }
    if (cmd === 'Z') {
      segs.push({ cmd, from: cur, to: start });
      cur = start;
      continue;
    }
    const to: [number, number] =
      cmd === 'H'
        ? [nums[0]!, cur[1]]
        : cmd === 'V'
          ? [cur[0], nums[0]!]
          : [nums[nums.length - 2]!, nums[nums.length - 1]!];
    segs.push({ cmd, from: cur, to, r: cmd === 'A' ? nums[0] : undefined });
    cur = to;
  }
  return segs;
};

const chordOf = (s: Segment): number => Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]);

const BASE: ArrowPanelPathInput = {
  width: 120,
  height: 36,
  radius: 12,
  strokeWidth: 1,
  side: 'bottom',
  base: 17,
  rise: 8.5,
};

/** 四边的直边段都放得下 17px 底宽的面板：这样箭尖的越出量就等于标称 rise，可直接断言 */
const ROOMY: ArrowPanelPathInput = { ...BASE, width: 120, height: 60 };

/** 路径里所有点（含每段起止点） */
const pointsOf = (d: string): [number, number][] => trace(d).flatMap(s => [s.from, s.to]);

/** 圆弧半径（四条角弧同值，取第一条即可） */
const arcRadius = (d: string): number => trace(d).find(s => s.cmd === 'A')!.r!;

describe('buildArrowPanelPath', () => {
  it.each(SIDES)('%s：圆弧的弦长不超过直径（截断一条边会让弧被放大成巨弧）', side => {
    const segs = trace(buildArrowPanelPath({ ...BASE, side }));
    const arcs = segs.filter(s => s.cmd === 'A');
    expect(arcs).toHaveLength(4);
    for (const arc of arcs) {
      // 容差取 1e-3：坐标输出只保留三位小数
      expect(chordOf(arc), `${side} 侧圆弧弦长 ${chordOf(arc).toFixed(3)} 超过直径`).toBeLessThanOrEqual(
        2 * arc.r! + 1e-3
      );
    }
  });

  it.each(SIDES)('%s：轮廓的极值点落在箭尖上（箭头确实画出来了）', side => {
    const input = ROOMY;
    const points = pointsOf(buildArrowPanelPath({ ...input, side }));
    const inset = input.strokeWidth / 2;
    // 箭尖沿该边的法线越出 border-box 正好一个 rise
    const axis = side === 'top' || side === 'bottom' ? 1 : 0;
    const outward = side === 'bottom' || side === 'right' ? 1 : -1;
    const edge = outward > 0 ? (axis === 1 ? input.height : input.width) - inset : inset;
    const extreme = Math[outward > 0 ? 'max' : 'min'](...points.map(p => p[axis]!));
    expect(extreme).toBeCloseTo(edge + outward * input.rise, 2);
  });

  it('楔形底宽超过直边段时等比收缩，两翼不啃进四角圆弧', () => {
    // 高 26、圆角 12 → 左右边的直边段只剩 1px，放不下 17px 的底宽
    const input: ArrowPanelPathInput = { ...BASE, height: 26, radius: 12, side: 'right' };
    const d = buildArrowPanelPath(input);
    const r = arcRadius(d);
    const inset = input.strokeWidth / 2;
    // 落在右边（x = width - inset）上的点必须全在直边段内 —— 越出去就会让路径折返、在角上挑刺
    const onEdge = pointsOf(d).filter(([x]) => Math.abs(x - (input.width - inset)) < 1e-6);
    expect(onEdge.length).toBeGreaterThanOrEqual(2);
    for (const [, y] of onEdge) {
      expect(y).toBeGreaterThanOrEqual(inset + r - 1e-3);
      expect(y).toBeLessThanOrEqual(input.height - inset - r + 1e-3);
    }
    // 收缩后箭头仍在，只是越出量小于标称 rise
    const tip = Math.max(...pointsOf(d).map(([x]) => x));
    expect(tip).toBeGreaterThan(input.width - inset);
    expect(tip).toBeLessThan(input.width - inset + input.rise);
  });

  it('尺寸退化时不产出路径（让调用方跳过绘制，而不是画出非法路径）', () => {
    expect(buildArrowPanelPath({ ...BASE, width: 1 })).toBe('');
  });
});
