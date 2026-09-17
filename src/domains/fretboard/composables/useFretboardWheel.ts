/**
 * 指板滚轮交互（与 useFretboardInteraction 解耦的 composable）：
 * 触摸板快速连续滚动按帧合帧，只保留最后累加值；
 * 命中已按音符时切换升降号（不触发品位偏移），未命中音符时调整品位偏移（capo）。
 */
import { canTogglePitchAccidental, getActiveBaseStrings, isOpen } from '@/domains/chord/theory/theory';
import { useRafThrottle } from '@/platform/composables/useRafThrottle';

import { INTERACTION_CONFIG } from '../constants';

import type { Tuning } from '@/domains/chord/theory/theory';
import type { GuitarStringsModel } from '@/domains/fretboard/types';

interface FretboardWheelPoint {
  stringIndex: number;
  fretIndex: number;
}

export interface FretboardWheelOptions {
  /** 指针坐标 → 指板逻辑坐标（弦/品位），未命中返回 null */
  getCanvasPoint: (clientX: number, clientY: number) => FretboardWheelPoint | null;
  getStrings: () => GuitarStringsModel;
  getFretCount: () => number;
  getFretOffset: () => number;
  getTuning: () => Tuning;
  /** 命中已按音符时切换升降号 */
  onTogglePitchName: (sIdx: number) => void;
  /** 品位偏移变更 */
  onFretOffsetChange: (fretOffset: number) => void;
}

export const useFretboardWheel = (options: FretboardWheelOptions) => {
  const { getCanvasPoint, getStrings, getFretCount, getFretOffset, getTuning, onTogglePitchName, onFretOffsetChange } =
    options;

  let wheelAccumulator = 0;

  const { schedule: scheduleWheelFrame } = useRafThrottle<{
    clientX: number;
    clientY: number;
    deltaY: number;
  }>(pending => {
    const point = getCanvasPoint(pending.clientX, pending.clientY);
    if (point) {
      const { stringIndex: sIdx, fretIndex: fIdx } = point;
      const currentStr = getStrings()[sIdx];
      // 悬停在已按音符上（含空弦 open 音符）：切换升降号，不触发品位偏移
      const isHoveringActiveNote =
        (fIdx > 0 && fIdx <= getFretCount() && currentStr?.[0] === fIdx) ||
        (fIdx === 0 && currentStr !== undefined && isOpen(currentStr));
      if (isHoveringActiveNote && currentStr !== undefined) {
        if (canTogglePitchAccidental(sIdx, currentStr[0], getFretOffset(), getActiveBaseStrings(getTuning()))) {
          onTogglePitchName(sIdx);
        }
        return;
      }
      // 空弦区域（SVG 起始线上方）非音符处：不响应滚轮
      if (fIdx === 0) return;
    }
    wheelAccumulator += pending.deltaY;
    if (Math.abs(wheelAccumulator) < INTERACTION_CONFIG.WHEEL_THRESHOLD) return;
    if (wheelAccumulator > 0) {
      onFretOffsetChange(Math.min(INTERACTION_CONFIG.MAX_CAPO_LIMIT, getFretOffset() + 1));
    } else {
      onFretOffsetChange(Math.max(INTERACTION_CONFIG.MIN_CAPO_LIMIT, getFretOffset() - 1));
    }
    wheelAccumulator = 0;
  });

  /** wheel 入口：只记录事件并按帧合帧处理，忽略 Ctrl/Cmd 缩放手势 */
  const handleWheel = (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) return;
    // 仅命中指板有效区域（品位格/空弦行）时才接管滚轮；和弦名区与容器其余部分放行默认滚动，不触发品位偏移
    if (!getCanvasPoint(e.clientX, e.clientY)) return;
    e.preventDefault();
    scheduleWheelFrame({ clientX: e.clientX, clientY: e.clientY, deltaY: e.deltaY });
  };

  return { handleWheel };
};
