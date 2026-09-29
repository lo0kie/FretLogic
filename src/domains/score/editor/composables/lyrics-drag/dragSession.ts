/**
 * 歌词拖拽的指针会话状态机：谁算「这次手势的活动指针」、什么时候进入拖拽态、什么时候收尾。
 *
 * 从 `useLyricsDragDrop` 里切出来 —— 这段是整条链路里唯一持有可变会话态的部分（起点、活动指针、
 * 当前指针位置、长按计时、拖拽意图），而「进入拖拽态之后要做什么」全是宿主侧的副作用
 * （ghost 层、源槽位高亮、落点解析、边缘自动滚动）。边界就取在这里：**本模块只回答「何时」，
 * 宿主回答「做什么」**，于是会话态不再与那四套实现细节缠在同一个函数里。
 *
 * 四条容易被改坏的不变量，各自见其下注释：
 * ① 活动指针判定与「是否已进入拖拽态」无关；
 * ② 触摸端的 contextmenu 不取消本次拖拽；
 * ③ 触摸端超阈值滑动是「放弃长按」而不是起拖；
 * ④ 取消收尾刻意不接收 PointerEvent（伪造事件的 pointerId 过不了活动指针守卫）。
 */
import { ref } from 'vue';

import { logger } from '@/platform/utils/logger';

import type { Chord } from '@/domains/chord/types';
import type { Ref } from 'vue';

/** 鼠标起拖的位移阈值(px)：阈值内仍走原生 click 选择 */
const DRAG_THRESHOLD = 5;
/** 触摸端起拖的长按时长(ms) */
const LONG_PRESS_DELAY = 280;
/** 触摸端「放弃长按」的滑动阈值(px)：超过它即认为用户想滚歌词而不是拖和弦 */
const TOUCH_LONG_PRESS_SLOP_PX = 10;

/** 会话结束后的 click 抑制时长(ms)：松手那一刻浏览器可能向起点补发 click */
const CLICK_SUPPRESS_MS = 120;

/** 宿主侧的副作用：会话只决定「何时」，做什么全在这里 */
export interface DragSessionEffects {
  /**
   * 真正进入拖拽态。调用时机被刻意放在 body 挂上全局拖拽标记**之前** —— 该标记命中 `& *`、
   * 会让整篇样式失效，而宿主在本回调里要读一次歌词行矩形快照（外部拖拽源的几何就近）。
   * 顺序反过来，那次读就是一次强制重排。
   */
  onDragStart: (chord: Chord, sourceKey: string | null, x: number, y: number) => void;
  /** 拖拽中的指针移动（已过活动指针守卫）：更新 ghost、落点与边缘自动滚动 */
  onDragMove: (x: number, y: number) => void;
  /** 抬起：停自动滚动 → flush ghost 与两条落点节流 → 按落点落地 */
  onDrop: () => void;
  /** 取消：停自动滚动 → 取消 ghost 与两条落点节流 */
  onCancel: () => void;
  /** 丢弃两条落点节流里排队的帧（抬起收尾用；不碰自动滚动与 ghost） */
  discardPendingFrames: () => void;
  /** 会话收尾后的 DOM 复位：源槽位高亮类、body 上的全局拖拽标记 */
  onReset: () => void;
}

export interface DragSessionApi {
  /** 是否已进入拖拽态（区别于「按下但还没超阈值」的等待态） */
  isDragging: Ref<boolean>;
  /** 拖拽刚结束时短暂置真，宿主据此吞掉浏览器补发的 click */
  isSuppressingClick: Ref<boolean>;
  /** 当前拖拽源槽位键；null = 外部拖拽源（无源槽位） */
  draggingSlotKey: Ref<string | null>;
  /** 本次会话携带的和弦（落地时要写进目标槽位；无会话时为 null） */
  activeChord: () => Chord | null;
  /** 当前指针位置：ghost 挂载时要按它定位，故需外露 */
  currentPointerPos: () => { x: number; y: number };
  /** 槽位按下入口 */
  handlePointerDown: (payload: { event: PointerEvent; slotKey: string; chord: Chord }) => void;
  /** 外部拖拽源入口（选器和弦浮动面板等） */
  startExternalChordDrag: (chord: Chord, e: PointerEvent) => void;
  /** 取消当前会话与长按等待（原生 pointercancel / 右键 / 失焦 / 外部手势接管共用） */
  cancelActiveSession: () => void;
  /** 全局 pointermove：未拖拽时判起拖，拖拽中交给宿主 */
  handleGlobalPointerMove: (e: PointerEvent) => void;
  /** 全局 pointerup：落地并收尾 */
  handleGlobalPointerUp: (e: PointerEvent) => void;
  /** 全局 pointercancel：只认活动指针 */
  handleGlobalPointerCancel: (e: PointerEvent) => void;
  /** 窗口失焦视为取消，防止状态悬挂 */
  handleWindowBlur: () => void;
  /** 触摸滚动守卫：长按等待期与拖拽进行中阻止浏览器把这次触摸接管成页面滚动 */
  handleTouchMove: (e: TouchEvent) => void;
  /** 卸载清理：摘 contextmenu 监听、清长按计时器、复位按压反馈 */
  dispose: () => void;
}

export const createDragSession = (effects: DragSessionEffects): DragSessionApi => {
  const isDragging = ref(false);
  const isSuppressingClick = ref(false);
  const draggingSlotKey = ref<string | null>(null);

  let wasDraggingInSession = false;
  let startPointer = { x: 0, y: 0, pointerId: -1, pointerType: '' };
  let currentPointerPos = { x: 0, y: 0 };
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let activeSourceKey: string | null = null;
  let activeChord: Chord | null = null;

  /** 触摸长按等待期的按压反馈：在源槽位上加 is-press-arming 类（渐进提示即将进入拖拽） */
  const setPressArming = (arming: boolean) => {
    if (!activeSourceKey) return;
    document
      .querySelectorAll(`[data-slot-key="${CSS.escape(activeSourceKey)}"]`)
      .forEach(el => el.classList.toggle('is-press-arming', arming));
  };

  /** 短暂抑制拖拽结束后的 click，避免松手误触发槽位点击 */
  const triggerClickSuppression = () => {
    isSuppressingClick.value = true;
    setTimeout(() => {
      isSuppressingClick.value = false;
    }, CLICK_SUPPRESS_MS);
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
    // 不变量①：活动指针判定与「是否已进入拖拽态」无关。此前带 `&& !isDragging.value`，
    // 于是一旦开始拖拽就放行任意 pointerId，第二根手指的 pointermove 会改写 ghost 与落点。
    // 鼠标仍豁免 —— 鼠标只有一个指针，且个别环境下其 pointerId 会变。
    if (startPointer.pointerId !== -1 && startPointer.pointerId !== e.pointerId && e.pointerType !== 'mouse')
      return false;

    return true;
  };

  /** 拖拽会话期间屏蔽右键菜单；拖拽中右键视为取消本次拖拽 */
  const preventContextMenu = (e: MouseEvent) => {
    // 不变量②：**触摸端不取消**。本次拖拽正是由长按（LONG_PRESS_DELAY）起来的，而系统长按菜单
    // 通常要再过一两百毫秒才派发 contextmenu —— 照鼠标右键处理的话，触摸端长按拖拽必然「刚起来就被
    // 自己取消」（外部拖拽源最明显：面板卡片长按起拖后 ghost 一闪即消失）。触摸端只屏蔽菜单，
    // 会话继续到抬手落地；顺带一提，下面的 preventDefault 也正是「系统菜单不弹 ⇒ 浏览器不会因
    // 菜单接管手势而补发 pointercancel」的那道闸。
    if (isDragging.value && startPointer.pointerType !== 'touch') cancelActiveSession();

    // 条件里带上 activeChord：本监听只在指针会话存续期间挂着（beginPointerSession 挂、
    // resetDragState 摘），故「挂着」本身即「正在拖 / 正在等长按」—— 长按等待期同样不该弹菜单，
    // 否则系统菜单一弹，这次手势就被浏览器接管，长按起拖永远轮不到。
    if (activeChord !== null || isDragging.value || wasDraggingInSession) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  };

  /** 拖拽/长按结束的统一收尾：重置会话态并复位 DOM 副作用 */
  const resetDragState = () => {
    setPressArming(false);
    isDragging.value = false;
    draggingSlotKey.value = null;
    activeSourceKey = null;
    activeChord = null;
    startPointer = { x: 0, y: 0, pointerId: -1, pointerType: '' };
    effects.onReset();
    window.removeEventListener('contextmenu', preventContextMenu, true);
  };

  /** 真正进入拖拽：置拖拽态与源槽位键，随后把 DOM 副作用整体交给宿主 */
  const startDrag = (clientX: number, clientY: number) => {
    if (!activeChord) return;
    setPressArming(false);
    isDragging.value = true;
    wasDraggingInSession = true;
    // 外部拖拽源（选器和弦浮动面板）无源槽位：draggingSlotKey 为 null，落地走 setSlotChord 分支
    draggingSlotKey.value = activeSourceKey;

    // 不变量：本回调必须早于 body 上的全局拖拽标记。标记一挂，整篇样式失效，宿主在回调里那次
    // 歌词行矩形快照就会当场把失效的样式与布局全部结清 —— 那次强制重排就卡在指针事件处理里
    // （外部源实测 ~36ms）。宿主随后把 ghost 与落点都排到下一帧，故起拖那一下不阻塞输入。
    effects.onDragStart(activeChord, activeSourceKey, clientX, clientY);
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

  /**
   * 两个按下入口共用的登记体：清长按计时 → 记起点与当前坐标 → 登记拖拽意图（和弦 + 源槽位）
   * → 抑制文本选择与右键菜单 → 触摸端启动长按计时。
   *
   * 守卫**刻意留在各自入口侧**，不并进来：两处的判据本就不同（外部源问「当前是否已有拖拽」、
   * 槽位问「当前是否已有源槽位」），且槽位入口还要先排除「按下的是按钮」。三者都是「要不要开始」
   * 的准入判断，与「开始之后做什么」正交，塞进本函数只会让每个调用方都要读一遍别人的判据。
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

    if (e.pointerType === 'touch') armLongPressStart(currentPointerPos.x, currentPointerPos.y);
  };

  /** 外部拖拽源入口（选器和弦浮动面板等）：无源槽位，按下登记意图，移动超阈值起拖 */
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

  /** 全局指针移动：未拖拽时按阈值/长按规则判定起拖；拖拽中把坐标交给宿主 */
  const handleGlobalPointerMove = (e: PointerEvent) => {
    if (!isEventForActivePointer(e)) return;

    // 自愈：pointerup 未必收得到 —— 右键那条路径已由 preventContextMenu 挡在菜单弹出之前
    //（不变量②），但「指针在窗口外抬起」挡不住，那一次 pointerup 就是永远到不了。本监听挂在
    // window 上，会话不复位的话此后任何无按键的移动都会被当成在途拖拽：ghost 跟着光标满屏走，
    // 歌词行还会因 activeChord 仍在而被 preventDefault（再也滑不动）。按**取消**收尾而非落定 ——
    // 手势已经死了，落点无从判定，与窗口失焦同一条路径（见 handleWindowBlur）。
    // 判据与 useSliderInteraction / BaseSwitch / vScrollbar 的同名守卫同口径。
    if (e.buttons === 0) {
      cancelActiveSession();
      return;
    }

    currentPointerPos = { x: e.clientX, y: e.clientY };

    if (!isDragging.value) {
      const dx = e.clientX - startPointer.x;
      const dy = e.clientY - startPointer.y;
      const distance = Math.hypot(dx, dy);

      if (startPointer.pointerType === 'touch') {
        // 不变量③：触摸端超阈值滑动是「放弃长按」，不是起拖。释放必须做 —— touchmove 守卫按
        // activeChord 判定，不复位的话这次手势会一直被 preventDefault，用户从此无法从槽位上滑动滚歌词。
        if (distance > TOUCH_LONG_PRESS_SLOP_PX && longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
          resetDragState();
        }
      } else if (distance >= DRAG_THRESHOLD) startDrag(e.clientX, e.clientY);

      return;
    }

    e.preventDefault();
    effects.onDragMove(e.clientX, e.clientY);
  };

  /** 全局抬起：把落点落地交给宿主，随后统一收尾 */
  const handleGlobalPointerUp = (e: PointerEvent) => {
    if (!isEventForActivePointer(e)) return;

    clearLongPressTimer();

    const hadDrag = isDragging.value || wasDraggingInSession;

    try {
      effects.onDrop();
    } catch (error) {
      logger.warn('lyrics-drag', '拖拽落地失败，已保留原状态（可手动撤销兜底）', error);
    } finally {
      if (hadDrag) triggerClickSuppression();

      effects.discardPendingFrames();
      resetDragState();
    }
  };

  /**
   * 拖拽会话的取消收尾（原生 pointercancel / 右键 / 窗口失焦共用）。
   *
   * 不变量④：刻意**不接收 PointerEvent**。三个触发源里有两个根本没有真实指针事件，此前各自
   * `new PointerEvent('pointercancel')` 伪造一个再走全局 cancel，而伪造事件的 pointerId 恒为 0、
   * pointerType 恒为 ''，过不了活动指针守卫（Chromium 鼠标 pointerId=1、触摸 ≥2），两条兜底
   * **从来没真正执行过** —— 拖到一半切走窗口再回来，拖拽态、ghost、自动滚动与 body 上的
   * is-global-dragging 全部悬挂，且此后 pointermove 因 activeChord 仍在而被 preventDefault，
   * 歌词行也滑不动了。
   *
   * 「只认活动指针」这一层过滤只属于原生 pointercancel 监听（多指场景：第二根手指的 cancel
   * 不该杀掉第一根手指的拖拽），故留在调用侧，不进本函数。
   */
  const cancelActiveSession = () => {
    clearLongPressTimer();

    const hadDrag = isDragging.value || wasDraggingInSession;

    try {
      effects.onCancel();
    } catch (error) {
      logger.warn('lyrics-drag', '拖拽清理阶段异常（自动滚动/幽灵层/高亮未完全复位）', error);
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
   * 触摸滚动守卫：长按等待期与拖拽进行中，阻止浏览器把这次触摸接管成页面滚动。
   * 槽位是 touch-action: pan-x pan-y（平时要能滑动滚歌词），浏览器一旦起滚就派发
   * pointercancel，长按拖拽直接被杀 —— 这是触摸端拖拽不可用的根因。
   * 在首个 touchmove 上 preventDefault（非被动监听）即可阻止本次手势起滚；
   * 前提是起滚尚未发生（长按要求 10px 内静止，通常成立）。按压态释放后守卫自动放行。
   */
  const handleTouchMove = (e: TouchEvent) => {
    if (activeChord !== null) e.preventDefault();
  };

  /** 卸载清理：摘 contextmenu 监听、清长按计时器、复位按压反馈 */
  const dispose = () => {
    window.removeEventListener('contextmenu', preventContextMenu, true);
    clearLongPressTimer();
    setPressArming(false);
  };

  return {
    isDragging,
    isSuppressingClick,
    draggingSlotKey,
    activeChord: () => activeChord,
    currentPointerPos: () => currentPointerPos,
    handlePointerDown,
    startExternalChordDrag,
    cancelActiveSession,
    handleGlobalPointerMove,
    handleGlobalPointerUp,
    handleGlobalPointerCancel,
    handleWindowBlur,
    handleTouchMove,
    dispose,
  };
};
