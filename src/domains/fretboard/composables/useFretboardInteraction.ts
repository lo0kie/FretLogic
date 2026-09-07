import { ref, useTemplateRef } from 'vue';

import { useEventListener } from '@vueuse/core';

import {
  calcPitchIndex,
  canTogglePitchAccidental,
  getActiveBaseStrings,
  getDefaultPreferFlatForPitch,
  isOpen,
} from '@/domains/chord/theory/theory';
import { useFretboardKeyboard } from '@/domains/fretboard/composables/useFretboardKeyboard';
import { calculateFretboardPoint, useFretboardLayout } from '@/domains/fretboard/composables/useFretboardLayout';
import { cloneGuitarStrings } from '@/platform/utils/common';
import { useRafThrottle } from '@/platform/utils/useRafThrottle';

import { CANVAS_CONFIG, INTERACTION_CONFIG } from '../constants';

import type { FretboardProps } from '@/domains/fretboard/components/Fretboard.vue';
import type { GuitarStringEntity, GuitarStringsModel } from '@/domains/fretboard/types';

/** 指板交互核心：坐标换算、点按/右键/滚轮/键盘编辑音符与品位偏移，以及 hover/focus 高亮管理 */
export function useFretboardInteraction(
  props: FretboardProps,
  onFretOffsetChange: (fretOffset: number) => void,
  onStringsChange: (strings: GuitarStringsModel) => void,
  onRootStringChange?: (index: number | null) => void
) {
  const fretBoardRef = useTemplateRef<HTMLDivElement>('fretBoardRef');
  const hoverPoint = ref<{ stringIndex: number; fretIndex: number } | null>(null);
  const focusPoint = ref<{ stringIndex: number; fretIndex: number } | null>(null);
  const isFocused = ref(false);

  const layout = useFretboardLayout(() => props.chord.fretCount, {
    extraTopHeight: CANVAS_CONFIG.CHORD_NAME_ZONE_HEIGHT,
    stringCount: () => props.chord.strings.length,
  });

  let wheelAccumulator = 0;

  /** 把指针事件坐标换算为指板逻辑坐标（弦序号/品位），未命中有效区域时返回 null */
  const getCanvasPoint = (clientX: number, clientY: number) => {
    const board = fretBoardRef.value?.getBoundingClientRect();
    if (!board) return null;
    return calculateFretboardPoint({
      clientX,
      clientY,
      boardRect: board,
      rawHeight: layout.rawHeight.value,
      contentTopOffset: layout.contentTopOffset.value,
      chordNameZoneHeight: CANVAS_CONFIG.CHORD_NAME_ZONE_HEIGHT,
      fretCount: props.chord.fretCount,
      stringCount: props.chord.strings.length,
    });
  };

  /** 统一的弦数据更新出口：克隆当前模型交给 mutator 修改后上报，并可选地由 resolveRoot 重算根音弦 */
  const emitStringsUpdate = (
    mutator: (cloned: GuitarStringsModel) => void,
    resolveRoot?: (currentRoot: number | null, cloned: GuitarStringsModel) => number | null
  ) => {
    const cloned = cloneGuitarStrings(props.chord.strings);
    mutator(cloned);
    onStringsChange(cloned);
    if (resolveRoot && onRootStringChange) {
      const nextRoot = resolveRoot(props.chord.rootStringIndex, cloned);
      if (nextRoot !== props.chord.rootStringIndex) onRootStringChange(nextRoot);
    }
  };

  /** 切换某弦是否为根音（单点标记：只保留该弦，或清空为 null） */
  const emitToggleRootString = (sIdx: number) => {
    if (!onRootStringChange) return;
    const next = props.chord.rootStringIndex === sIdx ? null : sIdx;
    if (next !== props.chord.rootStringIndex) onRootStringChange(next);
  };

  /** 设置某弦品位，并按乐理默认赋予初始升降号状态（如 10 为 Bb, 3 为 Eb）。
   *  清除/移动音符时一并复位为新品位的乐理默认。 */
  const setStringFret = (str: GuitarStringEntity, fret: number, sIdx: number) => {
    str[0] = fret;
    if (fret >= 0) {
      const pitch = calcPitchIndex(sIdx, fret, props.chord.fretOffset, getActiveBaseStrings(props.chord.tuning));
      str[1] = getDefaultPreferFlatForPitch(pitch);
    } else {
      str[1] = false;
    }
  };

  /** 右击空白处/禁用空弦：直接设为可用(对应品位或空弦)并设为主音 */
  const setAvailableAndRoot = (sIdx: number, fret: number) => {
    emitStringsUpdate(
      cloned => {
        const str = cloned[sIdx];
        if (str) setStringFret(str, fret, sIdx);
      },
      () => sIdx
    );
  };

  /** 右键：命中已有音符则切换主音，空品位/空弦则设为可用音符并标记为主音 */
  const handleRightClickRoot = (e: MouseEvent) => {
    // 交互态下统一抑制浏览器原生右键菜单（覆盖未命中区域，原由独立的 contextmenu 监听负责）
    e.preventDefault();
    const point = getCanvasPoint(e.clientX, e.clientY);
    if (!point) return;
    const { stringIndex: sIdx, fretIndex: fIdx } = point;
    const currentStringAsset = props.chord.strings[sIdx];

    fretBoardRef.value?.focus();
    focusPoint.value = { stringIndex: sIdx, fretIndex: fIdx };

    // 指板上的品位
    if (fIdx > 0 && fIdx <= props.chord.fretCount) {
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

  /** 循环切换某弦状态：按品位 → 空弦 → 静音；同时让该弦获得焦点 */
  const handleLocalToggleOpenString = (sIdx: number) => {
    fretBoardRef.value?.focus();
    focusPoint.value = { stringIndex: sIdx, fretIndex: 0 };
    emitStringsUpdate(cloned => {
      const str = cloned[sIdx];
      if (!str) return;
      if (str[0] > 0) {
        setStringFret(str, 0, sIdx);
      } else if (isOpen(str)) {
        setStringFret(str, -1, sIdx);
      } else {
        setStringFret(str, 0, sIdx);
      }
    });
  };

  /** 切换某弦某品位的音符：该品位已有音符则清除为静音，否则按下到该品位（指针点击与键盘 Enter 共用） */
  const toggleNoteAt = (sIdx: number, fret: number) => {
    emitStringsUpdate(cloned => {
      const str = cloned[sIdx];
      if (!str) return;
      if (str[0] === fret) {
        setStringFret(str, -1, sIdx);
      } else {
        setStringFret(str, fret, sIdx);
      }
    });
  };

  /** 清除某弦音符（置为静音），键盘 Delete/Backspace 使用 */
  const muteString = (sIdx: number) => {
    emitStringsUpdate(cloned => {
      const str = cloned[sIdx];
      if (str) setStringFret(str, -1, sIdx);
    });
  };

  /** 切换某弦的升降号偏好（如 C#/Db），仅在该位置允许变体时生效 */
  const handleTogglePitchName = (sIdx: number) => {
    fretBoardRef.value?.focus();
    const currentFret = props.chord.strings[sIdx]?.[0];
    focusPoint.value = {
      stringIndex: sIdx,
      fretIndex: currentFret !== undefined && currentFret > 0 ? currentFret : 0,
    };
    emitStringsUpdate(cloned => {
      const str = cloned[sIdx];
      if (
        str &&
        canTogglePitchAccidental(sIdx, str[0], props.chord.fretOffset, getActiveBaseStrings(props.chord.tuning))
      ) {
        str[1] = !str[1];
      }
    });
  };

  // 键盘可达性：方向键移动焦点、Enter/Space 切换音符、Delete/Backspace 静音，细节见 useFretboardKeyboard
  const { handleKeydown } = useFretboardKeyboard({
    focusPoint,
    fretCount: () => props.chord.fretCount,
    stringCount: () => props.chord.strings.length,
    onToggleOpenString: handleLocalToggleOpenString,
    onToggleNote: toggleNoteAt,
    onMuteString: muteString,
  });

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

  /** 指针离开：丢弃待处理的 hover 帧并清空高亮 */
  const handlePointerLeave = () => {
    cancelHoverUpdate();
    hoverPoint.value = null;
  };

  /** 左键按下：焦点定位到命中点；空弦区切换空弦态，品位区切换音符（已有则清除） */
  const handlePointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    fretBoardRef.value?.focus();
    const pt = getCanvasPoint(e.clientX, e.clientY);
    if (!pt) return;
    focusPoint.value = pt;

    // 空弦区域点击（品位 0）
    if (pt.fretIndex === 0) {
      handleLocalToggleOpenString(pt.stringIndex);
      return;
    }

    if (pt.fretIndex < 1 || pt.fretIndex > props.chord.fretCount) return;

    // 单击品位：切换音符（已有则清除，无则按下到该品位）
    toggleNoteAt(pt.stringIndex, pt.fretIndex);
  };

  /** 获得键盘焦点：显示焦点框，首次聚焦时给一个默认焦点位置 */
  const handleFocus = () => {
    isFocused.value = true;
    if (!focusPoint.value) {
      focusPoint.value = {
        stringIndex: 0,
        fretIndex: 0,
      };
    }
  };

  /** 失焦：隐藏焦点框 */
  const handleBlur = () => {
    isFocused.value = false;
  };

  // 滚轮合帧：触摸板快速连续滚动时只在 rAF 执行最后累加值，并在命中音符时切换升降号，未命中时调整品位偏移
  const { schedule: scheduleWheelFrame } = useRafThrottle<{
    clientX: number;
    clientY: number;
    deltaY: number;
  }>(pending => {
    const point = getCanvasPoint(pending.clientX, pending.clientY);
    if (point) {
      const { stringIndex: sIdx, fretIndex: fIdx } = point;
      const currentStr = props.chord.strings[sIdx];
      // 悬停在已按音符上（含空弦 open 音符）：切换升降号，不触发品位偏移
      const isHoveringActiveNote =
        (fIdx > 0 && fIdx <= props.chord.fretCount && currentStr?.[0] === fIdx) ||
        (fIdx === 0 && currentStr !== undefined && isOpen(currentStr));
      if (isHoveringActiveNote && currentStr !== undefined) {
        if (
          canTogglePitchAccidental(
            sIdx,
            currentStr[0],
            props.chord.fretOffset,
            getActiveBaseStrings(props.chord.tuning)
          )
        ) {
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
      onFretOffsetChange(Math.min(INTERACTION_CONFIG.MAX_CAPO_LIMIT, props.chord.fretOffset + 1));
    } else {
      onFretOffsetChange(Math.max(INTERACTION_CONFIG.MIN_CAPO_LIMIT, props.chord.fretOffset - 1));
    }
    wheelAccumulator = 0;
  });

  /** wheel 入口：只记录事件并按帧合帧处理，忽略 Ctrl/Cmd 缩放手势 */
  const handleWheel = (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) return;
    // 仅命中指板有效区域（品位格/空弦行）时才接管滚轮；和弦名区与容器其余部分放行默认滚动，不触发品位偏移
    if (!getCanvasPoint(e.clientX, e.clientY)) return;
    e.preventDefault();
    scheduleWheelFrame({ clientX: e.clientX, clientY: e.clientY, deltaY: e.deltaY });
  };

  useEventListener(fretBoardRef, 'pointerdown', handlePointerDown);
  useEventListener(fretBoardRef, 'pointermove', (e: PointerEvent) => {
    scheduleHoverFrame({ clientX: e.clientX, clientY: e.clientY });
  });

  useEventListener(fretBoardRef, 'pointerleave', handlePointerLeave);
  useEventListener(fretBoardRef, 'wheel', handleWheel, { passive: false });
  useEventListener(fretBoardRef, 'keydown', handleKeydown);
  useEventListener(fretBoardRef, 'focus', handleFocus);
  useEventListener(fretBoardRef, 'blur', handleBlur);

  return {
    fretBoardRef,
    hoverPoint,
    focusPoint,
    isFocused,
    boardWidth: layout.boardWidth,
    stringXPositions: layout.stringXPositions,
    rawHeight: layout.rawHeight,
    fretboardScale: layout.fretboardScale,
    realScaledWidth: layout.realScaledWidth,
    realScaledHeight: layout.realScaledHeight,
    activeTopOffset: layout.activeTopOffset,
    handleRightClickRoot,
    handleTogglePitchName,
  };
}
