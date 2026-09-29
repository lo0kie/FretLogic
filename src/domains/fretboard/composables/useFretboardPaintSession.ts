/**
 * 指板的滑动绘制会话：按住左键滑过品位格连续添加/删除音符。
 *
 * 按下处已有音符 → 本次滑动为「删除」模式（经过的音符被抹掉）；空白处 → 「添加」模式（经过的品位按上音符）。
 * 每根弦同时只持有一个音符：添加模式滑过同弦其他品位等效于移动音符。
 *
 * 从 `useFretboardInteraction` 里切出来，判据是它**自带一份会话内的工作副本**（见 `DragPaintSession.working`）——
 * 这份副本的存在理由与它的读写时机只属于本会话，混在宿主里时读者要跨几十行才能确认「为什么不能直接读 props」。
 *
 * 两条容易被改坏的不变量：
 * ① 焦点与落笔**同源**：落笔必须连带同步焦点环（见 `syncFocusPointTo` 的调用点）；
 * ② 指针捕获成功才开会话（捕获失败时会话永远收不了尾，见 `begin`）。
 */
import { useRafThrottle } from '@/platform/composables/useRafThrottle';
import { cloneGuitarStrings } from '@/platform/utils/common';

import type { FretboardCanvasPoint } from '@/domains/fretboard/composables/useFretboardLayout';
import type { GuitarStringEntity, GuitarStringsModel } from '@/domains/fretboard/types';

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

export interface FretboardPaintSessionOptions {
  /** 指针事件坐标 → 指板逻辑坐标；未命中有效区域时返回 null */
  getCanvasPoint: (clientX: number, clientY: number) => FretboardCanvasPoint | null;
  getFretCount: () => number;
  getStrings: () => GuitarStringsModel;
  setStringFret: (str: GuitarStringEntity, fret: number, sIdx: number) => void;
  onStringsChange: (strings: GuitarStringsModel) => void;
  /** 焦点落点与落笔同源：滑动期间每格都要同步焦点环，否则环会滞留在起点 */
  syncFocusPointTo: (sIdx: number, fIdx: number) => void;
  /** 指针捕获目标（指板根元素） */
  getCaptureTarget: () => HTMLElement | null;
}

export interface FretboardPaintSessionApi {
  /** 会话进行中？（pointermove 据此决定要不要排落笔帧） */
  isPainting: () => boolean;
  /** 左键在品格区按下：开启会话（含首次切换与指针捕获；捕获失败则不开） */
  begin: (e: PointerEvent, pt: FretboardCanvasPoint) => void;
  /** 按坐标落笔（pointermove 合帧与 pointerup 补笔共用同一条路径） */
  paintFromEvent: (clientX: number, clientY: number) => void;
  /** pointermove 的合帧入口 */
  scheduleFromMove: (pos: { clientX: number; clientY: number }) => void;
  /** 结束会话（连带丢弃未执行的合帧落笔，防悬挂帧在会话结束后改写数据，并释放指针捕获） */
  end: () => void;
}

export const useFretboardPaintSession = (options: FretboardPaintSessionOptions): FretboardPaintSessionApi => {
  let dragPaint: DragPaintSession | null = null;
  /** 本次会话取得的指针捕获（目标元素 + pointerId）；未取得时为 null，收尾据此主动释放 */
  let capturedPointer: { target: HTMLElement; pointerId: number } | null = null;

  /**
   * 主动释放会话取得的指针捕获。
   *
   * **不能指望隐式释放**：隐式释放挂在 pointerup / pointercancel 的派发上，而滑动绘制途中按下右键
   * 唤出的原生菜单会把这次手势的 pointerup 整个吞掉（正是上面 pointermove 自愈守卫记的那条缝），
   * 那一条就不会发生 —— 捕获留在指板上，此后页面内**任意位置**的按下/抬起都被重定向到它（点哪都
   * 点不动，反而在指板上落笔）。与 BaseSwitch 的 abortPress 同因同口径。未持有时调用是空操作。
   */
  const releaseCapture = () => {
    const held = capturedPointer;
    capturedPointer = null;
    if (!held) return;
    try {
      held.target.releasePointerCapture(held.pointerId);
    } catch {
      // 指针已失效 / 环境无 pointer capture 能力，忽略
    }
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
      if (str.fret !== fIdx) options.setStringFret(str, fIdx, sIdx);
    } else if (str.fret === fIdx)
      // 删除：仅抹掉滑动经过的音符格，空格保持原状
      options.setStringFret(str, -1, sIdx);

    options.onStringsChange(working);
  };

  /**
   * 按事件坐标落笔：命中品位区（1..fretCount）时把**焦点与音符一并**落到该格。
   * 焦点与落笔同源是这里的要害：两者若各算各的，焦点环就会停在上一格/起点，与音符落点错位。
   */
  const paintFromEvent = (clientX: number, clientY: number) => {
    const pt = options.getCanvasPoint(clientX, clientY);
    if (!pt || pt.fretIndex < 1 || pt.fretIndex > options.getFretCount()) return;
    options.syncFocusPointTo(pt.stringIndex, pt.fretIndex);
    paintCell(pt.stringIndex, pt.fretIndex);
  };

  // 滑动落笔同样合帧（pointerdown 首笔与 pointerup 补笔仍直发，保手感与收尾语义）：
  // paintFromEvent 每次 getBoundingClientRect，pointermove 事件频率远高于显示帧率时
  // 全是白算的坐标换算；合帧后每显示帧最多一次。跨格去重仍由 paintCell 的 lastCell 兜底
  const { schedule: schedulePaintFrame, cancel: cancelPaintFrame } = useRafThrottle<{
    clientX: number;
    clientY: number;
  }>(pos => paintFromEvent(pos.clientX, pos.clientY));

  const end = () => {
    dragPaint = null;
    cancelPaintFrame();
    releaseCapture();
  };

  const begin = (e: PointerEvent, pt: FretboardCanvasPoint) => {
    // 基于本地工作副本起步，按下即完成第一次切换音符（不再单发 toggleNoteAt，
    // 避免它和后续滑动各自克隆旧 props 互相覆盖）。按下处已有音符 → 删除模式；空白 → 添加模式。
    const working = cloneGuitarStrings(options.getStrings());
    const initialStr = working[pt.stringIndex];
    const initialHasNote = initialStr?.fret === pt.fretIndex;
    if (initialStr) {
      if (initialHasNote) options.setStringFret(initialStr, -1, pt.stringIndex);
      else options.setStringFret(initialStr, pt.fretIndex, pt.stringIndex);
      options.onStringsChange(working);
    }

    // 先捕获指针，成功了才开会话：捕获失败（pointerId 已失效、元素不在文档中）时后续 pointerup
    // 不会再落到本元素上，会话开着就永远收不了尾 —— 之后**无按键**移动鼠标也会被 pointermove
    // 当成滑动绘制落笔，逐格改写音符。上面那一次切换已经生效，捕获失败就到此为止，只当一次普通点击。
    const board = options.getCaptureTarget();
    if (!board) return;
    try {
      board.setPointerCapture(e.pointerId);
    } catch {
      return;
    }
    capturedPointer = { target: board, pointerId: e.pointerId };
    dragPaint = { mode: initialHasNote ? 'mute' : 'add', working, lastCell: `${pt.stringIndex}:${pt.fretIndex}` };
  };

  return {
    isPainting: () => dragPaint !== null,
    begin,
    paintFromEvent,
    scheduleFromMove: pos => void schedulePaintFrame(pos),
    end,
  };
};
