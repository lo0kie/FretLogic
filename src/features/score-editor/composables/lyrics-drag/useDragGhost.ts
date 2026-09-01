import type { Chord } from '@/types';
import { getChordName } from '@/utils/music/musicTheory';
import { ref, type ComponentPublicInstance } from 'vue';

/** 拖拽 ghost（跟随指针的和弦名浮层）管理：位置更新按帧合帧，避免高频写 transform */
export function useDragGhost() {
  const ghostChordName = ref('');
  let ghostEl: HTMLElement | null = null;
  let dragUpdateRafId = 0;
  let pendingDragPos: { x: number; y: number } | null = null;

  /** 挂载/卸载 ghost 元素，可选地立即定位到初始指针位置 */
  const setGhostEl = (el: Element | ComponentPublicInstance | null, initialPos?: { x: number; y: number }) => {
    ghostEl = el instanceof HTMLElement ? el : null;
    if (ghostEl && initialPos && initialPos.x !== 0) {
      ghostEl.style.transform = `translate3d(${initialPos.x}px, ${initialPos.y - 20}px, 0)`;
    }
  };

  /** 把待处理位置写入 ghost transform（rAF 回调） */
  const applyGhostTransform = () => {
    dragUpdateRafId = 0;
    const pos = pendingDragPos;
    pendingDragPos = null;
    if (!pos || !ghostEl) return;
    ghostEl.style.transform = `translate3d(${pos.x}px, ${pos.y - 20}px, 0)`;
  };

  /** 记录新指针位置并按帧合帧应用 */
  const scheduleGhostPos = (x: number, y: number) => {
    pendingDragPos = { x, y };
    if (dragUpdateRafId) return;
    dragUpdateRafId = requestAnimationFrame(applyGhostTransform);
  };

  /** 立即应用待处理位置（松手时保证 ghost 不滞后） */
  const flushGhostPos = () => {
    if (dragUpdateRafId) {
      cancelAnimationFrame(dragUpdateRafId);
      applyGhostTransform();
    }
  };

  /** 取消待处理的位置更新 */
  const cancelGhostPos = () => {
    if (dragUpdateRafId) {
      cancelAnimationFrame(dragUpdateRafId);
      dragUpdateRafId = 0;
    }
    pendingDragPos = null;
  };

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
