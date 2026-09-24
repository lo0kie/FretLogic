/**
 * 图标线条级形变（icon morph）：把两个图标的笔画各自表示成一组直线段，逐段做端点插值。
 *
 * **适用范围是刻意收窄的**：只处理 `d` 里全是 `M`/`L`/`H`/`V`（可降为直线段）的图标 ——
 * plus / minus / check / x / chevron / arrow / menu 这一类。含 `C`/`A`/`rect`/`circle` 的图标
 * （trash / copy / star / heart…）做不了：它们没有可配对的直线段，同时渲染会叠影；
 * 跨结构变形要先把曲线转成贝塞尔并让两侧命令数逐项对齐，那是 flubber / MorphSVG 那类库的领域
 * —— 本项目把那一档放在 `iconMorphFlubber.ts`（通用兜底，两端都登记了原始 SVG 即可补间，
 * `play` ↔ `square` 就走的它），本模块只在通用档之前抢先命中、图个几何精确。
 *
 * 为什么不引库：本模块要做的事（四点线性插值）在数学上没有失败模式 —— 任意两条直线段之间插值，
 * 中间帧永远是合法直线段。库的价值在曲线与命令结构的对齐，这里用不上。
 *
 * **真实成本不在补间引擎（下面几个函数），而在每个图标对都要人工挑端点映射**：
 * 端点顺序决定每个端点往哪边跑，配错会出现「对穿」（中间帧两根线互相穿过对方）。
 * 可用的启发式是让两侧的 a 端落在同一侧（都靠左下 / 都靠上），端点位移就都是就近小步挪。
 * 新增一对 = 在 SHAPES 里登记两串段数据 + 拿 `@iconify-json/lucide` 的原文核一遍坐标
 * （**别手抄**：手抄与段数据同源，写错会一起错 —— 曾把 `check` 的折点写成 `5,12`、实为 `4,12`，
 * 1 个单位在 16px 图标里只有 0.67px，肉眼看不出来）。
 */

/** 一条直线段（坐标空间与图标同源，即 24×24 视口） */
export interface MorphSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/** 一段补间：起点段与终点段 */
export type MorphPair = readonly [MorphSegment, MorphSegment];

export const morphSegment = (x1: number, y1: number, x2: number, y2: number): MorphSegment => ({
  x1,
  y1,
  x2,
  y2,
});

const segmentLength = (s: MorphSegment): number => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);

/**
 * 退化阈值：短于此长度的段改写成「只有 moveto」。
 *
 * 关键点：长度趋零时必须输出 `M x y` 而不是 `M x y L x y` —— 后者在 `stroke-linecap: round` 下
 * 会渲染成一颗直径等于描边宽的**圆点**。段数不等时靠「零长度占位段」补齐，
 * 若不做这个切换，占位段会全程显示成一颗痣。
 */
const DEGENERATE_LENGTH = 1e-2;

/** 线段 → path 的 `d`（只产出 `M` / `L`，故任意两条线段的插值结果都是合法路径） */
export const segmentToPath = (s: MorphSegment): string =>
  segmentLength(s) < DEGENERATE_LENGTH ? `M${s.x1} ${s.y1}` : `M${s.x1} ${s.y1}L${s.x2} ${s.y2}`;

/** 段的中点（以零长度段表示该点） */
const midpointOf = (s: MorphSegment): MorphSegment => {
  const mx = (s.x1 + s.x2) / 2;
  const my = (s.y1 + s.y2) / 2;
  return morphSegment(mx, my, mx, my);
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const lerpSegment = (a: MorphSegment, b: MorphSegment, t: number): MorphSegment =>
  morphSegment(lerp(a.x1, b.x1, t), lerp(a.y1, b.y1, t), lerp(a.x2, b.x2, t), lerp(a.y2, b.y2, t));

/**
 * 把两侧段列表按索引配对成等长的 `[from, to]` 序列，段数少的一侧用**零长度占位段**补齐。
 *
 * 占位段的位置取另一侧对应段的**中点**：这样「长出来」是从目标位置由内向外张开、
 * 「缩回去」是向自身中点收拢，两个方向都落在视觉重心上；
 * 若取 (0, 0) 之类的固定点，线会从视口角落飞进来。
 */
export const pairSegments = (from: readonly MorphSegment[], to: readonly MorphSegment[]): MorphPair[] => {
  const count = Math.max(from.length, to.length);
  const pairs: MorphPair[] = [];
  for (let i = 0; i < count; i++) {
    const a = from[i];
    const b = to[i];
    if (a !== undefined && b !== undefined) pairs.push([a, b]);
    else if (a !== undefined) pairs.push([a, midpointOf(a)]);
    else if (b !== undefined) pairs.push([midpointOf(b), b]);
  }
  return pairs;
};

/** 在 t（0..1，已过缓动）处求全部段的位置 */
export const morphSegments = (pairs: readonly MorphPair[], t: number): MorphSegment[] =>
  pairs.map(([a, b]) => lerpSegment(a, b, t));

/** 单个图标在一个配对中的段表示 */
type MorphShape = readonly MorphSegment[];

/**
 * 已登记的配对。键是**规范化**的两个图标名（字典序、冒号连接），
 * 故一对只登记一次、两个方向都能用（线性插值可逆，来回是同一条轨迹）。
 *
 * 段数据的端点顺序**属于配对、不属于图标** —— 同一个图标换个搭档，友好的顺序可能完全不同，
 * 所以这里按对登记，而不是给每个图标存一份「标准段表示」再想办法对齐。
 */
const SHAPES: Readonly<Record<string, Readonly<Record<string, MorphShape>>>> = {
  'check:plus': {
    // 横按气泡的实际用例。映射：plus 的横线 → check 的长撇，plus 的竖线 → check 的短捺；
    // a 端都落在左下、b 端都落在右上，四段位移都是就近小步挪。
    // 两侧段端点都可与 Lucide 原文方向相反（同一条线反向书写几何等价），这里按补间需要重写。
    check: [morphSegment(9, 17, 20, 6), morphSegment(4, 12, 9, 17)],
    plus: [morphSegment(5, 12, 19, 12), morphSegment(12, 5, 12, 19)],
  },
  'chevron-down:x': {
    // BaseSelector 触发器尾部的实际用例：展开箭头 ↔ 清空叉（悬停/聚焦时箭头就地张开成 ×）。
    // 映射按「笔画朝向同类相配」：箭头的左撇（下右向）配 × 的 `\`，箭头的右捺（上右向）配 × 的 `/`
    // （原文写作 `M18 6L6 18`，此处按补间需要反向成左下→右上）。两侧 a 端都落在左下、b 端都落在右上，
    // 中途只有「箭头折点 (12,15) 抬升为 × 交点 (12,12)」这一次必然的交叉，没有额外的对穿。
    'chevron-down': [morphSegment(6, 9, 12, 15), morphSegment(12, 15, 18, 9)],
    'x': [morphSegment(6, 6, 18, 18), morphSegment(6, 18, 18, 6)],
  },
  'check:minus': {
    // BaseCheckbox 的实际用例：半选（minus，一条横线 `M5 12h14`）↔ 勾选（check，两笔）。
    // 两侧段数不等（1 ↔ 2），短侧由 pairSegments 按对侧段的**中点**补零长度占位段 ⇒ 短捺
    // 从自身中点 (6.5, 14.5) 向外张开 / 向内收拢，落点紧挨长撇的起笔 (9,17)，
    // 看起来就是勾的一捺从斜线末端伸出来，而不是从视口角落飞进来。
    // 横线两端都往右上就近挪（左端 (5,12)→(9,17)、右端 (19,12)→(20,6)），中途无对穿。
    check: [morphSegment(9, 17, 20, 6), morphSegment(4, 12, 9, 17)],
    minus: [morphSegment(5, 12, 19, 12)],
  },
};

const pairKeyOf = (a: string, b: string): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

/**
 * 取两个图标之间的补间配对；任一侧没有登记段数据时返回 null，调用方据此退化为直接切换。
 * 返回的配对已按段数补齐，可直接交给 morphSegments。
 */
export const morphPairOf = (a: string, b: string): readonly MorphPair[] | null => {
  const shapes = SHAPES[pairKeyOf(a, b)];
  if (!shapes) return null;
  const from = shapes[a];
  const to = shapes[b];
  if (!from || !to) return null;
  return pairSegments(from, to);
};

/**
 * 已登记的配对（图标名二元组），按登记顺序 —— 供调试用，新增一对时不必再同步维护一份对列表。
 */
export const listMorphPairs = (): [string, string][] =>
  Object.keys(SHAPES).map(key => {
    const [a = '', b = ''] = key.split(':');
    return [a, b];
  });
