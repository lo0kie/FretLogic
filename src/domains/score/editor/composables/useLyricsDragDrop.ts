/**
 * 歌词行和弦槽位拖拽的宿主：装配会话状态机与三套副作用（ghost 层、落点解析、边缘自动滚动），
 * 并把落地判定接上 store。
 *
 * 鼠标阈值起拖 + 触摸长按起拖，ghost / 落点更新按帧合帧，松手按落点落地。
 *
 * 分工（拆分后）：
 * - `lyrics-drag/dragSession` —— 指针会话状态机（活动指针、起拖时机、收尾），只回答「何时」；
 * - `lyrics-drag/cancelZone`  —— 取消投放区（矩形命中判据 + 悬停标记）；
 * - `lyrics-drag/dropGeometry` —— 落点判定的几何口径（宽容行判定 / 精确槽吸附）；
 * - `useDragHighlight`、`useDragGhostLayer`、`usePointerEdgeAutoScroll` —— 各自的既有实现。
 *
 * ⚠️ 排列区 canvas 化后，本模块**不再自己找 DOM**：
 * - 落点解析由宿主注入（`resolveDropTarget`，几何命中）——canvas 行里没有逐槽元素可供
 *   `elementFromPoint` + `closest('[data-slot-key]')` 命中；
 * - 源槽高亮与长按蓄势改走回调（`onDragSourceChange` / `onPressArmingChange`），
 *   由宿主作为绘制状态使用 —— 没有槽元素可加 `is-dragging-source` / `is-press-arming`。
 * 会话状态机、合帧、ghost、自动滚动四条链路原样保留：它们与「怎么命中」无关。
 */
import { onBeforeUnmount, ref } from 'vue';

import { useEventListener } from '@vueuse/core';

import { getChordName } from '@/domains/chord/theory/theory';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useDragGhostLayer } from '@/platform/composables/useDragGhostLayer';
import { usePointerEdgeAutoScroll } from '@/platform/composables/usePointerEdgeAutoScroll';
import { useRafThrottle } from '@/platform/composables/useRafThrottle';
import { GLOBAL_DRAGGING_CLASS } from '@/platform/composables/useSortableList';
import { hapticTap } from '@/platform/utils/haptics';

import { createCancelZone } from './lyrics-drag/cancelZone';
import { createDragSession } from './lyrics-drag/dragSession';
import { useDragHighlight } from './lyrics-drag/useDragHighlight';

import type { SlotKey } from '@/domains/score/types';
import type { ComponentPublicInstance, Ref } from 'vue';

/** 宿主（排列区）要提供的能力：命中解析与两处状态出口 */
export interface LyricsDragDropHost {
  /** 按指针位置解析落点（几何命中）：`slotKey` 为 null 表示「在行内但没对准槽位」 */
  resolveDropTarget: (clientX: number, clientY: number) => { slotKey: string | null; lineId: string | null };
  /** 长按蓄势（触摸端起拖前的按压反馈）：宿主据此重绘源槽 */
  onPressArmingChange: (slotKey: string, arming: boolean) => void;
  /** 拖拽源变化：宿主据此淡化源槽（null = 会话结束 / 复位） */
  onDragSourceChange: (slotKey: string | null) => void;
}

export function useLyricsDragDrop(host: LyricsDragDropHost, scrollContainerRef?: Ref<HTMLElement | null>) {
  const scoreEditor = useScoreEditorStore();

  /** ghost 上显示的和弦名：影像层只管元素与位移，内容归本域 */
  const ghostChordName = ref('');
  const { setGhostEl: setGhostElInternal, scheduleGhostPos, flushGhostPos, cancelGhostPos } = useDragGhostLayer();

  const { dragOverSlotKey, activeDropLineId, markDragSource, clearDragClasses, clearDropTarget, updateDropTarget } =
    useDragHighlight(host);

  const cancelZone = createCancelZone(clearDropTarget);

  /**
   * 落点更新合帧：解析落点要读已挂载行的矩形（一次强制布局），逐 move 同步执行就等于把布局读
   * 压在指针热路径上；合帧的只是「什么时候找落点」，不是「怎么找」。
   *
   * 取消区判据**必须留在合帧回调内部**（不能提到 schedule 侧）：松手路径直接 flush 这里排队的帧，
   * 判据若留在外面，flush 会用「进取消区之前」的旧坐标把落点写回槽位，松手反而落地。
   */
  const {
    schedule: scheduleDropFrame,
    flush: flushDropTargetUpdate,
    cancel: cancelDropTargetUpdate,
  } = useRafThrottle<{ x: number; y: number }>(pos => {
    if (!cancelZone.applyCancelZone(pos.x, pos.y)) updateDropTarget(pos.x, pos.y);
  });

  const { checkAutoScroll, stopAutoScroll } = usePointerEdgeAutoScroll();

  const session = createDragSession({
    /**
     * 起拖副作用。顺序刻意如此：先做不读几何的 DOM 标记与 ghost 内容、最后才挂 body 上的全局拖拽
     * 标记 —— 该标记命中 `& *`、会让整篇样式失效，而落点解析（下一帧）要读行矩形，顺序反过来
     * 就是一次强制重排。ghost 与落点都排到下一帧，故起拖那一下不阻塞输入。
     */
    onDragStart: (chord, sourceKey, x, y) => {
      if (sourceKey) markDragSource(sourceKey);
      ghostChordName.value = getChordName(chord);

      document.body.classList.add(GLOBAL_DRAGGING_CLASS);
      // 触觉反馈与「ghost 挂上」同拍（设备不支持时静默无操作，见 platform/utils/haptics）；
      // 与排序拖拽的起拖共用同一个时长，两处拖拽的手感一致
      hapticTap();

      scheduleGhostPos(x, y);
      void scheduleDropFrame({ x, y });
    },
    onDragMove: (x, y) => {
      scheduleGhostPos(x, y);
      void scheduleDropFrame({ x, y });

      // 指针悬在取消区上时不判边：取消区贴底边（落在边缘自动滚动的判定带宽内），照常判边会一边
      // 「想取消」一边把谱面滚下去。必须显式 stop —— checkAutoScroll 的每帧循环读的是「最近一次上报
      // 的位置」，只跳过调用等于让它拿着进区前的旧位置继续滚。
      // 判据取上一帧的 isOverCancelZone（由合帧回调写入）：在 pointermove 里现读矩形等于在指针热路径上
      // 强制布局，而落点解析本就已合帧；差这一帧最多多滚 14px（见 MAX_SCROLL_SPEED）。
      if (cancelZone.isOverCancelZone.value) stopAutoScroll();
      else
        // 每次 move 都喂最新指针位置：循环进行中会只更新位置不叠加 rAF（见 usePointerEdgeAutoScroll）
        checkAutoScroll(scrollContainerRef?.value, session.currentPointerPos(), () => {
          const { x: px, y: py } = session.currentPointerPos();
          void scheduleDropFrame({ x: px, y: py });
        });
    },
    onDrop: () => {
      stopAutoScroll();
      flushGhostPos();
      flushDropTargetUpdate();
      resolveLandingAction();
    },
    onCancel: () => {
      stopAutoScroll();
      cancelGhostPos();
      cancelDropTargetUpdate();
    },
    discardPendingFrames: () => cancelDropTargetUpdate(),
    onPressArming: (slotKey, arming) => host.onPressArmingChange(slotKey, arming),
    onReset: () => {
      cancelZone.resetCancelZone();
      clearDragClasses();
      document.body.classList.remove(GLOBAL_DRAGGING_CLASS);
    },
  });

  /** 模板 ref 挂载 ghost 元素，并定位到当前指针位置 */
  const setGhostEl = (el: Element | ComponentPublicInstance | null) =>
    void setGhostElInternal(el, session.currentPointerPos());

  /** 按当前落点执行落地（空槽=移动、占用槽=交换），无有效目标返回 false */
  const resolveLandingAction = (): boolean => {
    if (!session.isDragging.value || !dragOverSlotKey.value || !scoreEditor.activeSong) return false;

    const targetKey = dragOverSlotKey.value;
    const activeChord = session.activeChord();

    // 外部拖拽源（选器和弦浮动面板等，无源槽位）：落到任意字符槽即写入该槽位的和弦
    if (!session.draggingSlotKey.value) {
      if (!activeChord) return false;
      scoreEditor.setSlotChord(targetKey as SlotKey, activeChord);
      return true;
    }

    if (session.draggingSlotKey.value === targetKey || !activeChord) return false;

    // 槽位间拖拽统一走 swapOrMoveSlotChords，由它按落点分派：
    // - 落点已有和弦 → 交换（两处互换，**源槽位不落空**）；
    // - 落点为空 → 移动（源清空）；
    // - 同行同类边和弦（行首/行尾）→ 列表内插入式重排（避免「目标覆盖 + 源清空」把边和弦列表缩短）。
    scoreEditor.swapSlotChords(session.draggingSlotKey.value as SlotKey, targetKey as SlotKey);

    return true;
  };

  // 五条常驻 window 监听：挂载即挂、卸载即摘，成对关系交给 useEventListener 管
  // （原先 onMounted 挂五条、onBeforeUnmount 摘五条，两处必须逐字对齐才不漏摘）
  useEventListener(window, 'pointermove', session.handleGlobalPointerMove, { passive: false });
  useEventListener(window, 'pointerup', session.handleGlobalPointerUp);
  useEventListener(window, 'pointercancel', session.handleGlobalPointerCancel);
  useEventListener(window, 'blur', session.handleWindowBlur);
  useEventListener(window, 'touchmove', session.handleTouchMove, { passive: false });

  onBeforeUnmount(() => {
    session.dispose();
    stopAutoScroll();
    cancelGhostPos();
    cancelDropTargetUpdate();
    clearDragClasses();
    document.body.classList.remove(GLOBAL_DRAGGING_CLASS);
  });

  return {
    isDragging: session.isDragging,
    isSuppressingClick: session.isSuppressingClick,
    isOverCancelZone: cancelZone.isOverCancelZone,
    draggingSlotKey: session.draggingSlotKey,
    dragOverSlotKey,
    activeDropLineId,
    ghostChordName,
    setGhostEl,
    setCancelZoneEl: cancelZone.setCancelZoneEl,
    handlePointerDown: session.handlePointerDown,
    startExternalChordDrag: session.startExternalChordDrag,
    /**
     * 取消当前拖拽会话与长按等待（与原生 pointercancel 同一条收尾，不新增路径）。
     *
     * 供**外部手势接管**场景调用：双指捏合开始时，第一根手指可能已经压在某个和弦上并起了长按
     * 计时（LONG_PRESS_DELAY），不取消的话捏合途中会起拖、松手时把和弦丢到别处。取消同时会清掉
     * 那个计时器，而计时器只在新的 pointerdown 上重挂 —— 故整个捏合期间不会再被重新起拖。
     */
    cancelDrag: session.cancelActiveSession,
  };
}
