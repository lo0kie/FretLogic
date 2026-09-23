/**
 * FretboardSvg 纯逻辑模块：横按展示集合推导、几何/颜色计算、音符坐标等无响应式依赖部分。
 * 组件内保留状态、定时器与事件交互。
 */
import { CANVAS_CONFIG, OPEN_STRING_MARKER_Y } from '@/domains/fretboard/constants';
import { computeBarreCandidates, isBarreStillValid } from '@/domains/fretboard/model/coordinates';

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
  const validMarked = barres.filter(b => isBarreStillValid(strings, b) && b.fret >= 1 && b.fret <= fretCount);
  const candidates = computeBarreCandidates(strings, fretCount).filter(c => c.fret >= 1 && c.fret <= fretCount);

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

  // 采用稳定品位键 barre-fret-{fret}，琴弦跨度变化（如 xxx222 改为 xx2222）时复用已有 DOM 节点，触发平滑连续形态延展
  const fretCounters = new Map<number, number>();
  return Array.from(map.values()).map(({ barre, isMarked }) => {
    const count = fretCounters.get(barre.fret) ?? 0;
    fretCounters.set(barre.fret, count + 1);
    const key = count === 0 ? `barre-fret-${barre.fret}` : `barre-fret-${barre.fret}-${count}`;
    return {
      ...barre,
      isMarked,
      key,
    };
  });
};

/**
 * 从渲染 key 解析品位（格式见 computeDisplayBarres：`barre-fret-{fret}` / `barre-fret-{fret}-{count}`）。
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

/** 根据品位计算音符中心 Y 坐标：0 品/静音位于空弦标记位，1~N 品位于对应品格中心 */
export const getStringNoteY = (fret: number): number => {
  if (fret <= 0) return OPEN_STRING_MARKER_Y;

  return CANVAS_CONFIG.OFFSET_Y_TOP + (fret - 0.5) * CANVAS_CONFIG.FRET_HEIGHT;
};

/** 横按梁几何：圆角圆心对齐最外侧音符中心（pad = 厚度一半），y 对齐所在品中心 */
export const barreGeometryOf = (
  barre: BarreEntity,
  stringXPositions: number[],
  thickness: number
): { x: number; width: number; y: number } => {
  const pad = thickness / 2;
  const x1 = stringXPositions[barre.fromString] ?? 0;
  const x2 = stringXPositions[barre.toString] ?? 0;
  const xLeft = Math.min(x1, x2) - pad;
  const xRight = Math.max(x1, x2) + pad;
  return {
    x: xLeft,
    width: Math.max(0, xRight - xLeft),
    y: CANVAS_CONFIG.OFFSET_Y_TOP + (barre.fret - 0.5) * CANVAS_CONFIG.FRET_HEIGHT - pad,
  };
};
