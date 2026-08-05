import { useEventListener } from '@vueuse/core';
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  toRaw,
  toRefs,
  useTemplateRef,
  watchEffect
} from 'vue';

import { CANVAS_CONFIG, FRETBOARD_SCALE_MAP, INTERACTION_CONFIG } from '@/constants';
import type { GuitarStringsModel } from '@/types';
import { cloneDeep } from '@/utils/dataParser';
import { canTogglePitchAccidental, isOpen } from '@/utils/musicTheory';

export interface FretboardInteractionProps {
  strings: GuitarStringsModel;
  fretCount: number;
  capo: number;
  activeBaseStrings: readonly number[];
  interactive: boolean;
  scale: number;
  showOpenStrings?: boolean;
}

export interface FretboardInteractionEmit {
  (e: 'update:strings', value: GuitarStringsModel): void;
  (e: 'update:capo', value: number): void;
  (e: 'drag-status-change', isDragging: boolean): void;
}

export function useFretboardInteraction(props: FretboardInteractionProps, emit: FretboardInteractionEmit) {
  const fretBoardRef = useTemplateRef<HTMLDivElement>('fretBoardRef');
  const hoverPoint = ref<{ stringIndex: number; fretIndex: number } | null>(null);

  const { strings, fretCount, capo, activeBaseStrings, interactive, scale, showOpenStrings } = toRefs(props);

  const isPointerDown = ref(false);

  let lastCancelTime = 0;
  let lastSIdx = -1;
  let lastFIdx = -1;
  let wheelAccumulator = 0;
  let ticking = false;
  let rAF_ID = 0;

  const stringXPositions = computed(() =>
    Array.from({ length: 6 }, (_, i) => CANVAS_CONFIG.OFFSET_X + i * CANVAS_CONFIG.STRING_SPACING)
  );

  // 🌟 动态计算顶部偏移量：如果隐藏空弦，则只保留较小的安全内边距
  const activeTopOffset = computed(() => (showOpenStrings?.value !== false ? CANVAS_CONFIG.OFFSET_Y_TOP : 16));

  const rawHeight = computed(
    () => activeTopOffset.value + fretCount.value * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.OFFSET_Y_BOTTOM
  );
  const fretboardScale = computed(() => (FRETBOARD_SCALE_MAP[fretCount.value] || 1.0) * scale.value);
  const realScaledWidth = computed(() => CANVAS_CONFIG.BOARD_WIDTH * fretboardScale.value);
  const realScaledHeight = computed(() => rawHeight.value * fretboardScale.value);

  const getCanvasPoint = (clientX: number, clientY: number) => {
    const board = fretBoardRef.value?.getBoundingClientRect();
    if (!board || board.width === 0 || board.height === 0) return null;
    const scaleX = board.width / CANVAS_CONFIG.BOARD_WIDTH;
    const scaleY = board.height / rawHeight.value;
    const x = (clientX - board.left) / scaleX;
    const y = (clientY - board.top) / scaleY;
    const stringIndex = Math.round((x - CANVAS_CONFIG.OFFSET_X) / CANVAS_CONFIG.STRING_SPACING);

    // 🌟 基于动态偏移量计算当前所处品位
    const fretAreaY = y - activeTopOffset.value;
    const fretIndex = fretAreaY > 0 ? Math.floor(fretAreaY / CANVAS_CONFIG.FRET_HEIGHT) + 1 : 0;
    return { stringIndex, fretIndex };
  };

  const emitStringsUpdate = (mutator: (cloned: GuitarStringsModel) => void) => {
    if (!interactive.value) return;
    const cloned = cloneDeep(toRaw(strings.value));
    mutator(cloned);
    emit('update:strings', cloned);
  };

  const handleRightClickRoot = (e: MouseEvent) => {
    if (!interactive.value) return;

    const point = getCanvasPoint(e.clientX, e.clientY);
    if (!point) return;

    const { stringIndex: sIdx, fretIndex: fIdx } = point;
    if (sIdx < 0 || sIdx > 5) return;

    const currentStringAsset = strings.value[sIdx];
    let isNoteClicked = false;

    if (fIdx > 0 && fIdx <= fretCount.value && currentStringAsset.fret === fIdx) {
      isNoteClicked = true;
    } else if (fIdx === 0 && isOpen(currentStringAsset)) {
      isNoteClicked = true;
    }

    if (!isNoteClicked) return;

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
      if (canTogglePitchAccidental(sIdx, str.fret, capo.value, activeBaseStrings.value)) {
        str.preferFlat = !str.preferFlat;
      }
    });
  };

  const handleFingerClickLogic = (clientX: number, clientY: number, isMoveEvent = false) => {
    const point = getCanvasPoint(clientX, clientY);
    if (
      !point ||
      point.stringIndex < 0 ||
      point.stringIndex > 5 ||
      point.fretIndex < 1 ||
      point.fretIndex > fretCount.value
    )
      return;

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
    emit('drag-status-change', false);
    lastSIdx = -1;
    lastFIdx = -1;
    if (rAF_ID) cancelAnimationFrame(rAF_ID);
    ticking = false;
  };

  const handlePointerDown = (e: PointerEvent) => {
    if (!interactive.value || e.button !== 0) return;

    emit('drag-status-change', true);
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

    if (point && point.stringIndex >= 0 && point.stringIndex <= 5) {
      const { stringIndex: sIdx, fretIndex: fIdx } = point;
      const currentStr = strings.value[sIdx];

      const isHoveringActiveNote =
        (fIdx > 0 && fIdx <= fretCount.value && currentStr.fret === fIdx) || (fIdx === 0 && isOpen(currentStr));

      if (isHoveringActiveNote) {
        if (canTogglePitchAccidental(sIdx, currentStr.fret, capo.value, activeBaseStrings.value)) {
          handleTogglePitchName(sIdx);
        }
        return;
      }
    }

    wheelAccumulator += e.deltaY;
    if (Math.abs(wheelAccumulator) < INTERACTION_CONFIG.WHEEL_THRESHOLD) return;
    if (wheelAccumulator > 0) {
      emit('update:capo', Math.min(INTERACTION_CONFIG.MAX_CAPO_LIMIT, capo.value + 1));
    } else {
      emit('update:capo', Math.max(INTERACTION_CONFIG.MIN_CAPO_LIMIT, capo.value - 1));
    }
    wheelAccumulator = 0;
  };

  onMounted(() => {
    useEventListener(fretBoardRef, 'pointerdown', handlePointerDown);
    useEventListener(fretBoardRef, 'pointermove', (e: PointerEvent) => {
      const pt = getCanvasPoint(e.clientX, e.clientY);
      if (pt) hoverPoint.value = pt;
    });
    useEventListener(fretBoardRef, 'pointerleave', handlePointerLeave);
    useEventListener(fretBoardRef, 'wheel', handleWheel, { passive: false });
  });

  onBeforeUnmount(() => {
    if (rAF_ID) cancelAnimationFrame(rAF_ID);
  });

  return {
    fretBoardRef,
    hoverPoint,
    stringXPositions,
    rawHeight,
    fretboardScale,
    realScaledWidth,
    realScaledHeight,
    activeTopOffset,
    handleRightClickRoot,
    handleLocalToggleOpenString,
    handleTogglePitchName,
  };
}
