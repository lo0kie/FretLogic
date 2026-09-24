import { onBeforeUnmount, onMounted, ref } from 'vue';

import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useRafThrottle } from '@/platform/composables/useRafThrottle';
import { logger } from '@/platform/utils/logger';

import { createExternalDropResolver } from './lyrics-drag/externalDropTarget';
import { useDragAutoScroll } from './lyrics-drag/useDragAutoScroll';
import { useDragGhost } from './lyrics-drag/useDragGhost';
import { useDragHighlight } from './lyrics-drag/useDragHighlight';

import type { Chord } from '@/domains/chord/types';
import type { SlotKey } from '@/domains/score/types';
import type { ComponentPublicInstance, Ref } from 'vue';

/** 歌词行和弦槽位拖拽核心：鼠标阈值起拖 + 触摸长按起拖，ghost/落点更新按帧合帧，松手按落点落地 */
export function useLyricsDragDrop(scrollContainerRef?: Ref<HTMLElement | null>) {
  const scoreEditor = useScoreEditorStore();

  const isDragging = ref(false);
  const isSuppressingClick = ref(false);
  const draggingSlotKey = ref<string | null>(null);
  const {
    ghostChordName,
    setGhostEl: setGhostElInternal,
    scheduleGhostPos,
    flushGhostPos,
    cancelGhostPos,
    setGhostChord,
  } = useDragGhost();

  const {
    dragOverSlotKey,
    activeDropLineId,
    markDragSource,
    clearDragClasses,
    updateDropTarget,
    setExternalDropTarget,
  } = useDragHighlight();

  // 落点命中节流：与 ghost 位置一样合并进 rAF，避免每帧同步执行 elementFromPoint 命中测试
  const {
    schedule: scheduleDropFrame,
    flush: flushDropTargetUpdate,
    cancel: cancelDropTargetUpdate,
  } = useRafThrottle<{ x: number; y: number }>(pos => updateDropTarget(pos.x, pos.y));

  /** 落点命中检测按帧合帧，避免 pointermove 高频执行 elementFromPoint */
  const scheduleDropTargetUpdate = (x: number, y: number) => void scheduleDropFrame({ x, y });

  const { checkAutoScroll, stopAutoScroll } = useDragAutoScroll();

  // 外部拖拽源（无源槽位）的几何落点解析（见 lyrics-drag/externalDropTarget）
  const externalDropResolver = createExternalDropResolver(scrollContainerRef);
  const snapshotExternalLineEls = () => externalDropResolver.snapshotLineEls();
  const resolveExternalDropTarget = (x: number, y: number) => externalDropResolver.resolve(x, y, setExternalDropTarget);

  let wasDraggingInSession = false;
  let startPointer = { x: 0, y: 0, pointerId: -1, pointerType: '' };
  let currentPointerPos = { x: 0, y: 0 };
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let activeSourceKey: string | null = null;
  let activeChord: Chord | null = null;

  const DRAG_THRESHOLD = 5;
  const LONG_PRESS_DELAY = 280;

  /** 模板 ref 挂载 ghost 元素，并定位到当前指针位置 */
  const setGhostEl = (el: Element | ComponentPublicInstance | null) => void setGhostElInternal(el, currentPointerPos);

  /** 短暂抑制拖拽结束后的 click，避免松手误触发槽位点击 */
  const triggerClickSuppression = () => {
    isSuppressingClick.value = true;
    setTimeout(() => {
      isSuppressingClick.value = false;
    }, 120);
  };

  /** 拖拽会话期间屏蔽右键菜单；拖拽中右键视为取消本次拖拽 */
  const preventContextMenu = (e: MouseEvent) => {
    // 拖拽中右键：退出本次拖拽（先取消，再按拖拽会话屏蔽菜单）
    if (isDragging.value) cancelActiveSession();

    if (isDragging.value || wasDraggingInSession) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  };

  /** 触摸长按等待期的按压反馈：在源槽位上加 is-press-arming 类（渐进提示即将进入拖拽） */
  const setPressArming = (arming: boolean) => {
    if (!activeSourceKey) return;
    document
      .querySelectorAll(`[data-slot-key="${CSS.escape(activeSourceKey)}"]`)
      .forEach(el => el.classList.toggle('is-press-arming', arming));
  };

  /** 拖拽/长按结束的统一收尾：重置状态与 DOM 副作用（pointerup / pointercancel / blur 共用） */
  const resetDragState = () => {
    setPressArming(false);
    isDragging.value = false;
    draggingSlotKey.value = null;
    activeSourceKey = null;
    activeChord = null;
    startPointer = { x: 0, y: 0, pointerId: -1, pointerType: '' };
    clearDragClasses();
    document.body.classList.remove('is-global-dragging');
    window.removeEventListener('contextmenu', preventContextMenu, true);
  };

  /** 清除长按计时器（触摸端起拖前的取消/重置多处复用） */
  const clearLongPressTimer = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  /** 判定事件是否属于当前拖拽会话的活动指针（多指/鼠标混用时忽略非活动指针） */
  const isEventForActivePointer = (e: PointerEvent): boolean => {
    if (activeChord === null && !isDragging.value) return false;
    // 活动指针判定与「是否已进入拖拽态」无关：此前带 `&& !isDragging.value`，于是一旦开始拖拽就
    // 放行任意 pointerId，第二根手指的 pointermove 会改写 ghost 与落点。鼠标仍豁免——
    // 鼠标只有一个指针，且个别环境下其 pointerId 会变。
    if (startPointer.pointerId !== -1 && startPointer.pointerId !== e.pointerId && e.pointerType !== 'mouse')
      return false;

    return true;
  };

  /** 按当前落点执行落地（空槽=移动、占用槽=交换），无有效目标返回 false */
  const resolveLandingAction = (): boolean => {
    if (!isDragging.value || !dragOverSlotKey.value || !scoreEditor.activeSong) return false;

    const targetKey = dragOverSlotKey.value;

    // 外部拖拽源（选器和弦浮动面板等，无源槽位）：落到任意字符槽即写入该槽位的和弦
    if (!draggingSlotKey.value) {
      if (!activeChord) return false;
      scoreEditor.setSlotChord(targetKey as SlotKey, activeChord);
      return true;
    }

    if (draggingSlotKey.value === targetKey || !activeChord) return false;

    // 槽位间拖拽统一走 swapOrMoveSlotChords，由它按落点分派：
    // - 落点已有和弦 → 交换（两处互换，**源槽位不落空**）；
    // - 落点为空 → 移动（源清空）；
    // - 同行同类边和弦（行首/行尾）→ 列表内插入式重排（避免「目标覆盖 + 源清空」把边和弦列表缩短）。
    // 此前只有第三种情况走本函数，前两种落到 moveSlotChord —— 那是「目标覆盖 + 源清空」，
    // 拖到占用槽会把源槽位清掉，与「交换」预期不符，故改为无条件走本函数。
    scoreEditor.swapSlotChords(draggingSlotKey.value as SlotKey, targetKey as SlotKey);

    return true;
  };

  /** 触摸端：进入长按等待，给出按压反馈，超时未移动则起拖 */
  const armLongPressStart = (clientX: number, clientY: number) => {
    setPressArming(true);
    longPressTimer = setTimeout(() => {
      setPressArming(false);
      startDrag(clientX, clientY);
      longPressTimer = null;
    }, LONG_PRESS_DELAY);
  };

  /** 真正进入拖拽：标记源槽位样式、设置 ghost 内容、全局拖拽态与触觉反馈 */
  const startDrag = (clientX: number, clientY: number) => {
    if (!activeChord) return;
    setPressArming(false);
    isDragging.value = true;
    wasDraggingInSession = true;
    // 外部拖拽源（选器和弦浮动面板）无源槽位：draggingSlotKey 为 null，落地走 setSlotChord 分支
    draggingSlotKey.value = activeSourceKey;
    if (activeSourceKey) markDragSource(activeSourceKey, 'is-dragging-source');

    setGhostChord(activeChord);
    if (!activeSourceKey)
      // 外部拖拽源：快照当前已渲染的歌词行，供几何就近计算使用
      snapshotExternalLineEls();

    document.body.classList.add('is-global-dragging');

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator)
      try {
        navigator.vibrate(20);
      } catch {
        /* 触觉反馈不可用则忽略 */
      }

    scheduleGhostPos(clientX, clientY);
    if (activeSourceKey) updateDropTarget(clientX, clientY);
    else
      // 外部拖拽源：起拖即做一次几何落点计算
      resolveExternalDropTarget(clientX, clientY);
  };

  /** 全局指针移动：未拖拽时按阈值/长按规则判定起拖；拖拽中更新 ghost 与落点并处理边缘自动滚动 */
  const handleGlobalPointerMove = (e: PointerEvent) => {
    if (!isEventForActivePointer(e)) return;

    currentPointerPos = { x: e.clientX, y: e.clientY };

    if (!isDragging.value) {
      const dx = e.clientX - startPointer.x;
      const dy = e.clientY - startPointer.y;
      const distance = Math.hypot(dx, dy);

      if (startPointer.pointerType === 'touch') {
        if (distance > 10 && longPressTimer) {
          // 手指滑动超阈值：放弃长按起拖意图并释放按压态（activeChord 复位）。
          // 释放必须做——touchmove 守卫按 activeChord 判定，不复位的话这次手势
          // 会一直被 preventDefault，用户从此无法从槽位上滑动滚动歌词。
          clearTimeout(longPressTimer);
          longPressTimer = null;
          resetDragState();
        }
      } else if (distance >= DRAG_THRESHOLD) startDrag(e.clientX, e.clientY);

      return;
    }

    e.preventDefault();
    scheduleGhostPos(e.clientX, e.clientY);
    if (draggingSlotKey.value) scheduleDropTargetUpdate(e.clientX, e.clientY);
    else
      // 外部拖拽源：几何就近计算（绕过 elementFromPoint——抽屉等浮层会干扰命中测试）
      resolveExternalDropTarget(e.clientX, e.clientY);

    // 每次 move 都喂最新指针位置：循环进行中会只更新位置不叠加 rAF（见 useDragAutoScroll）
    checkAutoScroll(
      scrollContainerRef?.value,
      currentPointerPos,
      () => void scheduleDropTargetUpdate(currentPointerPos.x, currentPointerPos.y)
    );
  };

  /** 全局抬起：按当前落点执行落地（空槽移动 / 占用替换），随后统一收尾 */
  const handleGlobalPointerUp = (e: PointerEvent) => {
    if (!isEventForActivePointer(e)) return;

    clearLongPressTimer();

    const hadDrag = isDragging.value || wasDraggingInSession;

    try {
      stopAutoScroll();
      flushGhostPos();
      flushDropTargetUpdate();

      // 落点落地：空槽移动、占用槽替换（无有效目标则取消）
      resolveLandingAction();
    } catch (e) {
      logger.warn('lyrics-drag', '拖拽落地失败，已保留原状态（可手动撤销兜底）', e);
    } finally {
      if (hadDrag) triggerClickSuppression();

      cancelDropTargetUpdate();
      resetDragState();
    }
  };

  /**
   * 拖拽会话的取消收尾（原生 pointercancel / 右键 / 窗口失焦共用）。
   *
   * 刻意**不接收 PointerEvent**：三个触发源里有两个根本没有真实指针事件，此前各自
   * `new PointerEvent('pointercancel')` 伪造一个再走 handleGlobalPointerCancel，而伪造事件的
   * pointerId 恒为 0、pointerType 恒为 ''，过不了 isEventForActivePointer 的活动指针比对
   * （Chromium 鼠标 pointerId=1、触摸 ≥2），两条兜底**从来没真正执行过**——拖到一半切走窗口再
   * 回来，拖拽态、ghost、自动滚动与 body 上的 is-global-dragging 全部悬挂，且此后 pointermove
   * 因 activeChord 仍在而被 preventDefault，歌词行也滑不动了。
   *
   * 「只认活动指针」这一层过滤只属于原生 pointercancel 监听（多指场景：第二根手指的 cancel
   * 不该杀掉第一根手指的拖拽），故留在调用侧，不进本函数。
   */
  const cancelActiveSession = () => {
    clearLongPressTimer();

    const hadDrag = isDragging.value || wasDraggingInSession;

    try {
      stopAutoScroll();
      cancelGhostPos();
      cancelDropTargetUpdate();
    } catch (e) {
      logger.warn('lyrics-drag', '拖拽清理阶段异常（自动滚动/幽灵层/高亮未完全复位）', e);
    } finally {
      if (hadDrag) triggerClickSuppression();

      resetDragState();
    }
  };

  /** 全局取消（原生 pointercancel）：只认活动指针，其余一律忽略 */
  const handleGlobalPointerCancel = (e: PointerEvent) => {
    if (!isEventForActivePointer(e)) return;

    cancelActiveSession();
  };

  /** 窗口失焦（如切换应用）视为拖拽取消，防止状态悬挂 */
  const handleWindowBlur = () => {
    if (isDragging.value || activeSourceKey !== null || activeChord !== null) cancelActiveSession();
  };

  /**
   * 两个按下入口共用的登记体：清长按计时 → 记起点与当前坐标 → 登记拖拽意图（和弦 + 源槽位）
   * → 抑制文本选择与右键菜单 → 触摸端启动长按计时。
   *
   * 守卫**刻意留在各自入口侧**，不并进来：两处的判据本就不同（外部源问「当前是否已有拖拽」、
   * 槽位问「当前是否已有源槽位」），且槽位入口还要先排除「按下的是按钮」。三者都是「要不要开始」
   * 的准入判断，与「开始之后做什么」正交，塞进本函数只会让每个调用方都要读一遍别人的判据。
   *
   * @param sourceKey 源槽位键；外部拖拽源（选器和弦浮动面板等）无源槽位，传 null
   */
  const beginPointerSession = (chord: Chord, sourceKey: string | null, e: PointerEvent) => {
    clearLongPressTimer();
    wasDraggingInSession = false;
    startPointer = {
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
    };
    currentPointerPos = { x: e.clientX, y: e.clientY };
    activeSourceKey = sourceKey;
    activeChord = chord;

    window.getSelection()?.removeAllRanges();
    window.addEventListener('contextmenu', preventContextMenu, true);

    if (e.pointerType === 'touch')
      // 长按等待期给出按压反馈（is-press-arming），提示即将进入拖拽
      armLongPressStart(currentPointerPos.x, currentPointerPos.y);
  };

  /** 外部拖拽源入口（选器和弦浮动面板等）：无源槽位，按下登记意图，移动超阈值起拖，落地写入目标槽位 */
  const startExternalChordDrag = (chord: Chord, e: PointerEvent) => {
    if (activeChord !== null || isDragging.value) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    beginPointerSession(chord, null, e);
  };

  /** 槽位按下入口：记录起点与拖拽模式；触摸端启动长按计时，鼠标端等待移动超过阈值 */
  const handlePointerDown = ({ event: e, slotKey, chord }: { event: PointerEvent; slotKey: string; chord: Chord }) => {
    if (activeSourceKey !== null) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const target = e.target as HTMLElement;
    // 按下的是真实按钮（悬停删除钮等）：不登记拖拽意图，避免「点删除」被当成拖动起点。
    // （按钮自身的 pointerdown 已 stopPropagation，此处按标签再兜一层，防止后续按钮改动漏掉）
    if (target.closest('button')) return;

    beginPointerSession(chord, slotKey, e);
  };

  /**
   * 触摸滚动守卫：长按等待期与拖拽进行中，阻止浏览器把这次触摸接管成页面滚动。
   * 槽位是 touch-action: pan-x pan-y（平时要能滑动滚歌词），浏览器一旦起滚就派发
   * pointercancel，长按拖拽直接被杀——这是触摸端拖拽不可用的根因。
   * 在首个 touchmove 上 preventDefault（非被动监听）即可阻止本次手势起滚；
   * 前提是起滚尚未发生（长按要求 10px 内静止，通常成立）。按压态释放后守卫自动放行。
   */
  const handleTouchMove = (e: TouchEvent) => {
    if (activeChord !== null) e.preventDefault();
  };

  onMounted(() => {
    window.addEventListener('pointermove', handleGlobalPointerMove, { passive: false });
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerCancel);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
  });

  onBeforeUnmount(() => {
    window.removeEventListener('pointermove', handleGlobalPointerMove);
    window.removeEventListener('pointerup', handleGlobalPointerUp);
    window.removeEventListener('pointercancel', handleGlobalPointerCancel);
    window.removeEventListener('blur', handleWindowBlur);
    window.removeEventListener('touchmove', handleTouchMove);
    window.removeEventListener('contextmenu', preventContextMenu, true);
    if (longPressTimer) clearTimeout(longPressTimer);
    stopAutoScroll();
    cancelGhostPos();
    cancelDropTargetUpdate();
    setPressArming(false);
    clearDragClasses();
    document.body.classList.remove('is-global-dragging');
  });

  return {
    isDragging,
    isSuppressingClick,
    draggingSlotKey,
    dragOverSlotKey,
    activeDropLineId,
    ghostChordName,
    setGhostEl,
    handlePointerDown,
    startExternalChordDrag,
  };
}
