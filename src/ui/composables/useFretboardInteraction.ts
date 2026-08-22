import type { FretboardProps } from '@/ui/components/Fretboard.vue';
import { CANVAS_CONFIG, INTERACTION_CONFIG } from '@/constants';
import { useFretboardLayout } from '@/ui/composables/useFretboardLayout';
import type { GuitarStringsModel } from '@/types';
import { cloneGuitarStrings } from '@/utils/cloneDeep';
import { canTogglePitchAccidental, getActiveBaseStrings, isOpen } from '@/utils/musicTheory';
import { useEventListener } from '@vueuse/core';
import { computed, onBeforeUnmount, ref, useTemplateRef, watchEffect } from 'vue';

export function useFretboardInteraction(
  props: FretboardProps,
  onCapoChange: (capo: number) => void,
  onStringsChange: (strings: GuitarStringsModel) => void,
  onRootStringChange?: (index: number | null) => void,
  onDragStatusChange?: (isDragging: boolean) => void
) {
  const fretBoardRef = useTemplateRef<HTMLDivElement>('fretBoardRef');
  const hoverPoint = ref<{ stringIndex: number; fretIndex: number } | null>(null);
  const focusPoint = ref<{ stringIndex: number; fretIndex: number } | null>(null);
  const isFocused = ref(false);

  const interactive = computed(() => props.interactive ?? true);
  const scale = computed(() => props.scale ?? 1.0);
  const showOpenStrings = computed(() => props.showOpenStrings ?? true);
  const strings = computed(() => props.chord.strings);
  const fretCount = computed(() => props.chord.fretCount);
  const capo = computed(() => props.chord.capo);
  const tuning = computed(() => props.chord.tuning);
  const rootStringIndex = computed(() => props.chord.rootStringIndex);
  // 和弦名区始终显示，高度恒计入布局
  const showChordName = computed(() => props.showChordName ?? true);
  const chordNameZoneHeight = computed(() => (showChordName.value ? CANVAS_CONFIG.CHORD_NAME_ZONE_HEIGHT : 0));
  const isPointerDown = ref(false);
  const layout = useFretboardLayout(fretCount, scale, showOpenStrings, chordNameZoneHeight);

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
    const stringIndex = Math.round((x - CANVAS_CONFIG.OFFSET_X_LEFT) / CANVAS_CONFIG.STRING_SPACING);
    if (stringIndex < 0 || stringIndex > 5) return null;
    // SVG 实际从 和弦名区高度 + 空弦区高度 之后才开始，坐标换算需计入额外顶部高度
    const fretAreaY = y - layout.contentTopOffset.value;
    const fretIndex = fretAreaY > 0 ? Math.floor(fretAreaY / CANVAS_CONFIG.FRET_HEIGHT) + 1 : 0;
    return { stringIndex, fretIndex };
  };

  const emitStringsUpdate = (
    mutator: (cloned: GuitarStringsModel) => void,
    resolveRoot?: (currentRoot: number | null, cloned: GuitarStringsModel) => number | null
  ) => {
    if (!interactive.value) return;
    const cloned = cloneGuitarStrings(strings.value);
    mutator(cloned);
    onStringsChange(cloned);
    if (resolveRoot && onRootStringChange) {
      const nextRoot = resolveRoot(rootStringIndex.value, cloned);
      if (nextRoot !== rootStringIndex.value) onRootStringChange(nextRoot);
    }
  };

  /** 切换某弦是否为根音（单点标记：只保留该弦，或清空为 null） */
  const emitToggleRootString = (sIdx: number) => {
    if (!interactive.value || !onRootStringChange) return;
    const next = rootStringIndex.value === sIdx ? null : sIdx;
    if (next !== rootStringIndex.value) onRootStringChange(next);
  };

  const handleRightClickRoot = (e: MouseEvent) => {
    if (!interactive.value) return;
    const point = getCanvasPoint(e.clientX, e.clientY);
    if (!point) return;
    const { stringIndex: sIdx, fretIndex: fIdx } = point;
    const currentStringAsset = strings.value[sIdx];
    let isNoteClicked = false;
    if (fIdx > 0 && fIdx <= fretCount.value && currentStringAsset?.[0] === fIdx) {
      isNoteClicked = true;
    } else if (fIdx === 0 && currentStringAsset !== undefined && isOpen(currentStringAsset)) {
      isNoteClicked = true;
    }
    if (!isNoteClicked) return;
    e.preventDefault();
    e.stopPropagation();
    emitToggleRootString(sIdx);
  };

  const handleLocalToggleOpenString = (sIdx: number) => {
    if (interactive.value) {
      fretBoardRef.value?.focus();
      focusPoint.value = { stringIndex: sIdx, fretIndex: 0 };
    }
    emitStringsUpdate(
      cloned => {
        const str = cloned[sIdx];
        if (!str) return;
        if (str[0] > 0) {
          str[0] = 0;
        } else if (isOpen(str)) {
          str[0] = -1;
        } else {
          str[0] = 0;
        }
      },
      currentRoot => (currentRoot === sIdx ? null : currentRoot)
    );
  };

  const handleTogglePitchName = (sIdx: number) => {
    if (interactive.value) {
      fretBoardRef.value?.focus();
      const currentFret = strings.value[sIdx]?.[0];
      focusPoint.value = {
        stringIndex: sIdx,
        fretIndex: currentFret !== undefined && currentFret > 0 ? currentFret : 0,
      };
    }
    emitStringsUpdate(cloned => {
      const str = cloned[sIdx];
      if (str && canTogglePitchAccidental(sIdx, str[0], capo.value, getActiveBaseStrings(tuning.value))) {
        str[1] = !str[1];
      }
    });
  };

  const handleFingerClickLogic = (clientX: number, clientY: number, isMoveEvent = false) => {
    const point = getCanvasPoint(clientX, clientY);
    if (!point || point.fretIndex < 1 || point.fretIndex > fretCount.value) return;
    const { stringIndex: sIdx, fretIndex: fIdx } = point;
    if (isMoveEvent && lastSIdx === sIdx && lastFIdx === fIdx) return;
    emitStringsUpdate(
      cloned => {
        const str = cloned[sIdx];
        if (str && str[0] === fIdx) {
          str[0] = -1;
          lastSIdx = -1;
          lastFIdx = -1;
          lastCancelTime = Date.now();
        } else if (str) {
          if (isMoveEvent && Date.now() - lastCancelTime < INTERACTION_CONFIG.MUTING_COOL_DOWN) {
            lastSIdx = -1;
            lastFIdx = -1;
            return;
          }
          str[0] = fIdx;
          lastSIdx = sIdx;
          lastFIdx = fIdx;
        }
      },
      (currentRoot, cloned) =>
        currentRoot === sIdx && cloned[sIdx]![0] !== strings.value[sIdx]![0] ? null : currentRoot
    );
  };

  const handleKeydown = (e: KeyboardEvent) => {
    if (!interactive.value) return;

    const isNavKey = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key);
    const isActionKey = ['Enter', ' ', 'Delete', 'Backspace', 'r', 'R'].includes(e.key);

    if (!isNavKey && !isActionKey) return;

    e.preventDefault();

    if (!focusPoint.value) {
      focusPoint.value = {
        stringIndex: 0,
        fretIndex: showOpenStrings.value ? 0 : 1,
      };
    }

    if (isNavKey) {
      let { stringIndex, fretIndex } = focusPoint.value;
      const minFret = showOpenStrings.value ? 0 : 1;

      if (e.key === 'ArrowLeft') stringIndex = Math.max(0, stringIndex - 1);
      if (e.key === 'ArrowRight') stringIndex = Math.min(5, stringIndex + 1);
      if (e.key === 'ArrowUp') fretIndex = Math.max(minFret, fretIndex - 1);
      if (e.key === 'ArrowDown') fretIndex = Math.min(fretCount.value, fretIndex + 1);

      focusPoint.value = { stringIndex, fretIndex };
      return;
    }

    const { stringIndex, fretIndex } = focusPoint.value;

    if (fretIndex === 0) {
      if (e.key === 'Enter' || e.key === ' ') {
        handleLocalToggleOpenString(stringIndex);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        emitStringsUpdate(
          cloned => {
            cloned[stringIndex]![0] = -1;
          },
          currentRoot => (currentRoot === stringIndex ? null : currentRoot)
        );
      } else if (e.key === 'r' || e.key === 'R') {
        if (isOpen(strings.value[stringIndex]!)) {
          emitToggleRootString(stringIndex);
        }
      }
      return;
    }

    if (e.key === 'Enter' || e.key === ' ') {
      emitStringsUpdate(
        cloned => {
          const str = cloned[stringIndex];
          if (!str) return;
          str[0] = str[0] === fretIndex ? -1 : fretIndex;
        },
        (currentRoot, cloned) =>
          currentRoot === stringIndex && cloned[stringIndex]![0] !== strings.value[stringIndex]![0] ? null : currentRoot
      );
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      emitStringsUpdate(
        cloned => {
          if (cloned[stringIndex]![0] === fretIndex) {
            cloned[stringIndex]![0] = -1;
          }
        },
        (currentRoot, cloned) =>
          currentRoot === stringIndex && cloned[stringIndex]![0] !== strings.value[stringIndex]![0] ? null : currentRoot
      );
    } else if (e.key === 'r' || e.key === 'R') {
      if (strings.value[stringIndex]![0] === fretIndex) {
        emitToggleRootString(stringIndex);
      }
    }
  };

  const updateHoverFromEvent = (clientX: number, clientY: number) => {
    const pt = getCanvasPoint(clientX, clientY);
    const prev = hoverPoint.value;
    const changed = !pt || !prev || pt.stringIndex !== prev.stringIndex || pt.fretIndex !== prev.fretIndex;
    if (changed) hoverPoint.value = pt;
  };

  let hoverRafId = 0;
  let pendingEvent: { clientX: number; clientY: number } | null = null;

  const scheduleHoverUpdate = (clientX: number, clientY: number) => {
    pendingEvent = { clientX, clientY };
    if (hoverRafId) return;
    hoverRafId = requestAnimationFrame(() => {
      if (pendingEvent) updateHoverFromEvent(pendingEvent.clientX, pendingEvent.clientY);
      hoverRafId = 0;
    });
  };

  const handlePointerMove = (e: PointerEvent) => {
    scheduleHoverUpdate(e.clientX, e.clientY);
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
    fretBoardRef.value?.focus();
    const pt = getCanvasPoint(e.clientX, e.clientY);
    if (pt) {
      focusPoint.value = pt;
    }
    onDragStatusChange?.(true);
    lastSIdx = -1;
    lastFIdx = -1;
    handleFingerClickLogic(e.clientX, e.clientY, false);
    isPointerDown.value = true;
  };

  const handleFocus = () => {
    if (!interactive.value) return;
    isFocused.value = true;
    if (!focusPoint.value) {
      focusPoint.value = {
        stringIndex: 0,
        fretIndex: showOpenStrings.value ? 0 : 1,
      };
    }
  };

  const handleBlur = () => {
    isFocused.value = false;
    focusPoint.value = null;
  };

  watchEffect(onCleanup => {
    if (!isPointerDown.value) return;
    const stopMove = useEventListener(window, 'pointermove', handlePointerMove);
    const stopUp = useEventListener(window, 'pointerup', handlePointerUp);
    const stopCancel = useEventListener(window, 'pointercancel', handlePointerUp);
    onCleanup(() => {
      stopMove();
      stopUp();
      stopCancel();
    });
  });

  // wheel 与 pointermove 同样按帧合帧：触控板惯性下每秒几十次事件，
  // getCanvasPoint 内含 getBoundingClientRect 布局读取，无需每事件执行
  let wheelRafId = 0;
  let pendingWheel: {
    clientX: number;
    clientY: number;
    deltaY: number;
  } | null = null;

  const processWheel = () => {
    wheelRafId = 0;
    const pending = pendingWheel;
    pendingWheel = null;
    if (!pending || !interactive.value) return;

    const point = getCanvasPoint(pending.clientX, pending.clientY);
    if (point) {
      const { stringIndex: sIdx, fretIndex: fIdx } = point;
      const currentStr = strings.value[sIdx];
      // 悬停在已按音符上（含空弦 open 音符）：切换升降号，不触发 capo
      const isHoveringActiveNote =
        (fIdx > 0 && fIdx <= fretCount.value && currentStr?.[0] === fIdx) ||
        (fIdx === 0 && currentStr !== undefined && isOpen(currentStr));
      if (isHoveringActiveNote && currentStr !== undefined) {
        if (canTogglePitchAccidental(sIdx, currentStr[0], capo.value, getActiveBaseStrings(tuning.value))) {
          handleTogglePitchName(sIdx);
        }
        return;
      }
      // 空弦区域（SVG 起始线上方）非音符处：不响应滚轮
      if (fIdx === 0) return;
    }
    wheelAccumulator += pending.deltaY;
    if (Math.abs(wheelAccumulator) < INTERACTION_CONFIG.WHEEL_THRESHOLD) return;
    if (wheelAccumulator > 0) {
      onCapoChange(Math.min(INTERACTION_CONFIG.MAX_CAPO_LIMIT, capo.value + 1));
    } else {
      onCapoChange(Math.max(INTERACTION_CONFIG.MIN_CAPO_LIMIT, capo.value - 1));
    }
    wheelAccumulator = 0;
  };

  const handleWheel = (e: WheelEvent) => {
    if (!interactive.value) return;
    e.preventDefault();
    pendingWheel = { clientX: e.clientX, clientY: e.clientY, deltaY: e.deltaY };
    if (wheelRafId) return;
    wheelRafId = requestAnimationFrame(processWheel);
  };

  useEventListener(fretBoardRef, 'pointerdown', handlePointerDown);
  useEventListener(fretBoardRef, 'contextmenu', (e: Event) => {
    if (!interactive.value) return;
    e.preventDefault();
  });
  useEventListener(fretBoardRef, 'pointermove', (e: PointerEvent) => {
    if (interactive.value) scheduleHoverUpdate(e.clientX, e.clientY);
  });

  // 非编辑态：禁用一切 hover 高亮（如缩略图 / 谱面 / 选择器中不应有悬停反馈）
  watchEffect(() => {
    if (!interactive.value) hoverPoint.value = null;
  });

  useEventListener(fretBoardRef, 'pointerleave', handlePointerLeave);
  useEventListener(fretBoardRef, 'wheel', handleWheel, { passive: false });
  useEventListener(fretBoardRef, 'keydown', handleKeydown);
  useEventListener(fretBoardRef, 'focus', handleFocus);
  useEventListener(fretBoardRef, 'blur', handleBlur);

  onBeforeUnmount(() => {
    if (rAF_ID) cancelAnimationFrame(rAF_ID);
    if (hoverRafId) cancelAnimationFrame(hoverRafId);
    if (wheelRafId) cancelAnimationFrame(wheelRafId);
  });

  return {
    fretBoardRef,
    hoverPoint,
    focusPoint,
    isFocused,
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
