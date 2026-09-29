/**
 * FretboardSvg 纯逻辑模块：横按展示集合推导、几何/颜色计算、音符坐标等无响应式依赖部分。
 * 组件内保留状态、定时器与事件交互。
 */
import { computeBarreCandidates, isBarreStillValid } from '@/domains/fretboard/model/coordinates';
import { isBarreInWindow } from '@/domains/fretboard/model/fretGeometry';

import type { FretboardGeometry } from '@/domains/fretboard/model/fretboardGeometry';
import type { BarreEntity, GuitarStringsModel } from '@/domains/fretboard/types';

/** 展示用横按实体：在原始 BarreEntity 上附带标记态与稳定渲染 key */
export interface DisplayBarre extends BarreEntity {
  isMarked: boolean;
  key: string;
}

/**
 * 汇总当前指板上需要展示的所有横按（推导出的候选 + 已标记横按）：
 * - 已标记横按（用户显式设置）：isMarked = true
 * - 推导出的未标记横按：isMarked = false
 */
export const computeDisplayBarres = (
  strings: GuitarStringsModel,
  barres: BarreEntity[],
  fretCount: number
): DisplayBarre[] => {
  const validMarked = barres.filter(b => isBarreStillValid(strings, b) && isBarreInWindow(b.fret, fretCount));
  const candidates = computeBarreCandidates(strings, fretCount).filter(c => isBarreInWindow(c.fret, fretCount));

  const map = new Map<string, { barre: BarreEntity; isMarked: boolean }>();

  // 1. 注入推导出的候选横按（初始为未标记）
  for (const c of candidates) {
    const key = `${c.fret}_${c.fromString}_${c.toString}`;
    map.set(key, { barre: c, isMarked: false });
  }

  // 2. 将已有标记的横按设为已标记（覆盖已有候选或补充特例）
  for (const m of validMarked) {
    const key = `${m.fret}_${m.fromString}_${m.toString}`;
    map.set(key, { barre: m, isMarked: true });
  }

  // 稳定键 =「品位 + 段右端弦（toString，恒 ≥ fromString，见 isBarreStillValid 的端点校验）」：
  // 同品的横按段互不相交（候选按连续段切分、已标记经 normalizeAndMergeBarres 合并），右端弦在同品内
  // 唯一 → key 即段的身份，同品相邻段的存亡互不影响彼此的 key：
  // - 旧版按「同品第几条」压紧编号（barre-fret-1 / barre-fret-1-1），左段消失后右段顶替其 key——
  //   Vue keyed diff 会把左段的 DOM 节点复用给右段，而横按梁带 transition-all，右段便从左段几何
  //   动画滑移过去（11x111 点掉左段一个音，右侧横按无故动画，感知为鬼影）；
  // - 跨度变化但右端不变时（如 xxx222 → xx2222，向低音弦侧生长），key 不变 → 节点复用，
  //   平滑连续形态延展保留（延续旧版「稳定品位键」的设计意图）。
  // 同品同右端的子跨度并存（标记 [4,5] 与后出现的候选 [3,5]）是唯一可能撞 key 的形态，
  // 此时追加 fromString 消歧 —— 该形态下让渡平滑延展，身份正确优先。
  const entries = Array.from(map.values());
  const rightEndCount = new Map<string, number>();
  for (const { barre } of entries) {
    const k = `${barre.fret}_${barre.toString}`;
    rightEndCount.set(k, (rightEndCount.get(k) ?? 0) + 1);
  }
  return entries.map(({ barre, isMarked }) => {
    const ambiguous = (rightEndCount.get(`${barre.fret}_${barre.toString}`) ?? 0) > 1;
    const key = ambiguous
      ? `barre-fret-${barre.fret}-${barre.toString}-${barre.fromString}`
      : `barre-fret-${barre.fret}-${barre.toString}`;
    return {
      ...barre,
      isMarked,
      key,
    };
  });
};

/** 横按入场 / 退场动画的锚点：left/right = 向另一侧展开/收缩，center = 中点 */
export type BarreAnimOrigin = 'left center' | 'center center' | 'right center';

/** 横按梁几何：x / y / width（与 SVG 属性同单位，供几何插值直接使用） */
export interface BarreBeamGeom {
  x: number;
  y: number;
  width: number;
}

/**
 * 锚点处的「起手块」几何：入场从它长出来、退场缩回它。
 *
 * 起手块是边长等于梁厚的**方块**，而不是零宽 —— 零宽起步在屏幕上就是「无中生有」的一条细线，
 * 方块起步才读得出「一个小方块展开」。锚点决定方块贴在哪一侧：left 左缘贴锚点（向右展开）、
 * right 右缘贴锚点（向左展开）、center 以锚点居中（向两边展开）。
 *
 * 梁的展开 / 收缩走**几何插值**（x / width），不走 transform 缩放：本项目的梁是 rx = 厚度/2 的
 * 胶囊，缩放会把描边宽度与两端圆角一起拉扁。
 */
export const blockGeomAt = (geom: BarreBeamGeom, origin: BarreAnimOrigin, blockWidth: number): BarreBeamGeom => {
  const width = Math.min(blockWidth, geom.width);
  const anchorX =
    origin === 'right center' ? geom.x + geom.width : origin === 'center center' ? geom.x + geom.width / 2 : geom.x;
  const x = origin === 'right center' ? anchorX - width : origin === 'center center' ? anchorX - width / 2 : anchorX;
  return { x, y: geom.y, width };
};

/** 两个几何是否等价（忽略亚像素抖动，避免无谓的动画） */
export const sameBarreGeom = (a: BarreBeamGeom, b: BarreBeamGeom): boolean =>
  Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01 && Math.abs(a.width - b.width) < 0.01;

/** 某弦是否恰好按在横按品位上（横按锚点的判定口径） */
const pressedAtFret = (strings: GuitarStringsModel, stringIndex: number, fret: number): boolean =>
  strings[stringIndex]?.fret === fret;

/**
 * 入场锚点：对比**上一帧按弦**，新横按的两端在出现前哪些已有音符。
 *
 * 锚点即横按「长出来的地方」——已有音符的一端是视觉锚，展开从锚点朝新放的音符方向进行：
 * - 两端都已有音符（1x1 点中间补成 111）→ 从中点向两边展开（origin center）；
 * - 仅 from 端已有（1 → 11）→ 从左向右展开（origin left）；
 * - 仅 to 端已有（x1 → x11）→ 从右向左展开（origin right）；
 * - 两端都是新放的（首帧挂载等）→ 退回默认左起（与既有入场动画一致）。
 */
export const resolveBarreEnterOrigin = (prevStrings: GuitarStringsModel, barre: BarreEntity): BarreAnimOrigin => {
  const fromPressed = pressedAtFret(prevStrings, barre.fromString, barre.fret);
  const toPressed = pressedAtFret(prevStrings, barre.toString, barre.fret);
  if (fromPressed && toPressed) return 'center center';
  if (fromPressed) return 'left center';
  if (toPressed) return 'right center';
  return 'left center';
};

/**
 * 退场锚点：横按消失时，对比**当前按弦**（消失后），两端哪些音符还在。
 *
 * 横按收缩向仍在的音符锚点靠拢（视觉上「收回到剩下的音符」），避免朝空处收缩：
 * - 两端音符都还在（如中点被移走破坏连贯性，111 → 1x1）→ 向中点收缩并淡出（origin center）；
 * - 仅 from 端还在 → 向左端收缩（origin left）；
 * - 仅 to 端还在 → 向右端收缩（origin right）；
 * - 两端都没了 → 原地淡出（origin center）。
 */
export const resolveBarreExitOrigin = (strings: GuitarStringsModel, barre: BarreEntity): BarreAnimOrigin => {
  const fromPressed = pressedAtFret(strings, barre.fromString, barre.fret);
  const toPressed = pressedAtFret(strings, barre.toString, barre.fret);
  if (fromPressed && toPressed) return 'center center';
  if (fromPressed) return 'left center';
  if (toPressed) return 'right center';
  return 'center center';
};

/**
 * 两条横按是否可能属于同一条段：同品位且弦跨度相交。
 *
 * 判据与 useBarreBubble 的段身份口径同源：同品段的跨度互不相交（候选按连续段切分），相交即同一条。
 */
export const barresOverlap = (a: BarreEntity, b: BarreEntity): boolean => {
  if (a.fret !== b.fret) return false;
  const aMin = Math.min(a.fromString, a.toString);
  const aMax = Math.max(a.fromString, a.toString);
  const bMin = Math.min(b.fromString, b.toString);
  const bMax = Math.max(b.fromString, b.toString);
  return aMin <= bMax && aMax >= bMin;
};

/**
 * 段身份延续判定：在上一代展示横按里找「同一条」——同品位且弦跨度相交。
 *
 * key 编码段右端弦，故跨度变化（如 0-1 → 0-2）会换 key、节点卸载重建。渲染层靠本函数认出
 * 「重建的其实是同一条的变形」，取旧几何当动画起点 —— 于是同一条梁无论节点是否复用都从
 * 「它原来在哪」长到新位置，而不是重播一次入场。拆分（111111 → 111x11）也走这条：
 * 新出现的左段与上一帧那条整梁相交，便从整梁几何收拢过去，中段像被「断开」。
 */
export const findContinuedBarre = (prev: DisplayBarre[], barre: DisplayBarre): DisplayBarre | null =>
  prev.find(p => barresOverlap(p, barre)) ?? null;

/**
 * 上一帧里与新横按「同一条」的那条 —— 动画起点几何的来源。
 *
 * 先按渲染 key 精确命中：key 相同 = Vue 复用了同一个节点，元素此刻显示的就是那条的几何，
 * 从这里起步不会跳。命中不到（跨度变化换了 key、节点被重建）再退化为同品位跨度相交：
 * 那时元素是新建的，只能靠「上一帧那条同一条原来在哪」认回身份。
 */
export const findPredecessor = (prev: DisplayBarre[], barre: DisplayBarre): DisplayBarre | null =>
  prev.find(p => p.key === barre.key) ?? findContinuedBarre(prev, barre);

/**
 * 拆分时各段的起点几何：把上一帧那条整梁按「相邻两段的断点」切开，两段各自从断开处向外收拢。
 *
 * 断点取相邻两段目标跨度之间的中点 —— 也就是被释放的那根弦所在处，于是观感正是「从断开处向两边走」。
 *
 * 两侧各让出 `bleed` 的重叠量：取圆角半径时两段的端头圆角恰好互补，起步那一帧的并集仍是一条
 * 完整胶囊（不会在断开处露出凹口）；再大就会在半透明填充上叠深一档，正是要避免的那种闪烁。
 *
 * @returns 与 `targets` **同序**的起点几何；调用方取不到时（理论上不会）应退化为「原地不动」
 */
export const splitStartGeoms = (parent: BarreBeamGeom, targets: BarreBeamGeom[], bleed: number): BarreBeamGeom[] => {
  const sorted = targets.map((geom, index) => ({ geom, index })).sort((a, b) => a.geom.x - b.geom.x);

  // 相邻两段之间的断点
  const breaks = sorted.slice(0, -1).map((item, i) => {
    const next = sorted[i + 1];
    return next ? (item.geom.x + item.geom.width + next.geom.x) / 2 : 0;
  });

  const starts: BarreBeamGeom[] = [];
  sorted.forEach((item, rank) => {
    const left = rank === 0 ? parent.x : (breaks[rank - 1] ?? parent.x) - bleed;
    const right = rank === sorted.length - 1 ? parent.x + parent.width : (breaks[rank] ?? 0) + bleed;
    starts[item.index] = { x: left, y: parent.y, width: Math.max(0, right - left) };
  });
  return starts;
};

/**
 * 从渲染 key 解析品位（格式见 computeDisplayBarres：`barre-fret-{fret}-{toString}`，
 * 子跨度消歧形态再追加 `-{fromString}`）。
 *
 * 单独抽出、而不是各调用点自行 `split('-')` 取下标：key 格式一旦变更，下标法会**静默失效**
 * 而不报错——历史上调用点按 `split('-')[1]` 取到的是字面量 `'fret'`，`Number('fret') === NaN`，
 * `b.fret === NaN` 恒为 false，那条「同品延续」分支因此从未生效过。格式只在此处定义一次。
 *
 * @returns 品位；无法解析时返回 `null`，调用方必须显式处理，不得拿 `NaN` 参与比较
 */
export const parseBarreFretFromKey = (key: string): number | null => {
  const match = /^barre-fret-(\d+)(?:-|$)/.exec(key);
  return match ? Number(match[1]) : null;
};

/**
 * 横按梁填充色：已标记加深蓝色，推导未标记为更淡的蓝色。
 *
 * 色值本体是令牌 `--fb-barre-rgb`（明/暗两档见 tokens/ 的 --fb-barre-rgb），此处只决定 alpha——
 * 亮度差由 alpha 表达，而不是另存一组深浅色值：同一族梁的四个状态（标记/未标记 × 明/暗）
 * 共用一条源色，改源色时四者同步。
 *
 * 高对比主题必须单独一档：HC 的 `--fb-barre-rgb` 刻意沿用明色档（见 tokens/themes/light.ts 的说明），
 * 而底色是近黑 `#0a0a0c`，沿用暗色档的 0.16 叠出来几乎不可见——未标记横按在编辑器里等于消失。
 * （导出侧画的是不透明 `--fbc-barre`，HC 下为纯白，两端口径本就相差最大。）
 */
export const getBarreFill = (isMarked: boolean, isDarkMode: boolean, isHighContrast = false): string => {
  if (isHighContrast) return `rgba(var(--fb-barre-rgb), ${isMarked ? 0.92 : 0.55})`;
  const a = isMarked ? (isDarkMode ? 0.62 : 0.58) : isDarkMode ? 0.16 : 0.14;
  return `rgba(var(--fb-barre-rgb), ${a})`;
};

/** 横按梁边框色：已标记为深色清晰描边，未标记为虚线更淡描边（源色同 getBarreFill，高对比档同理） */
export const getBarreStroke = (isMarked: boolean, isDarkMode: boolean, isHighContrast = false): string => {
  if (isHighContrast) return `rgba(var(--fb-barre-rgb), ${isMarked ? 1 : 0.8})`;
  const a = isMarked ? (isDarkMode ? 0.9 : 0.85) : isDarkMode ? 0.38 : 0.35;
  return `rgba(var(--fb-barre-rgb), ${a})`;
};

/** 指位是否落在横按覆盖范围内（同品且弦序位于跨度内） */
export const isPointInBarre = (pt: { stringIndex: number; fretIndex: number } | null, b: BarreEntity): boolean => {
  if (!pt) return false;
  if (pt.fretIndex !== b.fret) return false;
  const minS = Math.min(b.fromString, b.toString);
  const maxS = Math.max(b.fromString, b.toString);
  return pt.stringIndex >= minS && pt.stringIndex <= maxS;
};

/**
 * 根据品位计算音符中心 Y 坐标：0 品/静音位于空弦标记位，1~N 品位于对应品格中心（算式与 Canvas 同源）。
 *
 * `geometry` 必须传**当前这张图**的实例（见 interactiveGeometryFor）：1 品以下的坐标自网格顶起算，
 * 而网格顶随「本图是否画弦枕」上下移一条弦枕。空弦标记位本身不含弦枕，取哪一份都一样。
 */
export const getStringNoteY = (fret: number, geometry: FretboardGeometry): number => {
  if (fret <= 0) return geometry.markerCenterY;

  return geometry.fretCenterY(fret);
};

/**
 * 横按梁几何：算式与 Canvas 同源（见 model/fretGeometry），厚度与网格顶由本侧几何代入。
 *
 * `geometry` 必须传**当前这张图**的实例（见 interactiveGeometryFor）：横按梁纵向对齐品格中心，
 * 而网格顶随「本图是否画弦枕」上下移一条弦枕。
 */
export const barreGeometryOf = (
  barre: BarreEntity,
  stringXPositions: number[],
  geometry: FretboardGeometry
): { x: number; width: number; y: number } => {
  const rect = geometry.barreRect(barre.fret, {
    fromX: stringXPositions[barre.fromString] ?? 0,
    toX: stringXPositions[barre.toString] ?? 0,
  });
  return { x: rect.x, width: rect.width, y: rect.y };
};
