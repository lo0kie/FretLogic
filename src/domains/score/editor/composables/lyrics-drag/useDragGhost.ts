import { ref } from 'vue';

import { getChordName } from '@/domains/chord/theory/theory';
import { useRafThrottle } from '@/platform/composables/useRafThrottle';

import type { Chord } from '@/domains/chord/types';
import type { ComponentPublicInstance } from 'vue';

/** 拖拽 ghost（跟随指针的和弦名浮层）管理：位置更新按帧合帧，避免高频写 transform */
export function useDragGhost() {
  const ghostChordName = ref('');
  let ghostEl: HTMLElement | null = null;

  /** 写入 ghost transform：按帧合帧，只应用最后一次指针位置 */
  const {
    schedule: scheduleGhostFrame,
    flush: flushGhostPos,
    cancel: cancelGhostPos,
  } = useRafThrottle<{
    x: number;
    y: number;
  }>(pos => {
    if (!ghostEl) return;
    ghostEl.style.transform = `translate3d(${pos.x}px, ${pos.y - 20}px, 0)`;
  });

  /** 挂载/卸载 ghost 元素，可选地立即定位到初始指针位置 */
  const setGhostEl = (el: Element | ComponentPublicInstance | null, initialPos?: { x: number; y: number }) => {
    ghostEl = el instanceof HTMLElement ? el : null;
    // 判据是「有没有传位置」，不是 `initialPos.x !== 0`：调用方传的 currentPointerPos 在 pointerdown
    // 时就已落值（从不是「无位置」的哨兵），用 x!==0 当代理会在指针恰位于视口左缘时误判成无位置，
    // ghost 首帧停在左上角直到下一次 pointermove 才归位。
    if (ghostEl && initialPos) ghostEl.style.transform = `translate3d(${initialPos.x}px, ${initialPos.y - 20}px, 0)`;
  };

  /** 记录新指针位置并按帧合帧应用 */
  const scheduleGhostPos = (x: number, y: number) => void scheduleGhostFrame({ x, y });

  /** 设置 ghost 显示的和弦名 */
  const setGhostChord = (chord: Chord) => {
    ghostChordName.value = getChordName(chord);
  };

  return {
    ghostChordName,
    setGhostEl,
    scheduleGhostPos,
    flushGhostPos,
    cancelGhostPos,
    setGhostChord,
  };
}
