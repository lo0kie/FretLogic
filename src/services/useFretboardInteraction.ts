import type { FretboardProps } from '@/components/Fretboard.vue';
import { CANVAS_CONFIG, INTERACTION_CONFIG } from '@/constants';
import { useFretboardLayout } from '@/services/useFretboardLayout';
import type { GuitarStringsModel } from '@/types';
import { cloneDeep } from '@/utils/cloneDeep';
import { canTogglePitchAccidental, getActiveBaseStrings, isOpen } from '@/utils/musicTheory';
import { useEventListener } from '@vueuse/core';
import { computed, onBeforeUnmount, ref, toRaw, useTemplateRef, watchEffect } from 'vue';

export function useFretboardInteraction(
  props: FretboardProps,
  onCapoChange: (capo: number) => void,
  onStringsChange: (strings: GuitarStringsModel) => void,
  onDragStatusChange?: (isDragging: boolean) => void
) {
  const fretBoardRef = useTemplateRef<HTMLDivElement>('fretBoardRef');
  const hoverPoint = ref<{ stringIndex: number; fretIndex: number } | null>(null);

  const interactive = computed(() => props.interactive ?? true);
  const scale = computed(() => props.scale ?? 1.0);
  const showOpenStrings = computed(() => props.showOpenStrings ?? true);

  const strings = computed(() => props.chord.strings);
  const fretCount = computed(() => props.chord.fretCount);
  const capo = computed(() => props.chord.capo);
  const tuning = computed(() => props.chord.tuning);

  const layout = useFretboardLayout(fretCount, scale, showOpenStrings);

  const isPointerDown = ref(false);

  let lastCancelTime = 0;
  let lastSIdx = -1;
  let lastFIdx = -1;
  let wheelAccumulator = 0;
  let ticking = false;
  let rAF_ID = 0;

  const getCanvasPoint = (clientX: number, clientY: number) => {
    const board = fretBoardRef.value?.getBoundingClientRect();
    if (!board || board.width === 0 || board.height === 0) return null;
    const scaleX = board.width / CANVAS_CONFIG.BOARD_WIDTH;
    const scaleY = board.height / layout.rawHeight.value;
    const x = (clientX - board.left) / scaleX;
    const y = (clientY - board.top) / scaleY;
    const stringIndex = Math.round((x - CANVAS_CONFIG.OFFSET_X) / CANVAS_CONFIG.STRING_SPACING);

    if (stringIndex < 0 || stringIndex > 5) return null;

    const fretAreaY = y - layout.activeTopOffset.value;
    const fretIndex = fretAreaY > 0 ? Math.floor(fretAreaY / CANVAS_CONFIG.FRET_HEIGHT) + 1 : 0;
    return { stringIndex, fretIndex };
  };

  const emitStringsUpdate = (mutator: (cloned: GuitarStringsModel) => void) => {
    if (!interactive.value) return;

    const cloned = cloneDeep(toRaw(strings.value));
    mutator(cloned);

    onStringsChange(cloned);
  };

  const handleRightClickRoot = (e: MouseEvent) => {
    // 🌟 非交互模式下直接返回，允许 contextmenu 事件向上冒泡至 GlobalContextMenu
    if (!interactive.value) return;

    const point = getCanvasPoint(e.clientX, e.clientY);
    if (!point) return;

    const { stringIndex: sIdx, fretIndex: fIdx } = point;
    const currentStringAsset = strings.value[sIdx];
    let isNoteClicked = false;

    if (fIdx > 0 && fIdx <= fretCount.value && currentStringAsset.fret === fIdx) {
      isNoteClicked = true;
    } else if (fIdx === 0 && isOpen(currentStringAsset)) {
      isNoteClicked = true;
    }

    if (!isNoteClicked) return;

    // 🌟 仅在真正触发根音切换时拦截右键默认菜单和阻止冒泡
    e.preventDefault();
    e.stopPropagation();

    emitStringsUpdate(cloned => {
      const wasRoot = cloned[sIdx].isRoot;
      cloned.forEach(s => {
        s.isRoot = false;
      });
      cloned[sIdx].isRoot = !wasRoot;
    });
  };

  const handleLocalToggleOpenString = (sIdx: number) => {
    emitStringsUpdate(cloned => {
      const str = cloned[sIdx];
      if (str.fret > 0) {
        str.fret = 0;
        str.isRoot = false;
      } else if (isOpen(str)) {
        str.fret = -1;
        str.isRoot = false;
      } else {
        str.fret = 0;
        str.isRoot = false;
      }
    });
  };

  const handleTogglePitchName = (sIdx: number) => {
    emitStringsUpdate(cloned => {
      const str = cloned[sIdx];
      if (canTogglePitchAccidental(sIdx, str.fret, capo.value, getActiveBaseStrings(tuning.value))) {
        str.preferFlat = !str.preferFlat;
      }
    });
  };

  const handleFingerClickLogic = (clientX: number, clientY: number, isMoveEvent = false) => {
    const point = getCanvasPoint(clientX, clientY);
    if (!point || point.fretIndex < 1 || point.fretIndex > fretCount.value) return;

    const { stringIndex: sIdx, fretIndex: fIdx } = point;
    if (isMoveEvent && lastSIdx === sIdx && lastFIdx === fIdx) return;

    emitStringsUpdate(cloned => {
      const str = cloned[sIdx];
      if (str.fret === fIdx) {
        str.fret = -1;
        str.isRoot = false;
        lastSIdx = -1;
        lastFIdx = -1;
        lastCancelTime = Date.now();
      } else {
        if (isMoveEvent && Date.now() - lastCancelTime < INTERACTION_CONFIG.MUTING_COOL_DOWN) {
          lastSIdx = -1;
          lastFIdx = -1;
          return;
        }
        str.fret = fIdx;
        str.isRoot = false;
        lastSIdx = sIdx;
        lastFIdx = fIdx;
      }
    });
  };

  const handlePointerMove = (e: PointerEvent) => {
    const pt = getCanvasPoint(e.clientX, e.clientY);
    if (pt) hoverPoint.value = pt;

    if (ticking) return;
    ticking = true;
    rAF_ID = requestAnimationFrame(() => {
      handleFingerClickLogic(e.clientX, e.clientY, true);
      ticking = false;
    });
  };

  const handlePointerLeave = () => {
    hoverPoint.value = null;
  };

  const handlePointerUp = () => {
    isPointerDown.value = false;
    onDragStatusChange?.(false);
    lastSIdx = -1;
    lastFIdx = -1;
    if (rAF_ID) cancelAnimationFrame(rAF_ID);
    ticking = false;
  };

  const handlePointerDown = (e: PointerEvent) => {
    if (!interactive.value || e.button !== 0) return;

    onDragStatusChange?.(true);
    lastSIdx = -1;
    lastFIdx = -1;

    handleFingerClickLogic(e.clientX, e.clientY, false);
    isPointerDown.value = true;
  };

  watchEffect(onCleanup => {
    if (!isPointerDown.value) return;

    const stopMove = useEventListener(window, 'pointermove', handlePointerMove);
    const stopUp = useEventListener(window, 'pointerup', handlePointerUp);

    onCleanup(() => {
      stopMove();
      stopUp();
    });
  });

  const handleWheel = (e: WheelEvent) => {
    if (!interactive.value) return;
    e.preventDefault();

    const point = getCanvasPoint(e.clientX, e.clientY);

    if (point) {
      const { stringIndex: sIdx, fretIndex: fIdx } = point;
      const currentStr = strings.value[sIdx];

      const isHoveringActiveNote =
        (fIdx > 0 && fIdx <= fretCount.value && currentStr.fret === fIdx) || (fIdx === 0 && isOpen(currentStr));

      if (isHoveringActiveNote) {
        if (canTogglePitchAccidental(sIdx, currentStr.fret, capo.value, getActiveBaseStrings(tuning.value))) {
          handleTogglePitchName(sIdx);
        }
        return;
      }
    }

    wheelAccumulator += e.deltaY;
    if (Math.abs(wheelAccumulator) < INTERACTION_CONFIG.WHEEL_THRESHOLD) return;

    if (wheelAccumulator > 0) {
      onCapoChange(Math.min(INTERACTION_CONFIG.MAX_CAPO_LIMIT, capo.value + 1));
    } else {
      onCapoChange(Math.max(INTERACTION_CONFIG.MIN_CAPO_LIMIT, capo.value - 1));
    }

    wheelAccumulator = 0;
  };

  useEventListener(fretBoardRef, 'pointerdown', handlePointerDown);
  useEventListener(fretBoardRef, 'pointermove', (e: PointerEvent) => {
    hoverPoint.value = getCanvasPoint(e.clientX, e.clientY);
  });
  useEventListener(fretBoardRef, 'pointerleave', handlePointerLeave);
  useEventListener(fretBoardRef, 'wheel', handleWheel, { passive: false });

  onBeforeUnmount(() => {
    if (rAF_ID) cancelAnimationFrame(rAF_ID);
  });

  return {
    fretBoardRef,
    hoverPoint,
    stringXPositions: layout.stringXPositions,
    rawHeight: layout.rawHeight,
    fretboardScale: layout.fretboardScale,
    realScaledWidth: layout.realScaledWidth,
    realScaledHeight: layout.realScaledHeight,
    activeTopOffset: layout.activeTopOffset,
    handleRightClickRoot,
    handleLocalToggleOpenString,
    handleTogglePitchName,
  };
}
