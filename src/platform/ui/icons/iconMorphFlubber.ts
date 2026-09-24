/**
 * flubber 形变引擎：**任意两个图标**之间的线条级形变（逐子路径的 `d` 逐帧插值）。
 *
 * 与 `iconMorph.ts`（线段登记表）的分工：那边是**人工登记**的段级配对，几何精确但每对都要手写；
 * 这里是**通用兜底**，任何两个登记过原始 SVG 的图标都能补间，代价是几何由 flubber 的形状匹配决定。
 * `BaseIcon` 先问登记表、未命中才落到这里。
 *
 * ⚠️ 本模块**只允许被动态 `import()`**（见 `BaseIcon.vue`）：flubber 打包 18.6KB gzip，
 * 首屏预算（220KB）只剩约 30KB，静态引入即可能越界。
 *
 * ── 为什么不能直接把两条 `d` 丢给 `flubber.interpolate()`（三条已实测的硬伤）──
 * flubber 的内部模型是「一条路径 = 一个**闭环** ring」，对**开口笔画**（`check` / `plus` / 曲线折线等
 * 没有 `Z` 的子路径）会依次踩：
 *  ① `normalizeRing` 强制所有环**顺时针**并按 `maxSegmentLength` 二分；
 *  ② `addPoints` 沿**闭环周长**补点 ⇒ 开口折线的补点会落到「末点 → 首点」那条**隐含弦**上，
 *     而该弦在渲染时是被丢掉的（我们不会写 `Z`）⇒ 中间帧凭空多出一段朝回调的笔画（实测：表现为钩子 / 细横杠）；
 *  ③ `rotate` 无条件旋转起点 ⇒ 开口折线被换成**另一条折线**（首点后移，丢掉另一条边），
 *     起手一帧就跳形（实测 `check → plus` 起手偏差 1.17、中帧冒 20 单位长边，在 24×24 视口里是灾难）。
 * 本引擎的对策只有一条：**开口子路径在交给 flubber 之前，先改写成「去程 + 原路返回」的退化闭环**
 * （见 {@link openRingPoints}）。它的渲染像素与原折线完全相同（原路重描），但边集是「每条折线边各两遍」，
 * 于是 ③ 的旋转不再改变形状（对环而言旋转不改边集）、② 的补点只会落在折线自身或其反向重描上。
 * 三个硬伤一起消失，端点几何逐像素回到原图标。
 */
import { interpolate, splitPathString } from 'flubber';

import { ICON_MORPH_BODIES } from './iconMorphBodies';

import type { IconName } from './icons.registry';
import type { Interpolator, Shape } from 'flubber';

/**
 * 采样段长上限（24×24 视口单位）：1 ≈ 图标整体尺度（约 20 单位）的 1/20。
 * 该值同时决定「开口折线被采样成多密的折线」与「flubber 把两条环二分到多密」——
 * 调大省字节但中间帧会出现折线感，调小则每帧的 `d` 变长（180ms 约 11 帧，性价比不高）。
 */
const MAX_SEGMENT_LENGTH = 1;

/** 环的包围盒长边小于该值即视为「已折叠成一点」，该帧不输出（避免画出亚像素级三角片） */
const MIN_RING_EXTENT = 1e-2;

/** 单条子路径：`d` + 是否以 `Z` 闭合（闭合与开口在 flubber 里的处理完全不同） */
interface Subpath {
  d: string;
  closed: boolean;
}

export interface IconMorphRuntime {
  /**
   * 取进度 `progress ∈ [0, 1]` 处的几何，返回**每条子路径**的 `d`。
   *
   * 端点契约（`BaseIcon` 在两端与图标组件分支互相切换，靠的就是它）：
   * `progress <= 0` 与 `>= 1` 分别返回源 / 目标图标**自身的子路径几何**（不经过 flubber），
   * 因此两端与图标组件的渲染结果逐子路径等价、切换不闪。
   */
  at(progress: number): string[];
}

// ────────────────────────────── SVG body → 子路径 ──────────────────────────────

const attrNum = (attrs: Readonly<Record<string, string>>, key: string, fallback = 0): number => {
  const raw = attrs[key];
  return raw === undefined ? fallback : Number(raw);
};

/**
 * `<rect>` → 等价 `d`。无圆角时用 H/V（可被 flubber 的 `exactRing` 精确成环），
 * 有圆角时用 A 弧（落到 `approximateRing`，按弧长采样）。
 */
const rectToPath = (attrs: Readonly<Record<string, string>>): string => {
  const x = attrNum(attrs, 'x');
  const y = attrNum(attrs, 'y');
  const w = attrNum(attrs, 'width');
  const h = attrNum(attrs, 'height');
  const r = attrNum(attrs, 'rx') || attrNum(attrs, 'ry');
  if (!r) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
  const x2 = x + w;
  const y2 = y + h;
  return (
    `M${x + r} ${y}H${x2 - r}A${r} ${r} 0 0 1 ${x2} ${y + r}V${y2 - r}A${r} ${r} 0 0 1 ${x2 - r} ${y2}` +
    `H${x + r}A${r} ${r} 0 0 1 ${x} ${y2 - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
  );
};

/** `<circle>` / `<ellipse>` → 两段半圆弧构成的闭合 `d` */
const ellipseToPath = (attrs: Readonly<Record<string, string>>, rxKey: string, ryKey: string): string => {
  const cx = attrNum(attrs, 'cx');
  const cy = attrNum(attrs, 'cy');
  const rx = attrNum(attrs, rxKey);
  const ry = attrNum(attrs, ryKey);
  return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}` + `A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
};

/**
 * 把 body 里的一个绘制元素转成等价的 `d`。
 * 只处理 Lucide / Simple Icons 实际会用到的七种元素；其余（`g`、`defs`、`title`…）返回空串被跳过。
 */
const elementToPath = (tag: string, attrs: Readonly<Record<string, string>>): string => {
  if (tag === 'path') return attrs['d'] ?? '';
  if (tag === 'rect') return rectToPath(attrs);
  if (tag === 'circle') return ellipseToPath(attrs, 'r', 'r');
  if (tag === 'ellipse') return ellipseToPath(attrs, 'rx', 'ry');
  if (tag === 'line')
    return `M${attrNum(attrs, 'x1')} ${attrNum(attrs, 'y1')}L${attrNum(attrs, 'x2')} ${attrNum(attrs, 'y2')}`;
  if (tag === 'polyline' || tag === 'polygon') {
    const pts = (attrs['points'] ?? '')
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (pts.length < 4) return '';
    const head = `M${pts[0]} ${pts[1]}`;
    const rest = pts.slice(2).reduce((acc, v, i) => (i % 2 ? `${acc} ${v}` : `${acc}L${v}`), '');
    return tag === 'polygon' ? `${head}${rest}Z` : `${head}${rest}`;
  }
  return '';
};

/**
 * 以 `M` 为界把 `d` 拆成子路径；`closed` 决定它走 flubber 的精确成环还是我们的退化闭环改写。
 *
 * 拆之前先过 `splitPathString`（flubber 的 svgpath 归一化，把整条 `d` 绝对化）—— 必须如此：
 * 子路径的 moveto 允许是**相对**形式，`plus` 就是 `M5 12h14m-7-7v14`，第二个子路径的 `m-7-7`
 * 要相对前一段的终点 (19,12) 才是 (12,5)。直接对原文按 `M` 切会把它的锚点读成 (-7,-7)，
 * 于是这一侧的形状整条错位（实测：补间中途跑到视口外的 (-2.25,-2.25)）。
 */
const splitSubpaths = (d: string): Subpath[] =>
  splitPathString(d)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => ({ d: s, closed: /[Zz]\s*$/.test(s) }));

/** 是否含真正的绘制命令（只有 `M` 的子路径是退化点，不能当形状处理） */
const isDrawable = (d: string): boolean => /[LlHhVvCcSsQqTtAa]/.test(d);

/** 解析图标的原始 SVG 文本 → 子路径列表（按文档顺序，顺序即配对顺序） */
function parseSubpaths(body: string): Subpath[] {
  const out: Subpath[] = [];
  for (const [, tag, attrStr] of body.matchAll(/<(\w+)([^>]*)\/?>/g)) {
    if (!tag || attrStr === undefined) continue;
    const attrs: Record<string, string> = {};
    for (const [, key, value] of attrStr.matchAll(/([\w:-]+)="([^"]*)"/g))
      if (key && value !== undefined) attrs[key] = value;
    const d = elementToPath(tag, attrs);
    if (d) out.push(...splitSubpaths(d));
  }
  return out;
}

/**
 * 子路径的起笔点（用于给「多出来的那一侧」补一个就地折叠的退化点）。
 * ⚠️ 入参必须是**已绝对化**的子路径串（`splitSubpaths` 的产物）—— 相对 `m` 在原文里读不出落点。
 */
function movetoOf(d: string): [number, number] {
  const m = /[Mm]\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/.exec(d);
  const x = m?.[1] !== undefined ? Number(m[1]) : Number.NaN;
  const y = m?.[2] !== undefined ? Number(m[2]) : Number.NaN;
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : [12, 12];
}

// ─────────────────────────── 开口笔画 → 退化闭环 ───────────────────────────

/** `@types/flubber` 把返回值一律声明成字符串插值器（未建模 `string: false`），此处收窄回点环形态 */
const asRingInterpolator = (fn: Interpolator): ((t: number) => number[][]) =>
  fn as unknown as (t: number) => number[][];

/**
 * 取子路径归一化后的点环。
 *
 * ⚠️ `maxSegmentLength` 传 `Number.POSITIVE_INFINITY` 时 flubber 会跳过二分（其判据含 `isFiniteNumber`），
 * 于是纯 M/L/H/V 的子路径原样返回**顶点列表**（`exactRing`）；曲线子路径则退化成 3 个采样点，
 * 故那个哨兵值只对折线使用。
 *
 * ⚠️ 对**开口折线**，这个「点环」是有毒的：`normalizeRing` 把它当闭环，会沿「末点 → 首点」那条
 * **在该子路径里并不存在的弦**补点（`check` 于是被当成一个三角形）。调用方必须走 {@link openSamples}
 * 而不是直接用它。
 */
const subpathRing = (d: string, maxSegmentLength: number): number[][] =>
  asRingInterpolator(interpolate(d, d, { maxSegmentLength, string: false }))(0);

/** 含曲线命令（`exactRing` 会放弃，转而按弧长近似采样） */
const hasCurveCommands = (d: string): boolean => /[CcAaSsQqTt]/.test(d);

/**
 * 补回被截掉的终点：`approximateRing` 采样 `len * i / n`（`i = 0 … n-1`）**不含终点**，
 * 末次采样距真正的终点恰好一个采样步长，故按最后两点的向量外推一步即可。
 * 直线尾段外推是精确的，曲线尾段的误差是二阶量（步长² × 曲率），远小于步长本身。
 */
const appendEndpoint = (points: number[][]): void => {
  const last = points[points.length - 1];
  const previous = points[points.length - 2];
  if (!last || !previous) return;
  points.push([2 * (last[0] ?? 0) - (previous[0] ?? 0), 2 * (last[1] ?? 0) - (previous[1] ?? 0)]);
};

/** 折线按弧长重采样：每段均分成不超过 `step` 的小段，两端点都在结果里 */
function resamplePolyline(vertices: readonly number[][], step: number): number[][] {
  const points: number[][] = [];
  for (let i = 0; i < vertices.length - 1; i++) {
    const a = vertices[i];
    const b = vertices[i + 1];
    if (!a || !b) continue;
    const [x1 = 0, y1 = 0] = a;
    const [x2 = 0, y2 = 0] = b;
    const parts = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / step));
    for (let k = 0; k < parts; k++) points.push([x1 + ((x2 - x1) * k) / parts, y1 + ((y2 - y1) * k) / parts]);
  }
  const last = vertices[vertices.length - 1];
  if (last) points.push([last[0] ?? 0, last[1] ?? 0]);
  return points;
}

/**
 * 开口子路径 → 沿弧长均匀采样的点列（**只落在该子路径自身的笔画上**）。
 * 两条分支的差别正是上一条注释里那个「闭环弦」：flubber 的弧长近似采样（`skipBisect`）不会补它，
 * 而折线走的精确成环会 —— 后者必须自己重采样。
 */
function openSamples(d: string): number[][] {
  if (hasCurveCommands(d)) {
    const points = subpathRing(d, MAX_SEGMENT_LENGTH);
    if (points.length >= 2) appendEndpoint(points);
    return points;
  }
  return resamplePolyline(subpathRing(d, Number.POSITIVE_INFINITY), MAX_SEGMENT_LENGTH);
}

/**
 * 开口子路径 → 「去程 + 原路返回」的退化闭环点列（本引擎的核心改写，动机见文件头）。
 *
 * 返回的点列**不重复**首点：交回 flubber 后 `normalizeRing` 会按「首末同点」把它弹掉，
 * 形成首尾闭合的环（闭合边即折线首段的重描，不引入任何新笔画）。
 */
function openRingPoints(d: string): number[][] {
  const points = openSamples(d);
  if (points.length < 2) return points;
  return [...points, ...points.slice(0, -1).reverse()];
}

/** 交给 flubber 的形状：闭合子路径用原 `d`（`exactRing` 更精确），开口子路径用退化闭环点列 */
function ringInputOf(subpath: Subpath): Shape {
  if (subpath.closed) return subpath.d;
  const points = openRingPoints(subpath.d);
  return points.length >= 2 ? points : subpath.d;
}

/**
 * 按文档顺序一一配对，短的一侧用「就地折叠的退化点」补齐 ——
 * 子路径数不等是常态（`server` 4 条 → `check` 1 条），多出来的部分应当原地收成一个点，
 * 而不是不参与形变（否则它会突兀消失）。
 */
function buildPairs(from: Subpath[], to: Subpath[]): [Subpath, Subpath][] {
  const a = [...from];
  const b = [...to];
  while (a.length < b.length) {
    const partner = b[a.length];
    if (!partner) break;
    const [x, y] = movetoOf(partner.d);
    a.push({ d: `M${x} ${y}`, closed: false });
  }
  while (b.length < a.length) {
    const partner = a[b.length];
    if (!partner) break;
    const [x, y] = movetoOf(partner.d);
    b.push({ d: `M${x} ${y}`, closed: false });
  }
  return a.map((s, i) => [s, b[i]] as [Subpath, Subpath]);
}

/** 点环 → `d`。折叠成一点的环返回 null（该帧不画它）。 */
function serializeRing(ring: number[][]): string | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of ring) {
    const [x = 0, y = 0] = point;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!(maxX - minX >= MIN_RING_EXTENT) && !(maxY - minY >= MIN_RING_EXTENT)) return null;

  let d = '';
  for (let i = 0; i < ring.length; i++) {
    const [x = 0, y = 0] = ring[i] ?? [];
    d += `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d ? `${d}Z` : null;
}

// ────────────────────────────────── 对外 API ──────────────────────────────────

/**
 * 为两个图标建一条形变通道；任一图标没有登记原始 SVG（或两者同名）时返回 `null`，
 * 调用方据此退化为「直接切换」—— 少一个动画，不能少一个图标。
 */
export function createIconMorph(from: IconName, to: IconName): IconMorphRuntime | null {
  const fromBody = ICON_MORPH_BODIES[from];
  const toBody = ICON_MORPH_BODIES[to];
  if (!fromBody || !toBody || from === to) return null;

  try {
    return buildMorph(fromBody, toBody);
  } catch {
    // 形变是纯装饰：任何几何异常都不该让图标不渲染，直接退化成切换。
    // 已知会落到这里的是「拿不到弧长测量」—— flubber 采样曲线靠 `<path>.getTotalLength()`，
    // 只有真浏览器实现（见其 `measure()`）；jsdom 下该方法是 undefined。纯 M/L/H/V 的图标走
    // flubber 的精确成环、不碰测量，故不受影响。
    return null;
  }
}

function buildMorph(fromBody: string, toBody: string): IconMorphRuntime {
  const pairs = buildPairs(parseSubpaths(fromBody), parseSubpaths(toBody));
  const interpolators = pairs.map(([s, t]) =>
    asRingInterpolator(
      interpolate(ringInputOf(s), ringInputOf(t), { maxSegmentLength: MAX_SEGMENT_LENGTH, string: false })
    )
  );

  // 端点直接回原始几何（不经 flubber）：与图标组件的渲染结果逐子路径等价，切换分支不闪
  const fromPaths = pairs.map(([s]) => s.d).filter(isDrawable);
  const toPaths = pairs.map(([, t]) => t.d).filter(isDrawable);

  return {
    at(progress) {
      if (!(progress > 0)) return fromPaths;
      if (progress >= 1) return toPaths;
      const paths: string[] = [];
      for (const fn of interpolators) {
        const d = serializeRing(fn(progress));
        if (d) paths.push(d);
      }
      return paths;
    },
  };
}
