import { CANVAS_CONFIG } from '@/constants';
import { useEditorStore } from '@/stores/editorStore';
import { isMuted, isOpen } from '@/utils/musicTheory';
import { useEventListener } from '@vueuse/core';
import { onBeforeUnmount, onMounted, type Ref } from 'vue';

export function useFretboardInteraction(fretBoardRef: Ref<HTMLDivElement | null>) {
  const editorStore = useEditorStore();

  let lastCancelTime = 0;
  const MUTING_COOL_DOWN = 200;
  let lastSIdx = -1;
  let lastFIdx = -1;
  let cachedBoardRect: DOMRect | null = null;
  let wheelAccumulator = 0;
  const WHEEL_THRESHOLD = 40;

  const handleLocalToggleOpenString = (sIdx: number) => {
    editorStore.toggleOpenString(sIdx);
  };

  const handleOpenStringRightClick = (sIdx: number) => {
    const str = editorStore.strings[sIdx];
    if (str.isRoot && isOpen(str)) {
      str.isRoot = false;
    } else {
      editorStore.strings.forEach(s => {
        s.isRoot = false;
      });
      str.fret = 0;
      str.isRoot = true;
    }
  };

  const handleFretRightClick = (sIdx: number) => {
    const str = editorStore.strings[sIdx];
    if (str.fret < 0) return;
    const wasRoot = str.isRoot;
    editorStore.strings.forEach(s => {
      s.isRoot = false;
    });
    str.isRoot = !wasRoot;
  };

  const handleFretMiddleClick = (sIdx: number) => {
    const str = editorStore.strings[sIdx];
    if (isMuted(str)) return;

    const base = editorStore.activeBaseStrings[sIdx];
    const actualOffset = str.fret > 0 && editorStore.capo > 0 ? editorStore.capo : 0;
    const noteIndex = (base + str.fret + actualOffset) % 12;
    const isAccidental = [1, 3, 6, 8, 10].includes(noteIndex);
    if (isAccidental) {
      str.preferFlat = !str.preferFlat;
    }
  };

  const handleCanvasRightClick = (e: MouseEvent) => {
    if (!fretBoardRef.value) return;
    const board = fretBoardRef.value.getBoundingClientRect();
    const scaleX = board.width / CANVAS_CONFIG.BOARD_WIDTH;
    const scaleY =
      board.height /
      (CANVAS_CONFIG.OFFSET_Y_TOP + editorStore.fretCount * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.OFFSET_Y_BOTTOM);
    const canvasX = (e.clientX - board.left) / scaleX;
    const canvasY = (e.clientY - board.top) / scaleY;
    const sIdx = Math.round((canvasX - CANVAS_CONFIG.OFFSET_X) / CANVAS_CONFIG.STRING_SPACING);
    const fretAreaY = canvasY - CANVAS_CONFIG.OFFSET_Y_TOP;
    const fIdx = fretAreaY > 0 ? Math.floor(fretAreaY / CANVAS_CONFIG.FRET_HEIGHT) + 1 : 0;

    if (sIdx >= 0 && sIdx <= 5 && fIdx >= 1 && fIdx <= editorStore.fretCount) {
      const str = editorStore.strings[sIdx];
      if (str.fret === fIdx) {
        handleFretRightClick(sIdx);
        return;
      }
      editorStore.strings.forEach(s => {
        s.isRoot = false;
      });
      str.fret = fIdx;
      str.isRoot = true;
    }
  };

  const handleFingerClickLogic = (clientX: number, clientY: number, isMoveEvent = false) => {
    const board = cachedBoardRect || (fretBoardRef.value ? fretBoardRef.value.getBoundingClientRect() : null);
    if (!board) return;

    const scaleX = board.width / CANVAS_CONFIG.BOARD_WIDTH;
    const scaleY =
      board.height /
      (CANVAS_CONFIG.OFFSET_Y_TOP + editorStore.fretCount * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.OFFSET_Y_BOTTOM);
    const canvasX = (clientX - board.left) / scaleX;
    const canvasY = (clientY - board.top) / scaleY;
    const sIdx = Math.round((canvasX - CANVAS_CONFIG.OFFSET_X) / CANVAS_CONFIG.STRING_SPACING);
    const fretAreaY = canvasY - CANVAS_CONFIG.OFFSET_Y_TOP;
    const fIdx = fretAreaY > 0 ? Math.floor(fretAreaY / CANVAS_CONFIG.FRET_HEIGHT) + 1 : 0;

    if (sIdx >= 0 && sIdx <= 5 && fIdx >= 1 && fIdx <= editorStore.fretCount) {
      if (isMoveEvent && lastSIdx === sIdx && lastFIdx === fIdx) return;
      const str = editorStore.strings[sIdx];
      const isSameFret = str.fret === fIdx;

      if (isSameFret) {
        str.fret = -1;
        str.isRoot = false;
        lastSIdx = -1;
        lastFIdx = -1;
        lastCancelTime = Date.now();
      } else {
        if (isMoveEvent && Date.now() - lastCancelTime < MUTING_COOL_DOWN) {
          lastSIdx = -1;
          lastFIdx = -1;
          return;
        }
        str.fret = fIdx;

        lastSIdx = sIdx;
        lastFIdx = fIdx;
      }
    }
  };

  let ticking = false;
  let rAF_ID = 0;
  const cleanupListeners: (() => void)[] = [];

  const handlePointerMove = (e: PointerEvent) => {
    if (!editorStore.isDraggingFinger || ticking) return;
    ticking = true;
    rAF_ID = requestAnimationFrame(() => {
      handleFingerClickLogic(e.clientX, e.clientY, true);
      ticking = false;
    });
  };

  const handlePointerUp = () => {
    editorStore.isDraggingFinger = false;
    lastSIdx = -1;
    lastFIdx = -1;
    cachedBoardRect = null;
    if (rAF_ID) cancelAnimationFrame(rAF_ID);
    ticking = false;
    cleanupListeners.forEach(cleanup => cleanup());
    cleanupListeners.length = 0;
  };

  const handlePointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    if (fretBoardRef.value) cachedBoardRect = fretBoardRef.value.getBoundingClientRect();
    editorStore.isDraggingFinger = true;
    lastSIdx = -1;
    lastFIdx = -1;
    handleFingerClickLogic(e.clientX, e.clientY, false);

    cleanupListeners.push(useEventListener(window, 'pointermove', handlePointerMove));
    cleanupListeners.push(useEventListener(window, 'pointerup', handlePointerUp));
  };

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    wheelAccumulator += e.deltaY;
    if (Math.abs(wheelAccumulator) < WHEEL_THRESHOLD) return;

    if (wheelAccumulator > 0) editorStore.capo = Math.min(12, editorStore.capo + 1);
    else editorStore.capo = Math.max(0, editorStore.capo - 1);

    wheelAccumulator = 0;
  };

  onMounted(() => {
    if (fretBoardRef.value) {
      useEventListener(fretBoardRef, 'pointerdown', handlePointerDown);
      useEventListener(fretBoardRef, 'wheel', handleWheel, { passive: false });
    }
  });

  onBeforeUnmount(() => {
    if (rAF_ID) cancelAnimationFrame(rAF_ID);
    cleanupListeners.forEach(cleanup => cleanup());
  });

  return {
    handleLocalToggleOpenString,
    handleOpenStringRightClick,
    handleFretRightClick,
    handleCanvasRightClick,
    handleFretMiddleClick,
  };
}
