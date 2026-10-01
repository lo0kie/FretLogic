/**
 * 指板交互核心：坐标换算、点按/右键/滚轮/键盘编辑音符与品位偏移，以及 hover/focus 高亮管理。
 *
 * 分工（拆分后）：
 * - `useFretboardEdits`      —— 对 strings / rootStringIndex 的**唯一**写入出口；
 * - `useFretboardHoverFocus` —— 两套落点语义（悬停环 / 焦点环）与各自的合帧刷新；
 * - `useFretboardPaintSession` —— 滑动绘制会话（自带工作副本）；
 * - `useFretboardScrollGuard` —— 触摸起手分区，决定要不要拦下外层滚动；
 * - `useFretboardKeyboard` / `useFretboardWheel` / `useFretboardLayout` —— 既有实现。
 *
 * 本文件只保留**跨了多块的手势**（它们要同时读写落点、编辑出口与会话）与坐标换算、监听接线。
 */
import { useTemplateRef } from 'vue';

import { useEventListener } from '@vueuse/core';

import { useFretboardEdits } from '@/domains/fretboard/composables/useFretboardEdits';
import { useFretboardHoverFocus } from '@/domains/fretboard/composables/useFretboardHoverFocus';
import { useFretboardKeyboard } from '@/domains/fretboard/composables/useFretboardKeyboard';
import { calculateFretboardPoint, useFretboardLayout } from '@/domains/fretboard/composables/useFretboardLayout';
import { useFretboardPaintSession } from '@/domains/fretboard/composables/useFretboardPaintSession';
import { useFretboardScrollGuard } from '@/domains/fretboard/composables/useFretboardScrollGuard';
import { useFretboardWheel } from '@/domains/fretboard/composables/useFretboardWheel';
import { INTERACTIVE_GEOMETRY } from '@/domains/fretboard/model/interactiveGeometry';

import type { FretboardProps } from '@/domains/fretboard/components/Fretboard.vue';
import type { GuitarStringsModel } from '@/domains/fretboard/types';

export function useFretboardInteraction(
  props: FretboardProps,
  onFretOffsetChange: (fretOffset: number) => void,
  onStringsChange: (strings: GuitarStringsModel) => void,
  onRootStringChange?: (index: number | null) => void
) {
  const fretBoardRef = useTemplateRef<HTMLDivElement>('fretBoardRef');

  // 名字区高度不必传：由几何给出（见 useFretboardLayout 的 contentTopOffset / rawHeight）
  // 品位偏移要传：它决定本图画不画加粗弦枕，进而决定指板顶与板身高度（见 interactiveGeometryFor）
  // 可用宽度要传：窄屏下整张图按宿主给的宽度贴合缩小（见 useFretboardLayout 的 fitWidth）
  const layout = useFretboardLayout(() => props.chord.fretCount, {
    stringCount: () => props.chord.strings.length,
    fretOffset: () => props.chord.fretOffset ?? 0,
    fitWidth: () => props.maxWidth,
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
      chordNameZoneHeight: INTERACTIVE_GEOMETRY.chordNameBlockH,
      fretCount: props.chord.fretCount,
      stringCount: props.chord.strings.length,
    });
  };

  const edits = useFretboardEdits(props, onStringsChange, onRootStringChange);
  const hoverFocus = useFretboardHoverFocus({ getCanvasPoint });
  const paint = useFretboardPaintSession({
    getCanvasPoint,
    getFretCount: () => props.chord.fretCount,
    getStrings: () => props.chord.strings,
    setStringFret: edits.setStringFret,
    onStringsChange,
    syncFocusPointTo: hoverFocus.syncFocusPointTo,
    getCaptureTarget: () => fretBoardRef.value,
  });
  const scrollGuard = useFretboardScrollGuard({ getCanvasPoint });

  /**
   * 把键盘焦点落到指板上，且**不带动滚动**。
   *
   * `focus()` 默认会让浏览器把目标滚进视口：指板在窄屏是整幅卡片（高度常超出一屏），点它时
   * 外层容器（工作台画布 / 乐谱编辑区）的滚动位置就会被拉过去 —— 用户看到的正是「点一下指板，
   * 滚动位置自己跳了」。焦点本身仍要给：方向键编辑与焦点环都依赖它，缺的只是那次滚动。
   */
  const focusBoard = () => fretBoardRef.value?.focus({ preventScroll: true });

  /** 右键：命中已有音符则切换主音，空品位/空弦则设为可用音符并标记为主音 */
  const handleRightClickRoot = (e: MouseEvent) => {
    // 交互态下统一抑制浏览器原生右键菜单（覆盖未命中区域，原由独立的 contextmenu 监听负责）
    e.preventDefault();
    const point = getCanvasPoint(e.clientX, e.clientY);
    if (!point) return;
    const { stringIndex: sIdx, fretIndex: fIdx } = point;
    const currentStringAsset = props.chord.strings[sIdx];

    focusBoard();
    hoverFocus.focusPoint.value = { stringIndex: sIdx, fretIndex: fIdx };

    // 指板上的品位
    if (fIdx > 0 && fIdx <= props.chord.fretCount) {
      if (currentStringAsset?.fret === fIdx) {
        // 已有该品位音符：切换主音（原有逻辑）
        e.stopPropagation();
        edits.emitToggleRootString(sIdx);
      } else {
        // 空品位：设为该品位(可用)并主音
        e.stopPropagation();
        edits.setAvailableAndRoot(sIdx, fIdx);
      }
      return;
    }

    // 空弦区
    if (fIdx === 0 && currentStringAsset !== undefined) {
      e.stopPropagation();
      if (currentStringAsset.fret === 0) edits.emitToggleRootString(sIdx);
      else edits.setAvailableAndRoot(sIdx, 0);
    }
  };

  /**
   * 循环切换某弦状态：按品位 → 空弦 → 静音；同时让该弦获得焦点。
   *
   * 只服务键盘（Enter / Space）—— 指针路径改走滑动绘制会话（见 `handlePointerDown`），
   * 那条路上空弦格与品格格同属一个手势，不再有独立的「空弦三态」入口。
   */
  const handleLocalToggleOpenString = (sIdx: number) => {
    focusBoard();
    hoverFocus.focusPoint.value = { stringIndex: sIdx, fretIndex: 0 };
    edits.toggleOpenString(sIdx);
  };

  /** 切换某弦的升降号偏好（如 C#/Db），仅在该位置允许变体时生效；同时让该弦获得焦点 */
  const handleTogglePitchName = (sIdx: number) => {
    focusBoard();
    const currentFret = props.chord.strings[sIdx]?.fret;
    hoverFocus.focusPoint.value = {
      stringIndex: sIdx,
      fretIndex: currentFret !== undefined && currentFret > 0 ? currentFret : 0,
    };
    edits.togglePitchAccidental(sIdx);
  };

  // 键盘可达性：方向键移动焦点、Enter/Space 切换音符、Delete/Backspace 静音，细节见 useFretboardKeyboard
  const { handleKeydown } = useFretboardKeyboard({
    focusPoint: hoverFocus.focusPoint,
    fretCount: () => props.chord.fretCount,
    stringCount: () => props.chord.strings.length,
    onToggleOpenString: handleLocalToggleOpenString,
    onToggleNote: edits.toggleNoteAt,
    onMuteString: edits.muteString,
  });

  /**
   * 左键按下：焦点定位到命中点，并开启滑动绘制会话。
   *
   * 空弦区与品格区走**同一条路径**（空弦格就是品位 0，见 useFretboardPaintSession）—— 此前空弦区
   * 在这里早退成一次 `toggleOpenString`，于是只有它是「按下即定、拖动无响应」的一块死区。
   * 首次切换的结果与那次 toggle 逐次相同，故单击手感不变，多出来的只是拖动。
   */
  const handlePointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    focusBoard();
    const pt = getCanvasPoint(e.clientX, e.clientY);
    if (!pt) return;
    hoverFocus.focusPoint.value = pt;

    if (pt.fretIndex < 0 || pt.fretIndex > props.chord.fretCount) return;

    paint.begin(e, pt);
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
    if (paint.isPainting() && e.button === 0) paint.paintFromEvent(e.clientX, e.clientY);
    hoverFocus.cancelPendingHover();
    hoverFocus.syncHoverFromEvent(e.clientX, e.clientY);
    paint.end();
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

  // 捕获阶段先于下方的 bubble 处理器跑，且名字区那处 `stop` 拦不住它（见 useFretboardScrollGuard）
  useEventListener(fretBoardRef, 'pointerdown', scrollGuard.handlePointerDownCapture, { capture: true });
  useEventListener(fretBoardRef, 'pointerdown', handlePointerDown);
  useEventListener(fretBoardRef, 'pointermove', (e: PointerEvent) => {
    const pos = { clientX: e.clientX, clientY: e.clientY };
    // 自愈：pointerup 未必收得到（滑动绘制途中按下右键唤起原生上下文菜单，菜单持有指针后左键的抬起
    // 不再派发给页面；指针在窗口外抬起同理）。指针捕获挡不住这一种 —— 捕获只保证事件落到本元素，
    // 不保证事件一定会发生。会话不复位的话，此后**无按键**的移动会被当成滑动绘制逐格改写音符
    //（正是 paint.begin 注释里记的那条坏法，只是成因不止捕获失败一种）。判据与 useSliderInteraction /
    // BaseSwitch / vScrollbar 的同名守卫同口径。
    if (e.buttons === 0 && paint.isPainting()) paint.end();
    // 滑动绘制进行中：落笔合帧（首笔已在 pointerdown 直发、末笔由 pointerup 直发补齐），
    // 悬停高亮照常单独合帧刷新
    if (paint.isPainting()) paint.scheduleFromMove(pos);
    hoverFocus.scheduleHoverFromMove(pos);
  });
  useEventListener(fretBoardRef, 'pointerup', handlePointerUp);
  useEventListener(fretBoardRef, 'pointercancel', paint.end);

  useEventListener(fretBoardRef, 'pointerleave', hoverFocus.clearHover);
  // 必须显式 passive: false —— 浏览器对非 window/document 上的监听默认虽是非被动，
  // 但这里要的是**可 preventDefault** 的确定性（见 useFretboardScrollGuard）
  useEventListener(fretBoardRef, 'touchmove', scrollGuard.handleTouchMoveGuard, { passive: false });
  useEventListener(fretBoardRef, 'wheel', handleWheel, { passive: false });
  useEventListener(fretBoardRef, 'keydown', handleKeydown);
  useEventListener(fretBoardRef, 'focus', hoverFocus.handleFocus);
  useEventListener(fretBoardRef, 'blur', hoverFocus.handleBlur);

  return {
    fretBoardRef,
    hoverPoint: hoverFocus.hoverPoint,
    focusPoint: hoverFocus.focusPoint,
    isFocused: hoverFocus.isFocused,
    boardWidth: layout.boardWidth,
    stringXPositions: layout.stringXPositions,
    rawHeight: layout.rawHeight,
    fretboardScale: layout.fretboardScale,
    realScaledWidth: layout.realScaledWidth,
    realScaledHeight: layout.realScaledHeight,
    handleRightClickRoot,
    handleTogglePitchName,
  };
}
