// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ARROW_PANEL_RADIUS,
  ARROW_PANEL_SIZE,
  arrowBaseOf,
  arrowRiseOf,
  paintArrowPanel,
  readArrowPanelPaint,
} from '@/platform/ui/popover/arrowPanel';

import type { ArrowPanelPaths } from '@/platform/ui/popover/arrowPanel';

/**
 * 「宿主 CSS 声明 → 路径几何」这条链路的测试：宿主上那三个自定义属性是四个消费方唯一的开关，
 * 中间隔着 `readArrowPanelPaint` 与 `paintArrowPanel` 两层，接线断了不会有任何报错。
 *
 * 用**假的 computed style** 而不是真元素：jsdom 没有布局（量出来恒为 0），只有把「声明了什么」
 * 直接交到读值那一步，才能断言「声明 → 画出来的路径」是一一对应的。
 *
 * 暗色 / 高对比主题的 `--shadow-*` 实形（见 tokens/themes/dark.ts）：
 * `rgba(0, 0, 0, 0.5) 0px 12px 28px 0px, rgba(255, 255, 255, 0.06) 0px 0px 0px 1px`
 * —— 前一条是投影，后一条是那圈纯扩散的发丝边。
 */
const DARK_SHADOW = 'rgba(0, 0, 0, 0.5) 0px 12px 28px 0px, rgba(255, 255, 255, 0.06) 0px 0px 0px 1px';

const fakeStyle = (vars: Record<string, string>, boxShadow = 'none'): CSSStyleDeclaration =>
  ({
    borderTopWidth: '1px',
    borderTopColor: 'rgb(1, 2, 3)',
    backgroundColor: 'rgb(9, 9, 9)',
    borderTopLeftRadius: '12px',
    boxShadow,
    // transitionDuration 为 0s 时 transitionOf 直接返回 null，路径上不会挂过渡
    transitionProperty: 'none',
    transitionDuration: '0s',
    transitionTimingFunction: 'linear',
    transitionDelay: '0s',
    getPropertyValue: (name: string) => vars[name] ?? '',
  }) as unknown as CSSStyleDeclaration;

/** 只造出代码实际读取的字段，避免把 jsdom 的布局实现拖进来 */
const hostOf = (): HTMLElement => document.createElement('div');

const pathsOf = (): ArrowPanelPaths => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const fill = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const rim = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const outline = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  svg.append(fill, rim, outline);
  return { fill, rim, outline };
};

/** 跑一次真实绘制，返回三条 path */
const draw = (vars: Record<string, string>, size = ARROW_PANEL_SIZE, boxShadow = 'none'): ArrowPanelPaths => {
  vi.spyOn(window, 'getComputedStyle').mockReturnValue(fakeStyle(vars, boxShadow));
  const paths = pathsOf();
  paintArrowPanel(paths, hostOf(), { width: 120, height: 60 }, { side: 'top' }, size);
  return paths;
};

/** 只取轮廓的 d */
const outlineOf = (vars: Record<string, string>, size = ARROW_PANEL_SIZE): string =>
  draw(vars, size).outline.getAttribute('d')!;

/** d 里所有 A 命令的半径（本模块只产出 rx = ry 的弧） */
const arcRadii = (d: string): number[] => [...d.matchAll(/A ([\d.]+) ([\d.]+) /g)].map(m => Number(m[1]));

/** 面板四角的弧半径 = fakeStyle 的 12px 圆角减半个描边 */
const PANEL_RADIUS = 12 - 1 / 2;

/**
 * 楔形那三处刀口的半径。按「不等于面板圆角」筛而不是按阈值筛：阈值会随默认值一起失效
 * （默认值一旦调大就筛不动了），而这两组半径恒差一个量级。
 */
const wedgeRadii = (d: string): number[] => arcRadii(d).filter(r => Math.abs(r - PANEL_RADIUS) > 1e-6);

/**
 * 该路径**骨架**沿越出方向的最外点（side: 'top' 时屏幕 y 越小越往外，故取 y 的最小值）。
 *
 * 直接取 d 里所有数值的最小值：这条路径上唯一的负数就是箭尖的 y（半径 / 标志都是正的，
 * 盒内坐标不为负），故不必按命令逐段还原绝对坐标。
 */
const spineY = (path: SVGPathElement): number => {
  const nums = [...path.getAttribute('d')!.matchAll(/-?[\d.]+/g)].map(m => Number(m[0]));
  const shift = Number(/translate\((-?[\d.]+)/.exec(path.getAttribute('transform') ?? '')?.[1] ?? 0);
  return Math.min(...nums) + shift;
};

/** 描边的半个宽：「骨架 + 半个描边宽」才是画出来的外沿 */
const halfStroke = (path: SVGPathElement): number => Number(path.style.strokeWidth || 0) / 2;

/**
 * 楔形**凸出面板之外**的落点。`d` 里唯一的负数是这些点的 y（半径 / 标志 / 盒内坐标都不为负），
 * 故「某个数后面紧跟负数」就是一对落点 —— 不必按命令逐段还原（A 命令的末两数同样是落点）。
 */
const wedgePoints = (d: string): [number, number][] => {
  const nums = [...d.matchAll(/-?[\d.]+/g)].map(m => Number(m[0]));
  return nums.flatMap((x, i) =>
    i + 1 < nums.length && nums[i + 1]! < 0 ? [[x, nums[i + 1]!] as [number, number]] : []
  );
};

/**
 * 楔形的轴（**画出来**的位置，即已并入 `transform` 的平移）。
 * `d` 自己的坐标与屏幕坐标差着那一格 `translate(-spread/2, …)` —— 环正是靠它把外扩的帧挪回来的，
 * 只看 `d` 会把「帧的补偿」误判成「楔形偏了」。
 */
const wedgeAxis = (path: SVGPathElement): number => {
  const xs = wedgePoints(path.getAttribute('d')!).map(([x]) => x);
  const shift = Number(/translate\((-?[\d.]+)/.exec(path.getAttribute('transform') ?? '')?.[1] ?? 0);
  return (Math.min(...xs) + Math.max(...xs)) / 2 + shift;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('readArrowPanelPaint', () => {
  it('圆角半径：未声明取默认值，显式 0 与显式值都要原样透出', () => {
    const read = (vars: Record<string, string>) => {
      vi.spyOn(window, 'getComputedStyle').mockReturnValue(fakeStyle(vars));
      return readArrowPanelPaint(hostOf()).arrowRadius;
    };
    expect(read({})).toBe(ARROW_PANEL_RADIUS);
    expect(read({ '--arrow-radius': '0' })).toBe(0);
    expect(read({ '--arrow-radius': '2.5px' })).toBe(2.5);
    expect(read({ '--arrow-radius': 'abc' })).toBe(ARROW_PANEL_RADIUS);
  });

  it('底宽 / 高度覆盖值：未声明或非法都归零（0 = 沿用 size 的换算）', () => {
    const paintOf = (vars: Record<string, string>) => {
      vi.spyOn(window, 'getComputedStyle').mockReturnValue(fakeStyle(vars));
      return readArrowPanelPaint(hostOf());
    };
    const plain = paintOf({});
    expect([plain.arrowWidth, plain.arrowHeight]).toEqual([0, 0]);
    const overridden = paintOf({ '--arrow-width': '24px', '--arrow-height': '8' });
    expect([overridden.arrowWidth, overridden.arrowHeight]).toEqual([24, 8]);
    const broken = paintOf({ '--arrow-width': '-3px', '--arrow-height': 'auto' });
    expect([broken.arrowWidth, broken.arrowHeight]).toEqual([0, 0]);
  });

  it('发丝边：只认「offset / blur 为 0、只有 spread」的那一圈', () => {
    const rimOfStyle = (boxShadow: string) => {
      vi.spyOn(window, 'getComputedStyle').mockReturnValue(fakeStyle({}, boxShadow));
      return readArrowPanelPaint(hostOf()).rim;
    };
    expect(rimOfStyle('none')).toBeNull();
    // 有偏移 / 模糊的是投影（扩出去是一圈糊边），inset 打在盒内侧，都与轮廓无关
    expect(rimOfStyle('rgba(0, 0, 0, 0.08) 0px 10px 24px 0px')).toBeNull();
    expect(rimOfStyle('rgba(0, 0, 0, 0.2) 0px 0px 4px 1px')).toBeNull();
    expect(rimOfStyle('inset 0px 1px 2px 1px rgba(0, 0, 0, 0.2)')).toBeNull();
    // spread 为 0 就不是环
    expect(rimOfStyle('rgba(0, 0, 0, 0.2) 0px 0px 0px 0px')).toBeNull();
    // 实形：颜色自带逗号，也要切得对
    expect(rimOfStyle(DARK_SHADOW)).toEqual({ width: 1, color: 'rgba(255, 255, 255, 0.06)' });
    // 多条符合时取最大的一圈（外圈才是看得见的分层线）；全透明的视同没有
    expect(rimOfStyle('rgba(255, 255, 255, 0.06) 0px 0px 0px 1px, rgba(0, 0, 0, 0.4) 0px 0px 0px 3px')).toEqual({
      width: 3,
      color: 'rgba(0, 0, 0, 0.4)',
    });
    expect(rimOfStyle('rgba(255, 255, 255, 0) 0px 0px 0px 1px')).toBeNull();
  });
});

describe('paintArrowPanel', () => {
  it('未声明三个属性时：底宽 / 高度按 size 的 √2 换算，圆角取默认值本身', () => {
    const d = outlineOf({});
    // 面板四角 4 段 + 楔形 3 段
    expect(arcRadii(d)).toHaveLength(7);
    const half = arrowBaseOf(ARROW_PANEL_SIZE) / 2;
    const rise = arrowRiseOf(ARROW_PANEL_SIZE);
    // 默认圆角必须放得进默认箭头，否则这个默认值形同虚设（12px 箭头的内切圆半径约 3.51）
    expect((half * rise) / (half + Math.hypot(half, rise))).toBeGreaterThan(ARROW_PANEL_RADIUS);
    expect(wedgeRadii(d)).toEqual([ARROW_PANEL_RADIUS, ARROW_PANEL_RADIUS, ARROW_PANEL_RADIUS]);
  });

  it('请求的圆角大于楔形内切圆时被几何夹住（内切圆是「仍明显小于楔形本身」的分界量）', () => {
    const d = outlineOf({ '--arrow-radius': '6' });
    const half = arrowBaseOf(ARROW_PANEL_SIZE) / 2;
    const rise = arrowRiseOf(ARROW_PANEL_SIZE);
    const inradius = (half * rise) / (half + Math.hypot(half, rise));
    const wedge = wedgeRadii(d);
    expect(wedge).toHaveLength(3);
    for (const radius of wedge) expect(radius).toBeCloseTo(inradius, 3);
  });

  it('显式 --arrow-radius: 0 退回尖角（只有面板四角那 4 段弧）', () => {
    expect(arcRadii(outlineOf({ '--arrow-radius': '0' }))).toHaveLength(4);
  });

  it('--arrow-width / --arrow-height 分别生效：扁平箭头也走同一条几何', () => {
    const d = outlineOf({ '--arrow-width': '24', '--arrow-height': '8', '--arrow-radius': '0' });
    // 尖角形态下两个交点与箭尖是可精确断言的：中心 60、底宽 24 → 交点 48 / 72；高度 8 → 箭尖越出 8
    expect(d).toContain('M 12 0.5 L 48 0.5 L 60 -7.5 L 72 0.5');
  });

  it('箭头够大时圆角取默认值本身，不再被夹', () => {
    const d = outlineOf({ '--arrow-width': '24', '--arrow-height': '12' });
    const half = 12;
    const inradius = (half * 12) / (half + Math.hypot(half, 12));
    expect(inradius).toBeGreaterThan(ARROW_PANEL_RADIUS);
    expect(wedgeRadii(d)).toEqual([ARROW_PANEL_RADIUS, ARROW_PANEL_RADIUS, ARROW_PANEL_RADIUS]);
  });

  it('有发丝边时：环外挪 spread/2 并以 spread 描边，本体那两条路径逐字不变', () => {
    const plain = draw({});
    const rimmed = draw({}, ARROW_PANEL_SIZE, DARK_SHADOW);
    // 只多一层：填充与轮廓一个字都不能变，否则本体上会冒出第三道边
    expect(rimmed.fill.getAttribute('d')).toBe(plain.fill.getAttribute('d'));
    expect(rimmed.outline.getAttribute('d')).toBe(plain.outline.getAttribute('d'));
    // 没有环时这条路不画任何东西（亮色主题就是这一档）
    expect(plain.rim.getAttribute('d')).toBe('');
    expect(plain.rim.style.stroke).toBe('none');
    // 环：中心线外挪 spread/2 = 0.5、描边宽 = spread = 1 → 描边内外沿正好落在
    // border-box 与「border-box 外扩 spread」上，与本体 box-shadow 那一圈重合
    expect(rimmed.rim.getAttribute('transform')).toBe('translate(-0.5 -0.5)');
    expect(rimmed.rim.style.stroke).toBe('rgba(255, 255, 255, 0.06)');
    expect(rimmed.rim.style.strokeWidth).toBe('1');
    // 环的圆角同样外扩 spread/2（box-shadow 的 spread 就是这么长的），否则四角会与本体的环错开
    const d = rimmed.rim.getAttribute('d')!;
    expect(d).not.toMatch(/NaN|Infinity/);
    expect(Number(/^M (-?[\d.]+)/.exec(d)![1])).toBeCloseTo(12 + 0.5, 3);
    // 箭尖处要贴齐：环的内沿正好落在轮廓的外沿上，两者之间不能留缝。
    // 用尖角楔形量 —— 箭尖成了显式顶点才量得准（圆角形态下极值落在弧上，不在坐标里）
    const sharp = { '--arrow-radius': '0' };
    const sharpRim = draw(sharp, ARROW_PANEL_SIZE, DARK_SHADOW);
    expect(spineY(sharpRim.rim) + halfStroke(sharpRim.rim)).toBeCloseTo(
      spineY(sharpRim.outline) - halfStroke(sharpRim.outline),
      3
    );
  });

  it('环的楔形与本体**同轴**：帧外扩后整体平移的那半格不能把楔形一起带走', () => {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue(fakeStyle({}, DARK_SHADOW));
    const paths = pathsOf();
    // 必须显式给 center。缺省「取该边中点」是**帧相对量**：环的帧宽高各外扩 1、又整体平移
    // -0.5，中点两侧同样外扩又同样偏移，自己抵消 —— 这个偏差在中点处根本测不出来。
    const center = 60;
    paintArrowPanel(paths, hostOf(), { width: 120, height: 60 }, { side: 'top', center }, ARROW_PANEL_SIZE);
    const outline = paths.outline;
    const rim = paths.rim;
    // 判据本身要可测：楔形的落点是 4 个（两翼各两个切点），一个点谈不上「同轴」
    expect(wedgePoints(outline.getAttribute('d')!).length).toBeGreaterThanOrEqual(4);
    expect(wedgeAxis(outline)).toBeCloseTo(center, 3);
    // 环整体左偏半个 spread，两翼的间距就左右不等（左离出一条缝、右压在描边上）——
    // 实测约 0.9px 的不对称，截图上正是「箭头没贴住本体」
    expect(wedgeAxis(rim)).toBeCloseTo(center, 3);
  });
});
