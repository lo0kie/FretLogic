import type { Chord } from '@/types';
import { getChordName } from '@/utils/music/musicTheory';
import { ref, type ComponentPublicInstance } from 'vue';

export function useDragGhost() {
  const ghostChordName = ref('');
  let ghostEl: HTMLElement | null = null;
  let dragUpdateRafId = 0;
  let pendingDragPos: { x: number; y: number } | null = null;

  const setGhostEl = (el: Element | ComponentPublicInstance | null, initialPos?: { x: number; y: number }) => {
    ghostEl = el instanceof HTMLElement ? el : null;
    if (ghostEl && initialPos && initialPos.x !== 0) {
      ghostEl.style.transform = `translate3d(${initialPos.x}px, ${initialPos.y - 20}px, 0)`;
    }
  };

  const applyGhostTransform = () => {
    dragUpdateRafId = 0;
    const pos = pendingDragPos;
    pendingDragPos = null;
    if (!pos || !ghostEl) return;
    ghostEl.style.transform = `translate3d(${pos.x}px, ${pos.y - 20}px, 0)`;
  };

  const scheduleGhostPos = (x: number, y: number) => {
    pendingDragPos = { x, y };
    if (dragUpdateRafId) return;
    dragUpdateRafId = requestAnimationFrame(applyGhostTransform);
  };

  const flushGhostPos = () => {
    if (dragUpdateRafId) {
      cancelAnimationFrame(dragUpdateRafId);
      applyGhostTransform();
    }
  };

  const cancelGhostPos = () => {
    if (dragUpdateRafId) {
      cancelAnimationFrame(dragUpdateRafId);
      dragUpdateRafId = 0;
    }
    pendingDragPos = null;
  };

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
