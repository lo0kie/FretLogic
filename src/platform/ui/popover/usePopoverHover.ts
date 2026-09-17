import { useEventListener } from '@vueuse/core';

import { getPointerState } from '@/platform/ui/popover/popoverPointerTracking';

/**
 * hover 模式的浮层开/关生命周期：延时计时槽、「关闭后防重开」抑制、离开坐标走廊、
 * 全局 hover 路由。定位几何（isPointerInside / isEventInside）留在宿主组件，
 * 本 composable 只拥有「何时该开、何时该关」的时序决策。
 */

/** 判定「指针确实移动过」的位移阈值（px）：低于此值视为手抖或坐标取整，不算移动 */
const HOVER_REOPEN_MOVE_THRESHOLD_PX = 4;

interface UsePopoverHoverOptions {
  /** 是否处于 hover 触发模式 */
  isHoverMode: () => boolean;
  /** 是否未被禁用 */
  isEnabled: () => boolean;
  /** 浮层是否处于打开态 */
  isOpen: () => boolean;
  /** 是否处于钉住态（钉住时 hover 移出不自动关闭） */
  isPinned: () => boolean;
  /** 触发器当前是否被指针悬停（`:hover` 判定，供关闭复核日志） */
  isTriggerHovered: () => boolean;
  /** 指针此刻是否真的落在合法区域内（几何复核，宿主实现） */
  isPointerInside: () => boolean;
  /** 事件目标是否在浮层合法区域内（宿主实现） */
  isEventInside: (target: EventTarget | null) => boolean;
  /** dev 日志用：合法矩形快照与外扩量 */
  getDebugRects: () => { pad: number; rects: (string | null)[] };
  /** hover 打开延时（ms，来自宿主 props） */
  hoverOpenDelay: number;
  /** hover 关闭延时（ms，来自宿主 props） */
  hoverCloseDelay: number;
  open: () => void;
  close: (reason?: string) => void;
  /** 鼠标再次进入时置顶（「最近交互者在上」） */
  bringToFront: () => void;
  /** dev 日志标识 */
  instanceId: string;
}

export function usePopoverHover(options: UsePopoverHoverOptions) {
  const {
    isHoverMode,
    isEnabled,
    isOpen,
    isPinned,
    isTriggerHovered,
    isPointerInside,
    isEventInside,
    getDebugRects,
    open,
    close,
    bringToFront,
    instanceId,
  } = options;

  const IS_DEV = import.meta.env.DEV;

  /**
   * hover 开/关延时共用的计时槽。
   *
   * 计时器触发时必须把槽位清空（见 scheduleOpen / scheduleClose）：否则「槽位非空」不再等价于
   * 「有计时在等待」——已触发的旧 id 会一直占着槽位，让凭 `!hoverTimer` 判断「当前没有计时」的调用点
   * 恒判为假（关闭安全网装不上），而任何一次区域内的 mouseover 又把它清成 null 使判据恢复为真。
   * 同一操作两次结果不同，正是「偶尔」这类不确定现象的温床。
   */
  let hoverTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * 关闭后是否抑制「再次悬停打开」。
   *
   * 选中菜单项后面板关闭，而指针往往还停在触发器上（点完手没动）；另一种情况是列表因排序
   * 变更重排，浏览器对指针下的元素重做命中测试而**补发** mouseenter（指针压根没动）。
   * 两者都会让刚关掉的菜单立刻又弹出来，现象即「选完又开，反复闪」。
   *
   * 抑制一直持续到**指针真的移动过**（见 releaseSuppressIfPointerMoved）或离开触发器为止，
   * 符合「一次操作只弹一次」的直觉，也不会影响首次打开。
   */
  let suppressHoverReopen = false;

  /**
   * 抑制生效那一刻的指针坐标。
   *
   * 它是区分两类事件的关键：**指针没动却被补发的 mouseenter**（列表重排后浏览器重做命中测试）
   * 坐标与关闭时完全一致，而**用户真的把鼠标移回来了**必然产生位移。
   */
  let suppressAnchor: { x: number; y: number } | null = null;

  /**
   * 最近一次「疑似离开」时的指针坐标（触发器移出 / 面板移出 / 全局 hover 路由判定落在区域外）。
   * 仅在从未收到过 pointermove 时作为兜底坐标参与判定（见 isPointerInside 第 3 层的分支）。
   */
  let leavePoint: { x: number; y: number } | null = null;

  /** 清除 hover 计时器（对已触发的 id 调 clear 是空操作，槽位语义不受影响） */
  const clearHoverTimer = () => {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
  };

  /**
   * 指针自抑制生效后确实移动过 → 解除抑制（返回是否可继续走打开流程）。
   *
   * 只靠触发器 mouseleave 解除是不够的：选中菜单项时指针停在**面板**上，触发器根本没收过
   * mouseleave，抑制也就没有解除的机会 —— 用户移回触发器时 mouseenter 被吃掉，必须再移出
   * 一次才开，现象即「切换排序后要第二次移入才显示」。位移才是「用户主动移回来了」的可靠判据。
   */
  const releaseSuppressIfPointerMoved = (x: number, y: number): boolean => {
    if (!suppressHoverReopen) return true;
    const moved =
      !suppressAnchor ||
      Math.abs(x - suppressAnchor.x) >= HOVER_REOPEN_MOVE_THRESHOLD_PX ||
      Math.abs(y - suppressAnchor.y) >= HOVER_REOPEN_MOVE_THRESHOLD_PX;
    if (!moved) return false;
    suppressHoverReopen = false;
    suppressAnchor = null;
    return true;
  };

  /** 延时打开：槽位若被占用则重新计时（触发器 mouseenter 唯一入口） */
  const scheduleOpen = (delay: number) => {
    clearHoverTimer();
    // 抑制窗口内不自动重开（指针未移动过 → 视为补发事件，见 suppressHoverReopen 注释）
    if (suppressHoverReopen) return;
    hoverTimer = setTimeout(() => {
      hoverTimer = null;
      open();
    }, delay);
  };

  /**
   * 延时关闭：三条路径（触发器移出 / 面板移出 / 全局 hover 路由判定落入区域外）共用，
   * 到期时先复核钉住态与指针位置，指针仍在区域内则视为事件抖动、不关。
   */
  const scheduleClose = (delay: number) => {
    clearHoverTimer();
    hoverTimer = setTimeout(() => {
      hoverTimer = null;
      const inside = isPointerInside();
      if (IS_DEV) {
        const pointer = getPointerState();
        console.debug(`[popover${instanceId}] hover 计时到期`, {
          delay,
          pinned: isPinned(),
          inside,
          triggerHover: isTriggerHovered() ? true : null,
          pointer: pointer.tracked ? { x: pointer.x, y: pointer.y } : 'untracked',
          // 几何复核的判定依据：三个合法矩形与外扩量，缺一不可（漏掉哪个矩形就会误判为「已离开」）
          ...getDebugRects(),
        });
      }
      if (isPinned() || inside) {
        // 判为「仍在区域内」后不自动续计时：指针此刻就在区域内，等它真离开时必然有新的
        // mouseleave / mouseover 重新装上计时；而「指针已停在区域外」这一情形由 isPointerInside
        // 的实时坐标直接判否并关闭，不需要靠续计时兜底。
        leavePoint = null;
        return;
      }
      close('hover-timeout');
    }, delay);
  };

  /**
   * close() 入口的前置钩子：作废离开坐标，并按关闭原因装上/解除「防重开」抑制。
   *
   * hover 自然移出（hover-timeout）除外：那种关闭发生在指针**已离开**触发器之后，此时放开抑制，
   * 用户移回来才能正常再次悬停打开（收起再悬停是常规操作）；而菜单项选中、外部点击、Esc、
   * 失焦这类「明确操作」导致的关闭，指针往往还停在触发器上，必须抑制，否则刚关就又弹出来。
   */
  const onCloseStart = (reason: string) => {
    leavePoint = null;
    if (reason === 'hover-timeout') return;
    const pointer = getPointerState();
    // 没有可用指针坐标（触摸、程序化打开）时不抑制：那种场景不会有 mouseleave 来解除抑制，
    // 菜单会彻底卡在「悬停打不开」，比「刚关又弹出来」严重得多
    suppressHoverReopen = pointer.tracked;
    suppressAnchor = pointer.tracked ? { x: pointer.x, y: pointer.y } : null;
  };

  /** hover 触发：延时打开，并让已打开的浮层置顶 */
  const handleTriggerMouseEnter = (e: MouseEvent) => {
    if (!isHoverMode() || !isEnabled()) return;
    leavePoint = null;
    if (releaseSuppressIfPointerMoved(e.clientX, e.clientY)) scheduleOpen(options.hoverOpenDelay);
    // 已打开的浮层（如被钉住的）在鼠标再次进入时置顶，保证「最近交互者在上」
    bringToFront();
  };

  /**
   * hover 触发：抑制窗口内指针在触发器上移动时补一次打开。
   *
   * 覆盖「关闭那一刻指针恰好停在触发器上、之后只在触发器内小幅移动」的场景 —— 那种情况
   * 不会再有 mouseenter，只有 mousemove 能证明用户真的动过鼠标。解除后抑制即关闭，
   * 后续 mousemove 直接早退，不会反复重置打开延时。
   */
  const handleTriggerMouseMove = (e: MouseEvent) => {
    if (!isHoverMode() || !isEnabled()) return;
    if (!suppressHoverReopen) return;
    if (releaseSuppressIfPointerMoved(e.clientX, e.clientY)) scheduleOpen(options.hoverOpenDelay);
  };

  /** hover 触发：记下离开时的指针坐标并延时关闭（钉住时不关） */
  const handleTriggerMouseLeave = (e: MouseEvent) => {
    // 指针真正离开触发器 → 解除「关闭后不重开」窗口（须早于下方 trigger/pinned 早退，
    // 否则钉住态下离开不会解除，菜单再也悬停不开）
    suppressHoverReopen = false;
    suppressAnchor = null;
    if (!isHoverMode() || isPinned()) return;
    leavePoint = { x: e.clientX, y: e.clientY };
    scheduleClose(options.hoverCloseDelay);
  };

  /** 鼠标移入面板：取消关闭计时、作废离开坐标并置顶 */
  const handlePanelMouseEnter = () => {
    if (!isHoverMode()) return;
    leavePoint = null;
    clearHoverTimer();
    // 从别的浮层移入本面板时置顶（「最近交互者在上」）
    bringToFront();
  };

  /** 鼠标移出面板：记下离开时的指针坐标并延时关闭（钉住时不关） */
  const handlePanelMouseLeave = (e: MouseEvent) => {
    if (!isHoverMode() || isPinned()) return;
    leavePoint = { x: e.clientX, y: e.clientY };
    scheduleClose(options.hoverCloseDelay);
  };

  /**
   * hover 模式全局 hover 路由：鼠标落在任何「合法区域」（trigger / panel / 嵌套子浮层链，
   * 如面板内 Selector 的下拉菜单）内时取消关闭计时；落在区域外时确保计时存在。
   * 解决「鼠标从面板移入子浮层瞬间，父面板因 mouseleave 计时到期被关闭」的问题。
   */
  useEventListener(
    window,
    'mouseover',
    (e: MouseEvent) => {
      if (!isHoverMode() || !isOpen() || isPinned()) return;
      if (isEventInside(e.target)) {
        leavePoint = null;
        clearHoverTimer();
      } else if (!hoverTimer) {
        leavePoint = { x: e.clientX, y: e.clientY };
        scheduleClose(options.hoverCloseDelay);
      }
    },
    true
  );

  return {
    clearHoverTimer,
    onCloseStart,
    /** 最近一次「疑似离开」的坐标（宿主的走廊兜底判定 isPointerInCorridor 需要） */
    getLeavePoint: () => leavePoint,
    handleTriggerMouseEnter,
    handleTriggerMouseMove,
    handleTriggerMouseLeave,
    handlePanelMouseEnter,
    handlePanelMouseLeave,
  };
}
