/**
 * BaseSlider 纯逻辑模块：数值/几何计算、尺寸档位配置等与响应式无关的部分。
 * 组件内保留状态与事件绑定，此处所有导出均为纯函数或常量，便于独立测试。
 */

import { CONTROL_HEIGHT_CLASSES } from '@/platform/ui/controlSizes';

/** 计算数值的小数位数（兼容科学计数法表示） */
export const countDecimals = (n: number): number => {
  if (!isFinite(n)) return 0;
  const s = String(n).toLowerCase();
  if (s.includes('e')) {
    const [mantissa, expStr] = s.split('e');
    const exp = parseInt(expStr ?? '0', 10);
    const mantissaDecimals = mantissa?.includes('.') ? mantissa.split('.')[1]!.length : 0;
    return Math.max(0, mantissaDecimals - exp);
  }
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
};

/**
 * 尺寸档位样式表：除高度/内边距外，轨道厚度、拇指直径、极值内缩与命中区扩展一并按档位缩放，
 * 使 size 真正作用于「轨道高度与圆点大小」（与 props.size 文档一致）。
 * md 为设计基线，取值与既有视觉完全一致，保证存量 UI 零回归。
 */
export interface SliderSizeConfig {
  /** wrapper 高度与横向内边距 */
  wrapperClass: string;
  /** 横向基线 / 填充条厚度 */
  barClass: string;
  /** 纵向基线 / 填充条厚度 */
  barClassV: string;
  /** 拇指直径 */
  thumbClass: string;
  /** 极值内缩：取「拇指半径 - 3px」，使各档拇指溢出胶囊边框的幅度保持一致 */
  insetClass: string;
  insetClassV: string;
  /** 轨道纵向扩展命中区（矮档位收窄，避免与相邻控件重叠） */
  hitClass: string;
  /** width="auto" 时的固定轨道宽度 */
  autoWidth: string;
}

export const SLIDER_CONFIG: Record<'sm' | 'md' | 'lg', SliderSizeConfig> = {
  sm: {
    wrapperClass: `${CONTROL_HEIGHT_CLASSES.sm} px-xs`,
    barClass: 'h-0.5',
    barClassV: 'w-0.5',
    thumbClass: 'size-3',
    insetClass: 'right-[3px] left-[3px]',
    insetClassV: 'top-[3px] bottom-[3px]',
    hitClass: 'before:-inset-y-2',
    autoWidth: 'w-16',
  },
  md: {
    wrapperClass: `${CONTROL_HEIGHT_CLASSES.md} px-sm`,
    barClass: 'h-1',
    barClassV: 'w-1',
    thumbClass: 'size-3.5',
    insetClass: 'right-[4px] left-[4px]',
    insetClassV: 'top-[4px] bottom-[4px]',
    hitClass: 'before:-inset-y-4',
    autoWidth: 'w-24',
  },
  lg: {
    wrapperClass: 'h-10 px-sm',
    barClass: 'h-1.5',
    barClassV: 'w-1.5',
    thumbClass: 'size-4',
    insetClass: 'right-[5px] left-[5px]',
    insetClassV: 'top-[5px] bottom-[5px]',
    hitClass: 'before:-inset-y-4',
    autoWidth: 'w-32',
  },
};

/** 拇指定位样式：按值百分比位置渲染（vertical 时从底部起算） */
export const thumbPositionStyle = (pct: number, vertical: boolean): Record<string, string> => {
  if (vertical) return { bottom: `${pct}%`, left: '50%' };

  return { left: `${pct}%`, top: '50%' };
};

/** 填充条定位样式：单值从起点铺到 pct；区间取两拇指之间的段 */
export const activeBarStyleOf = (
  start: number,
  length: number,
  vertical: boolean,
  fromOrigin: boolean
): Record<string, string> => {
  if (vertical)
    return fromOrigin ? { bottom: '0%', height: `${length}%` } : { bottom: `${start}%`, height: `${length}%` };

  return fromOrigin ? { left: '0%', width: `${length}%` } : { left: `${start}%`, width: `${length}%` };
};

/** 刻度定位样式：按值换算百分比并居中平移 */
export const tickPositionStyle = (pct: number, vertical: boolean): Record<string, string> => {
  if (vertical) return { bottom: `${pct}%`, transform: 'translateY(50%)' };

  return { left: `${pct}%`, transform: 'translateX(-50%)' };
};

/** 修饰键步进倍率：Alt 精调 ×0.1，Shift 粗调 ×10 */
export const resolveMultiplier = (e?: { shiftKey?: boolean; altKey?: boolean }): number => {
  if (e?.altKey) return 0.1;
  if (e?.shiftKey) return 10;
  return 1;
};

/** 拖拽结束判断值是否变化：数组按分量比较，其余严格相等 */
export const isValueEqual = (v1: unknown, v2: unknown): boolean => {
  if (Array.isArray(v1) && Array.isArray(v2)) return v1[0] === v2[0] && v1[1] === v2[1];

  return v1 === v2;
};

/** 计算刻度取值集合：优先 marks 的键（夹紧到范围内），否则按步长均分（上限约 20 格） */
export const computeTickValues = (opts: {
  marks?: Record<number, string>;
  showTicks: boolean;
  min: number;
  max: number;
  step: number;
  snap: (val: number) => number;
}): number[] => {
  const { marks, showTicks, min, max, step, snap } = opts;
  if (marks && Object.keys(marks).length)
    return Object.keys(marks)
      .map(Number)
      .filter(v => v >= min && v <= max)
      .sort((a, b) => a - b);

  if (!showTicks || max <= min) return [];
  const stepVal = Math.max(step, (max - min) / 20);
  const out: number[] = [];
  for (let v = min; v <= max + 1e-9; v += stepVal) out.push(snap(v));
  return out;
};

/** 刻度文本：marks 提供标签时优先使用，否则回退数值本身 */
export const markLabelOf = (v: number, marks?: Record<number, string>): string =>
  marks ? (marks[v] ?? String(v)) : String(v);
