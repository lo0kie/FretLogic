import type { FretboardProps } from '@/components/fretboard/Fretboard.vue';
import { useFretboardLayout } from '@/composables/fretboard/useFretboardLayout';
import type { GuitarStringEntity, GuitarStringsModel } from '@/types';
import { cloneGuitarStrings } from '@/utils/core/common';
import { CANVAS_CONFIG, INTERACTION_CONFIG } from '@/utils/core/constants';
import { canTogglePitchAccidental, getActiveBaseStrings, isOpen } from '@/utils/music/musicTheory';
import { useEventListener } from '@vueuse/core';
import { computed, onBeforeUnmount, ref, useTemplateRef, watchEffect } from 'vue';

export function useFretboardInteraction(
  props: FretboardProps,
  onCapoChange: (capo: number) => void,
  onStringsChange: (strings: GuitarStringsModel) => void,
  onRootStringChange?: (index: number | null) => void
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
  const layout = useFretboardLayout(fretCount, scale, showOpenStrings, chordNameZoneHeight);

  let wheelAccumulator = 0;

  const getCanvasPoint = (clientX: number, clientY: number) => {
    const board = fretBoardRef.value?.getBoundingClientRect();
    if (!board || board.width === 0 || board.height === 0) return null;
    const scaleX = board.width / CANVAS_CONFIG.BOARD_WIDTH;
    const scaleY = board.height / layout.rawHeight.value;
    const x = (clientX - board.left) / scaleX;
    const y = (clientY - board.top) / scaleY;
    const rawStringFloat = (x - CANVAS_CONFIG.OFFSET_X_LEFT) / CANVAS_CONFIG.STRING_SPACING;
    const stringIndex = Math.round(rawStringFloat);
    if (stringIndex < 0 || stringIndex > 5) return null;
    // 处于和弦名区域时不触发音符/空弦悬停
    if (y < chordNameZoneHeight.value) return null;
    // SVG 实际从 和弦名区高度 + 空弦区高度 之后才开始，坐标换算需计入额外顶部高度
    const fretAreaY = y - layout.contentTopOffset.value;
    const fretIndex = fretAreaY > 0 ? Math.floor(fretAreaY / CANVAS_CONFIG.FRET_HEIGHT) + 1 : 0;
    if (fretIndex > fretCount.value) return null;
    return { stringIndex, fretIndex, rawStringFloat };
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

  /** 设置某弦品位，并清除该弦的附加状态（如 preferFlat）。
   *  升降号偏好只针对具体某个音，清除/移动音符时应一并复位。 */
  const setStringFret = (str: GuitarStringEntity, fret: number) => {
    str[0] = fret;
    str[1] = false;
  };

  /** 右击空白处/禁用空弦：直接设为可用(对应品位或空弦)并设为主音 */
  const setAvailableAndRoot = (sIdx: number, fret: number) => {
    if (!interactive.value) return;
    emitStringsUpdate(
      cloned => {
        const str = cloned[sIdx];
        if (str) setStringFret(str, fret);
      },
      () => sIdx
    );
  };

  const handleRightClickRoot = (e: MouseEvent) => {
    if (!interactive.value) return;
    // 交互态下统一抑制浏览器原生右键菜单（覆盖未命中区域，原由独立的 contextmenu 监听负责）
    e.preventDefault();
    const point = getCanvasPoint(e.clientX, e.clientY);
    if (!point) return;
    const { stringIndex: sIdx, fretIndex: fIdx } = point;
    const currentStringAsset = strings.value[sIdx];

    fretBoardRef.value?.focus();
    focusPoint.value = { stringIndex: sIdx, fretIndex: fIdx };

    // 指板上的品位
    if (fIdx > 0 && fIdx <= fretCount.value) {
      if (currentStringAsset?.[0] === fIdx) {
        // 已有该品位音符：切换主音（原有逻辑）
        e.stopPropagation();
        emitToggleRootString(sIdx);
      } else {
        // 空品位：设为该品位(可用)并主音
        e.stopPropagation();
        setAvailableAndRoot(sIdx, fIdx);
      }
      return;
    }

    // 空弦区
    if (fIdx === 0 && currentStringAsset !== undefined) {
      e.stopPropagation();
      if (currentStringAsset[0] === 0) {
        emitToggleRootString(sIdx);
      } else {
        setAvailableAndRoot(sIdx, 0);
      }
      return;
    }
  };

  const handleLocalToggleOpenString = (sIdx: number) => {
    if (interactive.value) {
      fretBoardRef.value?.focus();
      focusPoint.value = { stringIndex: sIdx, fretIndex: 0 };
    }
    emitStringsUpdate(cloned => {
      const str = cloned[sIdx];
      if (!str) return;
      if (str[0] > 0) {
        setStringFret(str, 0);
      } else if (isOpen(str)) {
        setStringFret(str, -1);
      } else {
        setStringFret(str, 0);
      }
    });
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

  const handleKeydown = (e: KeyboardEvent) => {
    if (!interactive.value) return;

    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }

    const minFret = showOpenStrings.value ? 0 : 1;
    const maxFret = fretCount.value;

    if (!focusPoint.value) {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
        e.preventDefault();
        focusPoint.value = {
          stringIndex: 0,
          fretIndex: showOpenStrings.value ? 0 : 1,
        };
        return;
      }
    }

    const current = focusPoint.value || {
      stringIndex: 0,
      fretIndex: showOpenStrings.value ? 0 : 1,
    };

    const handleEnterOrSpace = () => {
      const pt = focusPoint.value;
      if (!pt) return;
      if (pt.fretIndex === 0) {
        handleLocalToggleOpenString(pt.stringIndex);
      } else {
        emitStringsUpdate(cloned => {
          const str = cloned[pt.stringIndex];
          if (!str) return;
          if (str[0] === pt.fretIndex) {
            setStringFret(str, -1);
          } else {
            setStringFret(str, pt.fretIndex);
          }
        });
      }
    };

    const handleDeleteOrBackspace = () => {
      const pt = focusPoint.value;
      if (!pt) return;
      emitStringsUpdate(cloned => {
        const str = cloned[pt.stringIndex];
        if (str) setStringFret(str, -1);
      });
    };

    const keyActions: Record<string, () => void> = {
      'ArrowUp': () => {
        focusPoint.value = {
          stringIndex: current.stringIndex,
          fretIndex: Math.max(minFret, current.fretIndex - 1),
        };
      },
      'ArrowDown': () => {
        focusPoint.value = {
          stringIndex: current.stringIndex,
          fretIndex: Math.min(maxFret, current.fretIndex + 1),
        };
      },
      'ArrowLeft': () => {
        focusPoint.value = {
          stringIndex: Math.max(0, current.stringIndex - 1),
          fretIndex: current.fretIndex,
        };
      },
      'ArrowRight': () => {
        focusPoint.value = {
          stringIndex: Math.min(5, current.stringIndex + 1),
          fretIndex: current.fretIndex,
        };
      },
      'Home': () => {
        focusPoint.value = {
          stringIndex: 0,
          fretIndex: current.fretIndex,
        };
      },
      'End': () => {
        focusPoint.value = {
          stringIndex: 5,
          fretIndex: current.fretIndex,
        };
      },
      'PageUp': () => {
        focusPoint.value = {
          stringIndex: current.stringIndex,
          fretIndex: minFret,
        };
      },
      'PageDown': () => {
        focusPoint.value = {
          stringIndex: current.stringIndex,
          fretIndex: maxFret,
        };
      },
      'Enter': handleEnterOrSpace,
      ' ': handleEnterOrSpace,
      'Delete': handleDeleteOrBackspace,
      'Backspace': handleDeleteOrBackspace,
    };

    const action = keyActions[e.key];
    if (action) {
      e.preventDefault();
      action();
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
      if (pendingEvent) {
        updateHoverFromEvent(pendingEvent.clientX, pendingEvent.clientY);
        pendingEvent = null;
      }
      hoverRafId = 0;
    });
  };

  const handlePointerLeave = () => {
    pendingEvent = null;
    if (hoverRafId) {
      cancelAnimationFrame(hoverRafId);
      hoverRafId = 0;
    }
    hoverPoint.value = null;
  };

  const handlePointerDown = (e: PointerEvent) => {
    if (!interactive.value || e.button !== 0) return;
    fretBoardRef.value?.focus();
    const pt = getCanvasPoint(e.clientX, e.clientY);
    if (!pt) return;
    focusPoint.value = pt;

    // 空弦区域点击（品位 0）
    if (pt.fretIndex === 0) {
      handleLocalToggleOpenString(pt.stringIndex);
      return;
    }

    if (pt.fretIndex < 1 || pt.fretIndex > fretCount.value) return;

    // 单击品位：切换音符（已有则清除 -1，无则设置为该品位）
    emitStringsUpdate(cloned => {
      const str = cloned[pt.stringIndex];
      if (!str) return;
      if (str[0] === pt.fretIndex) {
        setStringFret(str, -1);
      } else {
        setStringFret(str, pt.fretIndex);
      }
    });
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

  // wheel 按帧合帧
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
    if (!interactive.value || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    pendingWheel = { clientX: e.clientX, clientY: e.clientY, deltaY: e.deltaY };
    if (wheelRafId) return;
    wheelRafId = requestAnimationFrame(processWheel);
  };

  useEventListener(fretBoardRef, 'pointerdown', handlePointerDown);
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
