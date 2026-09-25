import { describe, expect, it } from 'vitest';

import { buildArrowFillPath, buildArrowPanelPath } from '@/platform/ui/popover/arrowPanelPath';

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
  /** A 命令的大弧标志 / 旋向标志（还原圆心要用，见 arcCenter） */
  large?: number;
  sweep?: number;
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
    if (cmd === 'A') {
      segs[segs.length - 1]!.large = nums[3];
      segs[segs.length - 1]!.sweep = nums[4];
    }
    cur = to;
  }
  return segs;
};

const chordOf = (s: Segment): number => Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]);

/**
 * 按 SVG 规范 F.6.5 还原弧的圆心（rx = ry、无旋转）。用它把「弧朝哪边鼓」变成可断言的性质：
 * 弧的鼓出方向与圆心分居弦的两侧，故圆心落在哪一侧就等价于弧鼓向哪一侧。
 */
const arcCenter = (s: Segment): [number, number] => {
  const [x1, y1] = s.from;
  const [x2, y2] = s.to;
  const x1p = (x1 - x2) / 2;
  const y1p = (y1 - y2) / 2;
  const d = Math.hypot(x1p, y1p);
  // 半径不足时渲染器按规范放大到弦长的一半，这里同样处理
  const r = Math.max(s.r!, d);
  const k = d === 0 ? 0 : Math.sqrt(Math.max(0, r * r - d * d)) / d;
  const sign = s.large === s.sweep ? -1 : 1;
  return [(x1 + x2) / 2 + sign * k * y1p, (y1 + y2) / 2 - sign * k * x1p];
};

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

/** 该边的法线口径：轴向、越出方向、以及 border-box 上那条边线的坐标 */
const frameOf = (input: ArrowPanelPathInput, side: ArrowSide) => {
  const inset = input.strokeWidth / 2;
  const axis = side === 'top' || side === 'bottom' ? 1 : 0;
  const outward = side === 'bottom' || side === 'right' ? 1 : -1;
  return {
    axis: axis as 0 | 1,
    outward: outward as 1 | -1,
    inset,
    edge: outward > 0 ? (axis === 1 ? input.height : input.width) - inset : inset,
  };
};

type Frame = ReturnType<typeof frameOf>;

/** 沿该边法线的**越出量**：> 0 = 在面板 border-box 之外（箭头那一侧） */
const protrusion = (p: [number, number], f: Frame): number => f.outward * (p[f.axis]! - f.edge);

/**
 * 楔形的三处刀口 = 有端点落在 border-box 之外的弧（面板四角的弧两端都在盒内）。
 * 不按半径阈值区分：那会把面板圆角恰好也小的取值误判成楔形弧。
 */
const wedgeArcsOf = (d: string, input: ArrowPanelPathInput): Segment[] => {
  const inset = input.strokeWidth / 2;
  const outside = (p: [number, number]): boolean =>
    p[0] < inset - 1e-6 ||
    p[0] > input.width - inset + 1e-6 ||
    p[1] < inset - 1e-6 ||
    p[1] > input.height - inset + 1e-6;
  return trace(d).filter(s => s.cmd === 'A' && (outside(s.from) || outside(s.to)));
};

const isLine = (s: Segment): boolean => s.cmd === 'L' || s.cmd === 'H' || s.cmd === 'V';

/**
 * 每处「直线 ↔ 弧」接缝的**相切度**：半径向量（弧心 → 接缝点）与直线段方向的夹角正弦，1 = 相切。
 *
 * 相切是「接缝顺不顺」的唯一判据，也是圆角楔形最容易错的地方：底角与箭尖的切点长度互为倒数量级
 * （`tBase` 与 `tTip`），把某一处按另一个长度取，弧照样画得出来、弦长也合法，只是与两条边都不再
 * 相切 —— 接缝两端各留一个折角，呈现为「一侧平滑、另一侧生硬」。这类失效没有任何数值会越界，
 * 只有把相切本身钉住才拦得住。
 */
const seamTangency = (d: string): number[] => {
  const segs = trace(d);
  const values: number[] = [];
  for (let i = 0; i + 1 < segs.length; i += 1) {
    const prev = segs[i]!;
    const cur = segs[i + 1]!;
    const arc = prev.cmd === 'A' ? prev : cur.cmd === 'A' ? cur : null;
    const line = isLine(prev) ? prev : isLine(cur) ? cur : null;
    if (!arc || !line) continue;
    const dir: [number, number] = [line.to[0] - line.from[0], line.to[1] - line.from[1]];
    const dirLen = Math.hypot(dir[0], dir[1]);
    if (dirLen < 1e-9) continue;
    const join = prev.to;
    const [cx, cy] = arcCenter(arc);
    const rad: [number, number] = [join[0] - cx, join[1] - cy];
    values.push(Math.abs(rad[0] * dir[1] - rad[1] * dir[0]) / (Math.hypot(rad[0], rad[1]) * dirLen));
  }
  return values;
};

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
    const f = frameOf(input, side);
    // 箭尖沿该边的法线越出 border-box 正好一个 rise
    const extreme = Math[f.outward > 0 ? 'max' : 'min'](...points.map(p => p[f.axis]!));
    expect(extreme).toBeCloseTo(f.edge + f.outward * input.rise, 2);
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

  it.each(SIDES)('%s：arrowRadius 缺省即 0，不传与传 0 逐字相同（默认不改观感）', side => {
    const d = buildArrowPanelPath({ ...ROOMY, side });
    expect(d).toBe(buildArrowPanelPath({ ...ROOMY, side, arrowRadius: 0 }));
    // 尖角楔形只有面板四角那四段弧
    expect(trace(d).filter(s => s.cmd === 'A')).toHaveLength(4);
  });

  it.each(SIDES)('%s：开启圆角后三处刀口的半径 ≤ 内切圆、弦长 ≤ 直径、切点不越过直边段', side => {
    const input: ArrowPanelPathInput = { ...ROOMY, side, arrowRadius: 1e6 };
    const d = buildArrowPanelPath(input);
    expect(d).not.toMatch(/NaN|Infinity/);
    const half = input.base / 2;
    const inradius = (half * input.rise) / (half + Math.hypot(half, input.rise));
    const wedge = wedgeArcsOf(d, input);
    expect(wedge).toHaveLength(3);
    for (const arc of wedge) {
      // 半径再大也收敛到「半径还明显小于楔形本身」的分界量
      expect(arc.r!).toBeLessThanOrEqual(inradius + 1e-3);
      // 弦长超过直径时渲染器会自行放大半径，画出的就不是这条圆角了
      expect(chordOf(arc)).toBeLessThanOrEqual(2 * arc.r! + 1e-3);
    }
    // 刀口是顺着箭头所在那条边往两侧吃进去的，切点必须留在该边的直边段内（越出去就是折返）
    const f = frameOf(input, side);
    const along = side === 'top' || side === 'bottom' ? 0 : 1;
    // 检测器本身的对照：尖角楔形的三个角都落在盒内，故同一判据在尖角路径上一段也找不出来
    expect(wedgeArcsOf(buildArrowPanelPath({ ...input, arrowRadius: 0 }), input)).toHaveLength(0);
    const panelRadius = arcRadius(buildArrowPanelPath({ ...input, arrowRadius: 0 }));
    for (const p of pointsOf(d).filter(p => Math.abs(p[f.axis]! - f.edge) < 1e-6)) {
      const lo = f.inset + panelRadius - 1e-3;
      const hi = (along === 0 ? input.width : input.height) - f.inset - panelRadius + 1e-3;
      expect(p[along]!).toBeGreaterThanOrEqual(lo);
      expect(p[along]!).toBeLessThanOrEqual(hi);
    }
  });

  it('底宽与高度可各自独立（不再绑死 √2 比例）：扁平箭头的圆角按它自己的内切圆收敛', () => {
    const input: ArrowPanelPathInput = { ...ROOMY, side: 'top', base: 24, rise: 8, arrowRadius: 1e6 };
    const half = input.base / 2;
    const inradius = (half * input.rise) / (half + Math.hypot(half, input.rise));
    const wedge = wedgeArcsOf(buildArrowPanelPath(input), input);
    expect(wedge).toHaveLength(3);
    for (const arc of wedge) {
      // 楔形变扁 → 内切圆变小，同一个期望半径仍被夹住
      expect(arc.r!).toBeCloseTo(inradius, 3);
      expect(chordOf(arc)).toBeLessThanOrEqual(2 * arc.r! + 1e-3);
    }
  });

  it.each(SIDES)('%s：箭尖那处刀口向外鼓、两个底角向内收（sweep 写反会把两者互换）', side => {
    const input: ArrowPanelPathInput = { ...ROOMY, side, arrowRadius: 1e6 };
    const f = frameOf(input, side);
    const wedge = wedgeArcsOf(buildArrowPanelPath(input), input);
    expect(wedge).toHaveLength(3);
    // 箭尖那处的两翼对称、越出量最大；两个底角则一端在边线上（越出量 0）、一端在两翼上
    const outermost = wedge.map(a => Math.max(protrusion(a.from, f), protrusion(a.to, f)));
    const tipIndex = outermost.indexOf(Math.max(...outermost));
    expect(tipIndex).toBeGreaterThanOrEqual(0);
    wedge.forEach((arc, i) => {
      const ends = [protrusion(arc.from, f), protrusion(arc.to, f)];
      const center = protrusion(arcCenter(arc), f);
      // 凸刀（箭尖）的圆心在弦的内侧、比两个端点都浅；凹刀（底角）的圆心在弦的外侧、比两个端点都深。
      // 写反 sweep 时圆心会被镜像到弦的另一侧，这条判据随即翻面。
      if (i === tipIndex) {
        expect(center).toBeLessThan(Math.min(...ends) - 1e-3);
      } else {
        expect(center).toBeGreaterThan(Math.max(...ends) + 1e-3);
      }
    });
  });

  it.each(SIDES)('%s：每处「直线 ↔ 弧」接缝都相切（不相切就是接缝上的折角）', side => {
    const d = buildArrowPanelPath({ ...ROOMY, side, arrowRadius: 1e6 });
    const arcs = trace(d).filter(s => s.cmd === 'A');
    const values = seamTangency(d);
    // 覆盖度：每段弧至少贡献一处被检的接缝，否则下面的断言可能只是空跑
    expect(values.length).toBeGreaterThanOrEqual(arcs.length);
    for (const sin of values) expect(sin).toBeGreaterThan(1 - 1e-2);
  });

  it('相切判据本身是可测的：与直线成角的弧必须被判为非相切', () => {
    // 直线沿 +x 到 (10,0)，接一段圆心 (12.5, 4.33)、半径 5 的弧 —— 该点的切线斜率不为 0
    const skewed = 'M 0 0 L 10 0 A 5 5 0 0 1 15 0 L 20 0';
    expect(Math.min(...seamTangency(skewed))).toBeLessThan(0.95);
    // 对照：同一条直线上接一段与之相切的半圆，判据必须给出 1
    const tangent = 'M 0 0 L 10 0 A 5 5 0 0 1 10 10 L 20 10';
    expect(Math.max(...seamTangency(tangent))).toBeCloseTo(1, 6);
  });

  it.each(SIDES)('%s：三处刀口的六个切点关于箭头轴互为镜像（两侧取不同的刀口长度会立刻失衡）', side => {
    const input: ArrowPanelPathInput = { ...ROOMY, side, arrowRadius: 1e6 };
    const f = frameOf(input, side);
    // 沿轴方向的坐标下标：frameOf 的 axis 是越出方向（交叉轴），沿轴就是另一个
    const along = 1 - f.axis;
    // 箭头落在该边正中，故轴就是这条边的中点
    const axisAt = (side === 'top' || side === 'bottom' ? input.width : input.height) / 2;
    const wedge = wedgeArcsOf(buildArrowPanelPath(input), input);
    expect(wedge).toHaveLength(3);
    const pts = wedge.flatMap(a => [a.from, a.to]);
    expect(pts).toHaveLength(6);
    const key = (p: [number, number]): string => p.map(v => v.toFixed(3)).join(',');
    const mirrored = pts.map(
      p => (along === 0 ? [2 * axisAt - p[0]!, p[1]!] : [p[0]!, 2 * axisAt - p[1]!]) as [number, number]
    );
    expect(mirrored.map(key).sort()).toEqual(pts.map(key).sort());
  });

  it('箭头贴到直边段尽头（该侧余量为 0）时不画圆角，退回尖角而不是让路径折返', () => {
    // 宽 120、圆角 12 → 上边直边段 96px；箭头中心 20 会被夹到 20.5，近侧余量正好为 0
    const input: ArrowPanelPathInput = { ...BASE, center: 20, arrowRadius: 1e6 };
    const d = buildArrowPanelPath(input);
    expect(wedgeArcsOf(d, input)).toHaveLength(0);
    expect(d).toBe(buildArrowPanelPath({ ...input, arrowRadius: 0 }));
  });

  it('余量比内切圆更紧时按余量收敛，而不是一律夹到内切圆', () => {
    const centered: ArrowPanelPathInput = { ...BASE, center: 60, arrowRadius: 1e6 };
    // 近侧只剩 0.5px 余量 → 半径必须跟着小下去（否则刀口会退进面板的角弧里）
    const tight: ArrowPanelPathInput = { ...BASE, center: 21, arrowRadius: 1e6 };
    const half = centered.base / 2;
    const inradius = (half * centered.rise) / (half + Math.hypot(half, centered.rise));
    const roomyRadius = wedgeArcsOf(buildArrowPanelPath(centered), centered)[0]!.r!;
    const tightRadius = wedgeArcsOf(buildArrowPanelPath(tight), tight)[0]!.r!;
    expect(roomyRadius).toBeCloseTo(inradius, 3);
    expect(tightRadius).toBeGreaterThan(0);
    expect(tightRadius).toBeLessThan(roomyRadius);
  });

  it('极端半径与退化尺寸下不产出非法路径', () => {
    expect(buildArrowPanelPath({ ...BASE, arrowRadius: 1e6 })).not.toMatch(/NaN|Infinity/);
    expect(buildArrowFillPath({ ...BASE, arrowRadius: 1e6 })).not.toMatch(/NaN|Infinity/);
    expect(buildArrowPanelPath({ ...BASE, width: 1, arrowRadius: 2 })).toBe('');
    expect(buildArrowFillPath({ ...BASE, width: 1, arrowRadius: 2 })).toBe('');
  });
});

describe('buildArrowFillPath', () => {
  it('尖角时底边向面板内多伸 overlap，箭尖与轮廓重合', () => {
    const input: ArrowPanelPathInput = { ...BASE, side: 'top' };
    const f = frameOf(input, 'top');
    const pts = pointsOf(buildArrowFillPath(input));
    expect(pts.some(p => Math.abs(protrusion(p, f) - 8.5) < 1e-3)).toBe(true);
    expect(pts.some(p => Math.abs(protrusion(p, f) + 1) < 1e-3)).toBe(true);
  });

  it.each(SIDES)('%s：圆角时填充与轮廓共用同一条楔形边界，底边仍内移 overlap', side => {
    const input: ArrowPanelPathInput = { ...ROOMY, side, arrowRadius: 1e6 };
    const outline = wedgeArcsOf(buildArrowPanelPath(input), input);
    const fill = trace(buildArrowFillPath(input)).filter(s => s.cmd === 'A');
    // 同一条边界：填充若与轮廓各画各的圆角，轮廓的弧会露在填充之外，接缝处就是一条亮线
    expect(outline.map(a => [a.from, a.to])).toEqual(fill.map(a => [a.from, a.to]));
    expect(outline.map(a => a.r!)).toEqual(fill.map(a => a.r!));
    // 底边仍整体内移 overlap（与面板底色重叠，杜绝发丝缝）
    const f = frameOf(input, side);
    expect(pointsOf(buildArrowFillPath(input)).some(p => Math.abs(protrusion(p, f) + 1) < 1e-3)).toBe(true);
  });
});
