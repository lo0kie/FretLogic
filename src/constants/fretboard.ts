// 🎸 指板手感物理阻尼参数
export const INTERACTION_CONFIG = {
  MUTING_COOL_DOWN: 200, // 移动端滑动或快速切音的防抖冷却时间 (毫秒)
  WHEEL_THRESHOLD: 40, // 鼠标滚轮切换 Capo 的敏锐度阈值
  MAX_CAPO_LIMIT: 12, // 吉他最高有效品位平移限制
  MIN_CAPO_LIMIT: 0, // 空弦基础位
} as const;

// 🎸 响应式画布物理比例映射
export const FRETBOARD_SCALE_MAP: Record<number, number> = {
  3: 1.0, // 三品：正常无缩放比例
  4: 0.92, // 四品：物理长宽自适应压缩 92%
  5: 0.85, // 五品：高密度压缩至 85% 防止溢出屏幕
} as const;

export const FRETBOARD_LINE_WIDTH = 5;

// 🎸 几何矩阵参数
const STRING_SPACING = 64; // 竖线（琴弦）间距
const OFFSET_X = 45; // 左右边界几何微调
const OFFSET_X_RIGHT = 31;
const FRET_HEIGHT = 120; // 品格垂直高
const OFFSET_Y_TOP = 80; // 顶壳触点留白高
const OFFSET_Y_BOTTOM = 20;

export const CANVAS_CONFIG = {
  STRING_SPACING,
  FRET_HEIGHT,
  OFFSET_X,
  OFFSET_Y_TOP,
  OFFSET_Y_BOTTOM,
  BOARD_WIDTH: OFFSET_X + 5 * STRING_SPACING + OFFSET_X_RIGHT,
} as const;

import type { FretCount } from '@/types';
export const FRET_COUNTS: FretCount[] = [3, 4, 5];
