/**
 * @Author likan
 * @Date 2026-05-29 10:36:32
 * @Filepath fret-logic\src\composables\useFretboardInteraction.ts
 */

import { CANVAS_CONFIG } from '@/constants';
import { useChordLabStore } from '@/stores/chordLabStore';
import { useEventListener, useThrottleFn } from '@vueuse/core';
import { onMounted, type Ref } from 'vue';

export function useFretboardInteraction(fretBoardRef: Ref<HTMLDivElement | null>) {
  const chordLabStore = useChordLabStore();

  let lastCancelTime = 0;
  const MUTING_COOL_DOWN = 200;
  let lastSIdx = -1;
  let lastFIdx = -1;
  let cachedBoardRect: DOMRect | null = null;

  const handleLocalToggleOpenString = (sIdx: number) => {
    if (chordLabStore.rootMark === sIdx) chordLabStore.rootMark = -1;
    chordLabStore.toggleOpenString(sIdx);
  };

  const handleOpenStringRightClick = (sIdx: number) => {
    if (chordLabStore.rootMark === sIdx && chordLabStore.selectedFrets[sIdx] === 0) {
      chordLabStore.rootMark = -1;
    } else {
      chordLabStore.selectedFrets[sIdx] = 0;
      chordLabStore.rootMark = sIdx;
    }
  };

  const handleFretRightClick = (sIdx: number) => {
    chordLabStore.rootMark = chordLabStore.rootMark === sIdx ? -1 : sIdx;
  };

  const handleCanvasRightClick = (e: MouseEvent) => {
    if (!fretBoardRef.value) return;
    const board = fretBoardRef.value.getBoundingClientRect();
    const scaleX = board.width / CANVAS_CONFIG.BOARD_WIDTH;
    const scaleY =
      board.height /
      (CANVAS_CONFIG.OFFSET_Y_TOP +
        chordLabStore.fretCount * CANVAS_CONFIG.FRET_HEIGHT +
        CANVAS_CONFIG.OFFSET_Y_BOTTOM);
    const canvasX = (e.clientX - board.left) / scaleX;
    const canvasY = (e.clientY - board.top) / scaleY;

    const sIdx = Math.round((canvasX - CANVAS_CONFIG.OFFSET_X) / CANVAS_CONFIG.STRING_SPACING);
    const fretAreaY = canvasY - CANVAS_CONFIG.OFFSET_Y_TOP;
    const fIdx = fretAreaY > 0 ? Math.floor(fretAreaY / CANVAS_CONFIG.FRET_HEIGHT) + 1 : 0;

    if (sIdx >= 0 && sIdx <= 5 && fIdx >= 1 && fIdx <= chordLabStore.fretCount) {
      if (chordLabStore.selectedFrets[sIdx] === fIdx) {
        handleFretRightClick(sIdx);
        return;
      }
      if (chordLabStore.rootMark === sIdx) chordLabStore.rootMark = -1;
      chordLabStore.selectedFrets[sIdx] = fIdx;
      chordLabStore.rootMark = sIdx;
    }
  };

  const handleFingerClickLogic = (clientX: number, clientY: number, isMoveEvent = false) => {
    const board = cachedBoardRect || (fretBoardRef.value ? fretBoardRef.value.getBoundingClientRect() : null);
    if (!board) return;

    const scaleX = board.width / CANVAS_CONFIG.BOARD_WIDTH;
    const scaleY =
      board.height /
      (CANVAS_CONFIG.OFFSET_Y_TOP +
        chordLabStore.fretCount * CANVAS_CONFIG.FRET_HEIGHT +
        CANVAS_CONFIG.OFFSET_Y_BOTTOM);
    const canvasX = (clientX - board.left) / scaleX;
    const canvasY = (clientY - board.top) / scaleY;

    const sIdx = Math.round((canvasX - CANVAS_CONFIG.OFFSET_X) / CANVAS_CONFIG.STRING_SPACING);
    const fretAreaY = canvasY - CANVAS_CONFIG.OFFSET_Y_TOP;
    const fIdx = fretAreaY > 0 ? Math.floor(fretAreaY / CANVAS_CONFIG.FRET_HEIGHT) + 1 : 0;

    if (sIdx >= 0 && sIdx <= 5 && fIdx >= 1 && fIdx <= chordLabStore.fretCount) {
      if (isMoveEvent && lastSIdx === sIdx && lastFIdx === fIdx) return;
      const isSameFret = chordLabStore.selectedFrets[sIdx] === fIdx;

      if (isSameFret) {
        chordLabStore.selectedFrets[sIdx] = -1;
        lastSIdx = -1;
        lastFIdx = -1;
        if (chordLabStore.rootMark === sIdx) chordLabStore.rootMark = -1;
        lastCancelTime = Date.now();
      } else {
        if (isMoveEvent && Date.now() - lastCancelTime < MUTING_COOL_DOWN) {
          lastSIdx = -1;
          lastFIdx = -1;
          return;
        }
        if (chordLabStore.rootMark === sIdx) chordLabStore.rootMark = -1;
        chordLabStore.selectedFrets[sIdx] = fIdx;
        lastSIdx = sIdx;
        lastFIdx = fIdx;
      }
    }
  };

  const handlePointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    if (fretBoardRef.value) cachedBoardRect = fretBoardRef.value.getBoundingClientRect();
    chordLabStore.isDraggingFinger = true;
    lastSIdx = -1;
    lastFIdx = -1;
    handleFingerClickLogic(e.clientX, e.clientY, false);
  };

  const handlePointerMove = useThrottleFn((e: PointerEvent) => {
    if (!chordLabStore.isDraggingFinger) return;
    handleFingerClickLogic(e.clientX, e.clientY, true);
  }, 16);

  const handlePointerUp = () => {
    chordLabStore.isDraggingFinger = false;
    lastSIdx = -1;
    lastFIdx = -1;
    cachedBoardRect = null;
  };

  onMounted(() => {
    if (fretBoardRef.value) {
      useEventListener(fretBoardRef, 'pointerdown', handlePointerDown);
      useEventListener(window, 'pointermove', handlePointerMove);
      useEventListener(window, 'pointerup', handlePointerUp);
    }
  });

  return {
    handleLocalToggleOpenString,
    handleOpenStringRightClick,
    handleFretRightClick,
    handleCanvasRightClick,
  };
}
