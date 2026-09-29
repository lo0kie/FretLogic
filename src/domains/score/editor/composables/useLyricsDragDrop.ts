/**
 * 歌词行和弦槽位拖拽的宿主：装配会话状态机与四套 DOM 副作用，并把落地判定接上 store。
 *
 * 鼠标阈值起拖 + 触摸长按起拖，ghost / 落点更新按帧合帧，松手按落点落地。
 *
 * 分工（拆分后）：
 * - `lyrics-drag/dragSession`   —— 指针会话状态机（活动指针、起拖时机、收尾），只回答「何时」；
 * - `lyrics-drag/cancelZone`    —— 取消投放区（矩形命中判据 + 悬停标记）；
 * - `lyrics-drag/dropTargetRouter` —— 两条落点路径（内部源精确命中 / 外部源几何就近）与合帧分派；
 * - `lyrics-drag/externalDropTarget`、`useDragHighlight`、`useDragGhostLayer`、`usePointerEdgeAutoScroll` —— 各自的既有实现。
 *
 * 本文件只保留三件必须收在一处的事：**装配**、**落地判定**（要同时读会话态、落点与 store）、
 * 以及**全局监听的挂摘**（成对关系交给 useEventListener 管）。
 */
import { onBeforeUnmount, ref } from 'vue';

import { useEventListener } from '@vueuse/core';

import { getChordName } from '@/domains/chord/theory/theory';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useDragGhostLayer } from '@/platform/composables/useDragGhostLayer';
import { usePointerEdgeAutoScroll } from '@/platform/composables/usePointerEdgeAutoScroll';
import { GLOBAL_DRAGGING_CLASS } from '@/platform/composables/useSortableList';
import { hapticTap } from '@/platform/utils/haptics';

import { createCancelZone } from './lyrics-drag/cancelZone';
import { createDragSession } from './lyrics-drag/dragSession';
import { createDropTargetRouter } from './lyrics-drag/dropTargetRouter';
import { useDragHighlight } from './lyrics-drag/useDragHighlight';

import type { SlotKey } from '@/domains/score/types';
import type { ComponentPublicInstance, Ref } from 'vue';

export function useLyricsDragDrop(scrollContainerRef?: Ref<HTMLElement | null>) {
  const scoreEditor = useScoreEditorStore();

  /** ghost 上显示的和弦名：影像层只管元素与位移，内容归本域 */
  const ghostChordName = ref('');
  const { setGhostEl: setGhostElInternal, scheduleGhostPos, flushGhostPos, cancelGhostPos } = useDragGhostLayer();

  const {
    dragOverSlotKey,
    activeDropLineId,
    markDragSource,
    clearDragClasses,
    clearDropTarget,
    updateDropTarget,
    setExternalDropTarget,
  } = useDragHighlight();

  const cancelZone = createCancelZone(clearDropTarget);

  // 会话在下方才建（它要回调本处这一批副作用），故落点分派按 getter 惰性读它的源槽位键
  const router = createDropTargetRouter({
    scrollContainerRef,
    getSourceSlotKey: () => session.draggingSlotKey.value,
    applyCancelZone: cancelZone.applyCancelZone,
    updateDropTarget,
    setExternalDropTarget,
  });

  const { checkAutoScroll, stopAutoScroll } = usePointerEdgeAutoScroll();

  const session = createDragSession({
    /**
     * 起拖副作用。顺序刻意如此：先做不读几何的 DOM 标记与 ghost 内容、再读一次行矩形快照，
     * 最后才挂 body 上的全局拖拽标记 —— 该标记命中 `& *`、会让整篇样式失效，而上面那次快照是
     * 「读必须拿到最新布局」的那一类，顺序反过来就是一次强制重排（外部源实测 ~36ms）。
     * ghost 与落点都排到下一帧，故起拖那一下不阻塞输入。
     */
    onDragStart: (chord, sourceKey, x, y) => {
      if (sourceKey) markDragSource(sourceKey, 'is-dragging-source');
      ghostChordName.value = getChordName(chord);
      // 外部拖拽源（选器和弦浮动面板）无源槽位：快照当前已渲染的歌词行，供几何就近计算使用
      if (!sourceKey) router.snapshotExternalLineEls();

      document.body.classList.add(GLOBAL_DRAGGING_CLASS);
      // 触觉反馈与「ghost 挂上」同拍（设备不支持时静默无操作，见 platform/utils/haptics）；
      // 与排序拖拽的起拖共用同一个时长，两处拖拽的手感一致
      hapticTap();

      // 起拖这一次落点检测同样走合帧，不在本任务里同步读几何（理由见上）：两条落点路径的第一句
      // 都是读几何（内部源 elementFromPoint、外部源 elementFromPoint + 行 / 槽矩形），
      // 而松手路径两条节流都有 flush 兜底（见 dragSession 的 handleGlobalPointerUp），
      // 「起拖即松手」不会漏掉这次落点。
      scheduleGhostPos(x, y);
      router.scheduleBySource(x, y);
    },
    onDragMove: (x, y) => {
      scheduleGhostPos(x, y);
      router.scheduleBySource(x, y);

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
          router.scheduleBySource(px, py);
        });
    },
    onDrop: () => {
      stopAutoScroll();
      flushGhostPos();
      router.flushAll();
      resolveLandingAction();
    },
    onCancel: () => {
      stopAutoScroll();
      cancelGhostPos();
      router.discardPendingFrames();
    },
    discardPendingFrames: () => router.discardPendingFrames(),
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
    // 此前只有第三种情况走本函数，前两种落到 moveSlotChord —— 那是「目标覆盖 + 源清空」，
    // 拖到占用槽会把源槽位清掉，与「交换」预期不符，故改为无条件走本函数。
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
    router.discardPendingFrames();
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
