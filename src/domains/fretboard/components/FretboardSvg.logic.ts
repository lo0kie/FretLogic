/**
 * FretboardSvg 纯逻辑模块：横按展示集合推导、几何/颜色计算、音符坐标等无响应式依赖部分。
 * 组件内保留状态、定时器与事件交互。
 */
import { computeBarreCandidates, isBarreStillValid } from '@/domains/fretboard/model/coordinates';

import { CANVAS_CONFIG, OPEN_STRING_MARKER_Y } from '../constants';

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

/** 横按梁填充色：已标记加深蓝色，推导未标记为更淡的蓝色 */
export const getBarreFill = (isMarked: boolean, isDarkMode: boolean): string => {
  if (isMarked) {
    return isDarkMode ? 'rgba(96, 165, 250, 0.62)' : 'rgba(59, 130, 246, 0.58)';
  }
  return isDarkMode ? 'rgba(96, 165, 250, 0.16)' : 'rgba(59, 130, 246, 0.14)';
};

/** 横按梁边框色：已标记为深色清晰描边，未标记为虚线更淡描边 */
export const getBarreStroke = (isMarked: boolean, isDarkMode: boolean): string => {
  if (isMarked) {
    return isDarkMode ? 'rgba(96, 165, 250, 0.90)' : 'rgba(59, 130, 246, 0.85)';
  }
  return isDarkMode ? 'rgba(96, 165, 250, 0.38)' : 'rgba(59, 130, 246, 0.35)';
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
  if (fret <= 0) {
    return OPEN_STRING_MARKER_Y;
  }
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
