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
import { useFretboardWheel } from '@/domains/fretboard/composables/useFretboardWheel';
import { CANVAS_CONFIG } from '@/domains/fretboard/constants';
import { useRafThrottle } from '@/platform/composables/useRafThrottle';
import { cloneGuitarStrings } from '@/platform/utils/common';

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
    str.fret = fret;
    if (fret >= 0) {
      const pitch = calcPitchIndex(sIdx, fret, props.chord.fretOffset, getActiveBaseStrings(props.chord.tuning));
      str.preferFlat = getDefaultPreferFlatForPitch(pitch);
    } else {
      str.preferFlat = false;
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
      if (currentStringAsset?.fret === fIdx) {
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
      if (currentStringAsset.fret === 0) {
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
      if (str.fret > 0) {
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
      if (str.fret === fret) {
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

  // ===== 滑动绘制：按住左键滑过品位格连续添加/删除音符 =====
  // 按下处已有音符 → 本次滑动为「删除」模式（经过的音符被抹掉）；空白处 → 「添加」模式（经过的品位按上音符）。
  // 每根弦同时只持有一个音符：添加模式滑过同弦其他品位等效于移动音符。
  interface DragPaintSession {
    mode: 'add' | 'mute';
    /**
     * 会话内的工作副本：props 要等父组件重渲染才回流，pointermove 连续触发时
     * 直接克隆 props 会让前几格的改动被旧数据覆盖（音符丢失/闪烁），
     * 因此滑动期间的所有修改都累积在这份本地模型上再整体上报。
     */
    working: GuitarStringsModel;
    /** 上一次作用的品位格（stringIndex:fretIndex），跨格去重避免同格重复派发 */
    lastCell: string;
  }
  let dragPaint: DragPaintSession | null = null;

  /** 结束本次滑动绘制会话（连带丢弃未执行的合帧落笔，防悬挂帧在会话结束后改写数据） */
  const endDragPaint = () => {
    dragPaint = null;
    cancelPaintFrame();
  };

  /** 滑动经过某品位格：按会话模式在工作副本上添加或删除音符，并整体上报（相对初始按下的行为取向） */
  const paintCell = (sIdx: number, fIdx: number) => {
    if (!dragPaint) return;
    const cellKey = `${sIdx}:${fIdx}`;
    if (cellKey === dragPaint.lastCell) return;
    dragPaint.lastCell = cellKey;

    const { mode, working } = dragPaint;
    const str = working[sIdx];
    if (!str) return;
    if (mode === 'add') {
      // 添加：滑过同弦其他品位等效移动音符到当前品位（一弦一音）
      if (str.fret !== fIdx) setStringFret(str, fIdx, sIdx);
    } else if (str.fret === fIdx) {
      // 删除：仅抹掉滑动经过的音符格，空格保持原状
      setStringFret(str, -1, sIdx);
    }
    onStringsChange(working);
  };

  /**
   * 按事件坐标落笔：命中品位区（1..fretCount）时把**焦点与音符一并**落到该格。
   * 焦点与落笔同源是这里的要害：两者若各算各的，焦点环就会停在上一格/起点，与音符落点错位。
   */
  const paintFromEvent = (clientX: number, clientY: number) => {
    const pt = getCanvasPoint(clientX, clientY);
    if (!pt || pt.fretIndex < 1 || pt.fretIndex > props.chord.fretCount) return;
    syncFocusPointTo(pt.stringIndex, pt.fretIndex);
    paintCell(pt.stringIndex, pt.fretIndex);
  };

  /** 切换某弦的升降号偏好（如 C#/Db），仅在该位置允许变体时生效 */
  const handleTogglePitchName = (sIdx: number) => {
    fretBoardRef.value?.focus();
    const currentFret = props.chord.strings[sIdx]?.fret;
    focusPoint.value = {
      stringIndex: sIdx,
      fretIndex: currentFret !== undefined && currentFret > 0 ? currentFret : 0,
    };
    emitStringsUpdate(cloned => {
      const str = cloned[sIdx];
      if (
        str &&
        canTogglePitchAccidental(sIdx, str.fret, props.chord.fretOffset, getActiveBaseStrings(props.chord.tuning))
      ) {
        str.preferFlat = !str.preferFlat;
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

  // 滑动落笔同样合帧（pointerdown 首笔与 pointerup 补笔仍直发，保手感与收尾语义）：
  // paintFromEvent 每次 getBoundingClientRect，pointermove 事件频率远高于显示帧率时
  // 全是白算的坐标换算；合帧后每显示帧最多一次。跨格去重仍由 paintCell.lastCell 兜底
  const { schedule: schedulePaintFrame, cancel: cancelPaintFrame } = useRafThrottle<{
    clientX: number;
    clientY: number;
  }>(pos => paintFromEvent(pos.clientX, pos.clientY));

  /**
   * 把焦点落点同步到指定格（位置未变化时不触发响应式更新）。
   *
   * 焦点环（空品位预览环 / 音符自身焦点环）与悬停环是两套独立的落点语义：悬停环随指针逐格移动，
   * 焦点环只在按下、右击、键盘导航时改写。滑动绘制期间若只刷新悬停而不管焦点，焦点环就会滞留在
   * 按下那一格——拖动越远偏离越大，松手后依然留在起点，看起来正是「预览圆点不在最终落点」。
   */
  const syncFocusPointTo = (sIdx: number, fIdx: number) => {
    const prev = focusPoint.value;
    if (prev && prev.stringIndex === sIdx && prev.fretIndex === fIdx) return;
    focusPoint.value = { stringIndex: sIdx, fretIndex: fIdx };
  };

  /** 指针离开：丢弃待处理的 hover 帧并清空高亮 */
  const handlePointerLeave = () => {
    cancelHoverUpdate();
    hoverPoint.value = null;
  };

  /** 左键按下：焦点定位到命中点；空弦区切换空弦态，品位区切换音符并开启滑动绘制会话（已有则清除） */
  const handlePointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    fretBoardRef.value?.focus();
    const pt = getCanvasPoint(e.clientX, e.clientY);
    if (!pt) return;
    focusPoint.value = pt;

    // 空弦区域点击（品位 0）：切换空弦态，不进入滑动绘制
    if (pt.fretIndex === 0) {
      handleLocalToggleOpenString(pt.stringIndex);
      return;
    }

    if (pt.fretIndex < 1 || pt.fretIndex > props.chord.fretCount) return;

    // 滑动绘制会话：基于本地工作副本起步，按下即完成第一次切换音符（不再单发 toggleNoteAt，
    // 避免它和后续滑动各自克隆旧 props 互相覆盖）。按下处已有音符 → 删除模式；空白 → 添加模式。
    // 捕获指针让滑出指板边界后松开仍能收到 pointerup 正常收尾
    const working = cloneGuitarStrings(props.chord.strings);
    const initialStr = working[pt.stringIndex];
    const initialHasNote = initialStr?.fret === pt.fretIndex;
    if (initialStr) {
      if (initialHasNote) setStringFret(initialStr, -1, pt.stringIndex);
      else setStringFret(initialStr, pt.fretIndex, pt.stringIndex);
      onStringsChange(working);
    }
    dragPaint = { mode: initialHasNote ? 'mute' : 'add', working, lastCell: `${pt.stringIndex}:${pt.fretIndex}` };
    fretBoardRef.value?.setPointerCapture(e.pointerId);
  };

  /**
   * 松开左键：先把落笔补齐到「实际松手那一格」，再用松手坐标收尾预览。
   *
   * 两件事都必须在松手这一刻做，否则落点与预览会各停一处：
   * - pointermove 逐帧派发，快速拖动/事件合并时最后一格可能只体现在 pointerup 上，仅按 move 落笔会让
   *   音符与焦点停在最后一次移动处；
   * - 合帧队列里待处理的 hover 载荷是「上一次移动」的坐标，直接 flush 会把预览环挪回上一格。
   * 同格重复落笔由 paintCell 的 lastCell 去重兜住（单击流程不受影响）。
   */
  const handlePointerUp = (e: PointerEvent) => {
    if (dragPaint && e.button === 0) paintFromEvent(e.clientX, e.clientY);
    cancelHoverUpdate();
    updateHoverFromEvent(e.clientX, e.clientY);
    endDragPaint();
  };

  /** 获得键盘焦点：显示焦点框并一律重置到默认落点。
   *  不能沿用旧落点：失焦若未走 handleBlur（如焦点从未离开、仅靠 Tab 回归），
   *  焦点环会在用户上次点过的位置凭空复现。点击路径不受影响——pointerdown 里
   *  focus() 同步触发本函数后，紧接着就会把 focusPoint 写为真实点击落点 */
  const handleFocus = () => {
    isFocused.value = true;
    focusPoint.value = {
      stringIndex: 0,
      fretIndex: 0,
    };
  };

  /** 失焦：隐藏焦点框，并连同落点一起清空——否则下次聚焦会在旧位置凭空复现焦点环
   *  （handleFocus 只在 focusPoint 为空时给默认位置），清空后每次聚焦都从默认落点重新开始 */
  const handleBlur = () => {
    isFocused.value = false;
    focusPoint.value = null;
  };

  // 滚轮交互（合帧 / 升降号切换 / 品位偏移，机制见 useFretboardWheel）
  const { handleWheel } = useFretboardWheel({
    getCanvasPoint,
    getStrings: () => props.chord.strings,
    getFretCount: () => props.chord.fretCount,
    getFretOffset: () => props.chord.fretOffset,
    getTuning: () => props.chord.tuning,
    onTogglePitchName: handleTogglePitchName,
    onFretOffsetChange,
  });

  useEventListener(fretBoardRef, 'pointerdown', handlePointerDown);
  useEventListener(fretBoardRef, 'pointermove', (e: PointerEvent) => {
    const pos = { clientX: e.clientX, clientY: e.clientY };
    // 滑动绘制进行中：落笔合帧（首笔已在 pointerdown 直发、末笔由 pointerup 直发补齐），
    // 悬停高亮照常单独合帧刷新
    if (dragPaint) schedulePaintFrame(pos);
    scheduleHoverFrame(pos);
  });
  useEventListener(fretBoardRef, 'pointerup', handlePointerUp);
  useEventListener(fretBoardRef, 'pointercancel', endDragPaint);

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
