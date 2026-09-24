/**
 * 箭头容器轮廓的**纯几何**：把「圆角矩形面板 + 一条边上凸出的楔形箭头」合成 SVG 路径。
 *
 * 这是整套浮层箭头的唯一几何来源 —— 画出来的是一条**连续轮廓**，箭头两翼与面板边线之间不存在
 * 接缝，因而也不需要任何「插入几像素盖住抗锯齿缝」的补偿量。那类补偿量会随缩放漂移：指板里的
 * 气泡整棵子树处在 `transform: scale()` 内，1px 描边视觉上只有 0.85px，两段各自抗锯齿的边
 * 无论把插入量调成多少都合不拢。
 *
 * 坐标系与内缩口径：
 * - 原点取**面板 border-box 的左上角**，单位 px（与 SVG 用户单位一致）；
 * - 路径整体内缩 `strokeWidth / 2`，让**居中描边**的外沿正好落在 border-box 边缘 ——
 *   即路径复刻的是「面板外轮廓」，与 `border: 1px` 画出的那条边逐像素重合。
 *
 * 本模块不碰 DOM，故可被 Vue 组件与命令式指令同时消费（见 arrowPanel.ts）。
 */

/** 箭头所在的边（= 楔形朝面板外的那一侧） */
export type ArrowSide = 'top' | 'right' | 'bottom' | 'left';

export interface ArrowPanelPathInput {
  /** 面板 border-box 宽（px） */
  width: number;
  /** 面板 border-box 高（px） */
  height: number;
  /** 面板圆角半径（px）；超过短边一半时按短边取半（`rounded-full` 的极大值在此收敛） */
  radius: number;
  /** 面板描边宽度（px），路径按它的一半内缩；0 表示无描边 */
  strokeWidth: number;
  /** 箭头所在边 */
  side: ArrowSide;
  /** 箭头中心沿该边的位置（px，border-box 坐标系）：上下边取 x、左右边取 y；缺省取该边中点 */
  center?: number;
  /** 楔形底宽（px）= 面板边上两个交点的距离 */
  base: number;
  /** 楔形高度（px）= 箭尖越出面板 border-box 的距离 */
  rise: number;
}

/** 保留 3 位小数：SVG 路径不需要更高精度，短串更好读也更好比对 */
const n = (v: number): string => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

/**
 * 把输入收敛成可直接落笔的一组数：描边内缩后的矩形、收敛过的圆角、箭头中心与**收缩后的楔形尺寸**。
 *
 * 两处收敛都不是防御性的，是几何上必须的：
 * - 箭头中心必须落在**直边段**内（两端各让出圆角区与半个底宽），否则楔形会啃进四角圆弧；
 * - 楔形底宽必须 ≤ 直边段长度。小面板（如 v-scrollbar 的读数气泡：高 25px、圆角 8.3px，直边只剩
 *   6.3px）配 8px 的箭头时底宽有 11.3px —— 旧实现里楔形是独立元素，底边越过圆角只会「多盖一点」；
 *   而轮廓合一后底边越过圆角会让路径折返，在角上挑出一根刺。故按可用长度**等比**收缩底宽与高度
 *   （只压底宽会把楔形压成尖刺），退化到 0 时干脆不画箭头。
 */
const resolve = (input: ArrowPanelPathInput) => {
  const s = Math.max(0, input.strokeWidth) / 2;
  const x0 = s;
  const y0 = s;
  const x1 = input.width - s;
  const y1 = input.height - s;
  if (!(x1 > x0) || !(y1 > y0)) return null;

  const horizontal = input.side === 'top' || input.side === 'bottom';
  // 圆角同步内缩：描边外沿的圆角才等于面板的 border-radius
  const r = Math.max(0, Math.min(input.radius - s, (x1 - x0) / 2, (y1 - y0) / 2));
  const alongMin = (horizontal ? x0 : y0) + r;
  const alongMax = (horizontal ? x1 : y1) - r;
  const straight = Math.max(0, alongMax - alongMin);

  const base = Math.max(0, input.base);
  const fit = base > 0 ? Math.min(1, straight / base) : 1;
  const half = (base * fit) / 2;
  const rise = Math.max(0, input.rise) * fit;
  const center = Math.min(Math.max(input.center ?? (alongMin + alongMax) / 2, alongMin + half), alongMax - half);
  const cross = input.side === 'top' ? y0 : input.side === 'right' ? x1 : input.side === 'bottom' ? y1 : x0;

  return { x0, y0, x1, y1, r, center, cross, horizontal, half, rise, hasArrow: half > 0 && rise > 0 };
};

/** 上下边按 (x, y) 组装、左右边按 (y, x) —— 由 horizontal 决定，避免到处写三元 */
const pt = (horizontal: boolean, along: number, cross: number): string =>
  horizontal ? `${n(along)} ${n(cross)}` : `${n(cross)} ${n(along)}`;

/**
 * 各边在**顺时针遍历**（上 → 右 → 下 → 左）下的走向：
 * 上边自左向右、右边自上向下、下边自右向左、左边自下向上。
 *
 * - `dir`：该边沿轴坐标的**遍历**走向（+1 = 递增）。箭头两翼的先后顺序由它决定 ——
 *   先遇到 `center - dir·half`、后遇到 `center + dir·half`；顺序写反会让路径绕过其中一翼，
 *   剩下那段只能由角弧硬连，四角随之被拉变形；
 * - `outward`：箭尖相对该边坐标的偏移方向（-1 = 往坐标小的那侧，即面板外）。
 */
const EDGE_TRAVERSAL: Record<ArrowSide, { dir: 1 | -1; outward: 1 | -1 }> = {
  top: { dir: 1, outward: -1 },
  right: { dir: 1, outward: 1 },
  bottom: { dir: -1, outward: 1 },
  left: { dir: -1, outward: -1 },
};
const EDGE_ORDER: ArrowSide[] = ['top', 'right', 'bottom', 'left'];

/** 箭头两翼（按遍历先后）与箭尖三点：底边落在 `baseCross` 上，箭尖在 `tipCross` */
const arrowPoints = (
  side: ArrowSide,
  center: number,
  baseCross: number,
  tipCross: number,
  half: number,
  horizontal: boolean
) => {
  const { dir } = EDGE_TRAVERSAL[side];
  return {
    near: pt(horizontal, center - dir * half, baseCross),
    far: pt(horizontal, center + dir * half, baseCross),
    tip: pt(horizontal, center, tipCross),
  };
};

/**
 * 生成轮廓路径（`d` 属性值）：顺时针走一圈，箭头所在的那条边把直线拆成
 * 「交点 → 箭尖 → 交点」三段，四角用圆弧。
 *
 * 尺寸退化（宽或高不大于描边宽）时返回空串 —— 让调用方跳过绘制，而不是产出非法路径。
 */
export const buildArrowPanelPath = (input: ArrowPanelPathInput): string => {
  const g = resolve(input);
  if (!g) return '';
  const { x0, y0, x1, y1, r, center, cross, half, rise, hasArrow } = g;

  // 各边的遍历起点 / 终点（沿轴方向）与交叉轴坐标；起点即上一条命令的落点（M 或上一个角弧），
  // 二者相等即该边没有直边段。每条边自己是否沿 x 走，与箭头贴在哪条边无关，故逐边判定
  const edges: Record<ArrowSide, { from: number; to: number; cross: number; horizontal: boolean }> = {
    top: { from: x0 + r, to: x1 - r, cross: y0, horizontal: true },
    right: { from: y0 + r, to: y1 - r, cross: x1, horizontal: false },
    bottom: { from: x1 - r, to: x0 + r, cross: y1, horizontal: true },
    left: { from: y1 - r, to: y0 + r, cross: x0, horizontal: false },
  };
  // 每条边之后要连过去的角点，顺序与 EDGE_ORDER 一致
  const corners: [number, number][] = [
    [x1, y0 + r],
    [x1 - r, y1],
    [x0, y1 - r],
    [x0 + r, y0],
  ];

  const parts = [`M ${n(x0 + r)} ${n(y0)}`];
  EDGE_ORDER.forEach((edge, i) => {
    const { from, to, cross: edgeCross, horizontal } = edges[edge];
    // 直边段长度为 0（`rounded-full` 面板的上下边全是圆弧）时整条边让位给两侧角弧，
    // 不发 H/V：零长度线段在 round join 下会画出一个半径半个描边宽的小凸点
    const degenerate = Math.abs(to - from) < 1e-6;
    if (edge === input.side && hasArrow) {
      const { near, far, tip } = arrowPoints(
        edge,
        center,
        edgeCross,
        cross + EDGE_TRAVERSAL[edge].outward * rise,
        half,
        horizontal
      );
      // 箭头三段之后**必须继续走完这条边剩下的部分**（到 to）。漏掉它，路径会从远侧交点直接连到
      // 角点：那段弧的弦长超过直径，渲染器按规范把半径放大到刚好够用，于是画出一条巨大的弧 ——
      // 实测表现为气泡旁凭空多出一个圆环。
      parts.push(`L ${near} L ${tip} L ${far}`);
      if (!degenerate) parts.push(horizontal ? `H ${n(to)}` : `V ${n(to)}`);
    } else if (!degenerate) parts.push(horizontal ? `H ${n(to)}` : `V ${n(to)}`);
    const [cx, cy] = corners[i]!;
    parts.push(r > 0 ? `A ${n(r)} ${n(r)} 0 0 1 ${n(cx)} ${n(cy)}` : `L ${n(cx)} ${n(cy)}`);
  });
  parts.push('Z');
  return parts.join(' ');
};

/**
 * 楔形**内部**的填充路径（`fill` 用面板底色），底边刻意向面板内多伸 `overlap`。
 *
 * 为什么不与轮廓合并成一条：轮廓那条要 `fill: none` 才能只描边，而轮廓内部（面板主体）的底色
 * 由面板自己的 `background` 提供 —— 这样 `panelClass` 里的 `bg-*` 覆盖照旧生效，剪影只复刻、
 * 不夺权。于是只需为**凸出面板之外**的楔形补一块填充。
 *
 * `overlap` 的用处：楔形底边与面板底色若严格相切，两条各自抗锯齿的边会在接缝处露出一条发丝线；
 * 伸进去一点让两块不透明色重叠即可。重叠区会压在面板描边之上，但轮廓那条 path 在 SVG 内**后**
 * 绘制，会把它重新盖回描边色（调用方需保证绘制顺序：填充在前、轮廓在后）。
 */
export const buildArrowFillPath = (input: ArrowPanelPathInput, overlap = 1): string => {
  const g = resolve(input);
  if (!g || !g.hasArrow) return '';
  const { cross, horizontal, half, rise, center } = g;
  const { outward } = EDGE_TRAVERSAL[input.side];
  // 底边往面板内让 overlap（与面板底色重叠，杜绝发丝缝），箭尖仍在原处 —— 两者必须分别给
  const { near, far, tip } = arrowPoints(
    input.side,
    center,
    cross - outward * overlap,
    cross + outward * rise,
    half,
    horizontal
  );
  return `M ${near} L ${tip} L ${far} Z`;
};
