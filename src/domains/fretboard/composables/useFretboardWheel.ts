/**
 * 指板滚轮交互（与 useFretboardInteraction 解耦的 composable）：
 * 触摸板快速连续滚动按帧合帧；命中已按音符时切换升降号（不触发品位偏移），未命中音符时调整品位偏移（capo）。
 *
 * 品位偏移是离散档位，手感基准是「鼠标滚轮一格 = 一档、触控板凑够一段距离 = 一档」（见 wheelDeltaOf）。
 */
import { canTogglePitchAccidental, getActiveBaseStrings, isOpen } from '@/domains/chord/theory/theory';
import { INTERACTION_CONFIG } from '@/domains/fretboard/constants';
import { useRafThrottle } from '@/platform/composables/useRafThrottle';

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

/** deltaMode 归一化系数（O6）：LINE 模式（Firefox）每行约 16px，PAGE 模式每页约 16 行 */
const normalizeDelta = (e: WheelEvent): number => {
  if (e.deltaMode === 1) return e.deltaY * 16;
  if (e.deltaMode === 2) return e.deltaY * 256;
  return e.deltaY;
};

/**
 * 鼠标滚轮「一格」的位移下限（px）：单条事件达到它即按一格计。
 * 鼠标滚轮一格普遍 100px（部分环境 53px），触控板逐帧小步普遍 ≤10px，两者量级不重叠。
 */
const WHEEL_NOTCH_PX = 50;

/**
 * 单条滚轮事件应计入累加值的位移量：鼠标滚轮按「格」计，触控板按像素计。
 *
 * 品位偏移是离散档位，滚轮就该一格一档；但两类输入的位移量级差了一个数量级：
 * 鼠标一格 100px 而 WHEEL_THRESHOLD 只有 40px，按像素折算会一格跳两档
 * （观感即「两行两行的翻页」）；触控板则是逐帧小步（单条 ≤10px），必须靠累加才凑够一档，
 * 且快速连滚要能连跳多档。故按量级分流：
 *  - 离散格（deltaMode 非像素，或位移 ≥ WHEEL_NOTCH_PX）只计入「一档」的量——
 *    连续拨轮自然累成多档，快速滚动的连跳能力不丢；
 *  - 触控板按真实像素累加，余量跨帧保留。
 * 两类输入因此都落在「一格 = 一档」的手感上。
 */
const wheelDeltaOf = (e: WheelEvent): number => {
  const delta = normalizeDelta(e);
  const isNotch = e.deltaMode !== 0 || Math.abs(delta) >= WHEEL_NOTCH_PX;
  return isNotch ? Math.sign(delta) * INTERACTION_CONFIG.WHEEL_THRESHOLD : delta;
};

export const useFretboardWheel = (options: FretboardWheelOptions) => {
  const { getCanvasPoint, getStrings, getFretCount, getFretOffset, getTuning, onTogglePitchName, onFretOffsetChange } =
    options;

  // O6：增量在事件入队时立即累加，而非按帧覆盖载荷——useRafThrottle 只保留最后一次载荷，
  // 帧间快速滚动会丢增量，导致触摸板滚动多格只响应一格。
  let wheelAccumulator = 0;

  const { schedule: scheduleWheelFrame } = useRafThrottle<{
    clientX: number;
    clientY: number;
  }>(pending => {
    const point = getCanvasPoint(pending.clientX, pending.clientY);
    if (point) {
      const { stringIndex: sIdx, fretIndex: fIdx } = point;
      const currentStr = getStrings()[sIdx];
      // 悬停在已按音符上（含空弦 open 音符）：切换升降号，不触发品位偏移
      const isHoveringActiveNote =
        (fIdx > 0 && fIdx <= getFretCount() && currentStr?.fret === fIdx) ||
        (fIdx === 0 && currentStr !== undefined && isOpen(currentStr));
      if (isHoveringActiveNote && currentStr !== undefined) {
        if (canTogglePitchAccidental(sIdx, currentStr.fret, getFretOffset(), getActiveBaseStrings(getTuning())))
          onTogglePitchName(sIdx);

        // 命中音符分支不消费偏移增量：清掉累加值，防止指针随后移出音符区时
        // 一次性跳多格（P1 审计 N 系）
        wheelAccumulator = 0;
        return;
      }
      // 空弦区域（SVG 起始线上方）非音符处：不响应滚轮，同样清累加值（防止移开后一次性跳格）
      if (fIdx === 0) {
        wheelAccumulator = 0;
        return;
      }
    }
    // 按阈值步进消费累加值：剩余量保留到后续帧，快速连滚可连续多格
    const steps = Math.trunc(wheelAccumulator / INTERACTION_CONFIG.WHEEL_THRESHOLD);
    if (steps === 0) return;
    wheelAccumulator -= steps * INTERACTION_CONFIG.WHEEL_THRESHOLD;
    const next = Math.min(
      INTERACTION_CONFIG.MAX_CAPO_LIMIT,
      Math.max(INTERACTION_CONFIG.MIN_CAPO_LIMIT, getFretOffset() + steps)
    );
    if (next !== getFretOffset()) onFretOffsetChange(next);
  });

  /** wheel 入口：只记录事件并按帧合帧处理，忽略 Ctrl/Cmd 缩放手势 */
  const handleWheel = (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) return;
    // 仅命中指板有效区域（品位格/空弦行）时才接管滚轮；和弦名区与容器其余部分放行默认滚动，不触发品位偏移
    if (!getCanvasPoint(e.clientX, e.clientY)) return;
    e.preventDefault();
    wheelAccumulator += wheelDeltaOf(e);
    scheduleWheelFrame({ clientX: e.clientX, clientY: e.clientY });
  };

  return { handleWheel };
};
