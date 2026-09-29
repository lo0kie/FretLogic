/**
 * 指板的 hover / focus 高亮管理：两套独立的落点语义 + 各自的合帧刷新。
 *
 * 从 `useFretboardInteraction` 里切出来，判据是这两套落点是**唯一**由指针位置驱动、又不改写模型的
 * 状态：悬停环随指针逐格移动，焦点环只在按下、右击、键盘导航时改写。它们与编辑出口正交，
 * 但被滑动绘制反过来消费（落笔要连带同步焦点环，见 `syncFocusPointTo`）。
 */
import { ref } from 'vue';

import { useRafThrottle } from '@/platform/composables/useRafThrottle';

import type { FretboardCanvasPoint } from '@/domains/fretboard/composables/useFretboardLayout';
import type { Ref } from 'vue';

/** 高亮落点：只要弦序号与品位。几何换算里的 rawStringFloat 属于内部量，不进高亮态 */
export interface FretboardHighlightPoint {
  stringIndex: number;
  fretIndex: number;
}

export interface FretboardHoverFocusOptions {
  /** 指针事件坐标 → 指板逻辑坐标；未命中有效区域时返回 null */
  getCanvasPoint: (clientX: number, clientY: number) => FretboardCanvasPoint | null;
}

export interface FretboardHoverFocusApi {
  hoverPoint: Ref<FretboardHighlightPoint | null>;
  focusPoint: Ref<FretboardHighlightPoint | null>;
  isFocused: Ref<boolean>;
  /** 把焦点落点同步到指定格（位置未变化时不触发响应式更新） */
  syncFocusPointTo: (sIdx: number, fIdx: number) => void;
  /** 按坐标立即刷新悬停高亮（pointerup 收尾要直发一次，不能走合帧） */
  syncHoverFromEvent: (clientX: number, clientY: number) => void;
  /** 指针移动的合帧入口：只保留最后一次位置 */
  scheduleHoverFromMove: (pos: { clientX: number; clientY: number }) => void;
  /** 丢弃待处理的 hover 帧 */
  cancelPendingHover: () => void;
  /** 指针离开：丢弃待处理帧并清空高亮 */
  clearHover: () => void;
  handleFocus: () => void;
  handleBlur: () => void;
}

export const useFretboardHoverFocus = ({ getCanvasPoint }: FretboardHoverFocusOptions): FretboardHoverFocusApi => {
  const hoverPoint = ref<FretboardHighlightPoint | null>(null);
  const focusPoint = ref<FretboardHighlightPoint | null>(null);
  const isFocused = ref(false);

  /** 按事件坐标刷新 hover 高亮点，位置未变化时不触发响应式更新 */
  const updateHoverFromEvent = (clientX: number, clientY: number) => {
    const pt = getCanvasPoint(clientX, clientY);
    const prev = hoverPoint.value;
    const changed = !pt || !prev || pt.stringIndex !== prev.stringIndex || pt.fretIndex !== prev.fretIndex;
    if (changed) hoverPoint.value = pt;
  };

  // hover 更新按帧合帧：只保留最后一次指针位置，避免高频 pointermove 重复做坐标换算
  const { schedule: scheduleHoverFrame, cancel: cancelHoverUpdate } = useRafThrottle<{
    clientX: number;
    clientY: number;
  }>(pos => updateHoverFromEvent(pos.clientX, pos.clientY));

  /**
   * 把焦点落点同步到指定格（位置未变化时不触发响应式更新）。
   *
   * 焦点环（空品位预览环 / 音符自身焦点环）与悬停环是两套独立的落点语义：悬停环随指针逐格移动，
   * 焦点环只在按下、右击、键盘导航时改写。滑动绘制期间若只刷新悬停而不管焦点，焦点环就会滞留在
   * 按下那一格——拖动越远偏离越大，松手后依然留在起点，看起来正是「预览圆点不在最终落点」。
   */
  const syncFocusPointTo = (sIdx: number, fIdx: number) => {
    const prev = focusPoint.value;
    if (prev?.stringIndex === sIdx && prev.fretIndex === fIdx) return;
    focusPoint.value = { stringIndex: sIdx, fretIndex: fIdx };
  };

  /** 指针离开：丢弃待处理的 hover 帧并清空高亮 */
  const clearHover = () => {
    cancelHoverUpdate();
    hoverPoint.value = null;
  };

  /** 获得键盘焦点：显示焦点框并一律重置到默认落点。
   *  不能沿用旧落点：失焦若未走 handleBlur（如焦点从未离开、仅靠 Tab 回归），
   *  焦点环会在用户上次点过的位置凭空复现。点击路径不受影响——pointerdown 里
   *  focus() 同步触发本函数后，紧接着就会把 focusPoint 写为真实点击落点 */
  const handleFocus = () => {
    isFocused.value = true;
    focusPoint.value = {
      stringIndex: 0,
      fretIndex: 0,
    };
  };

  /** 失焦：隐藏焦点框，并连同落点一起清空——避免残留落点被其它读取方当成「当前焦点位置」。
   *  注意 handleFocus 是**无条件**把落点置为默认值 {0,0}，并非「仅在 focusPoint 为空时」兜底
   *  （旧注释这么写，与实现相反）。 */
  const handleBlur = () => {
    isFocused.value = false;
    focusPoint.value = null;
  };

  return {
    hoverPoint,
    focusPoint,
    isFocused,
    syncFocusPointTo,
    syncHoverFromEvent: updateHoverFromEvent,
    scheduleHoverFromMove: pos => void scheduleHoverFrame(pos),
    cancelPendingHover: cancelHoverUpdate,
    clearHover,
    handleFocus,
    handleBlur,
  };
};
