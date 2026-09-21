/**
 * overlay 层：元素创建、挂载期监听（宿主 scroll / 手势埋点 / 尺寸观察 / 悬停）与合帧刷新。
 *
 * 从 vScrollbar.ts 抽出（原 1222~1374、1508~1648 行）。
 * 处在依赖图次顶层：单向依赖 core / geometry / drag / wheel / track，只被 vScrollbar 的挂载流程调用。
 */

import { buildFloatingArrowStyle } from '@/platform/ui/popover/floatingArrow';
import { SCROLL_INTERACTIVE_WINDOW_MS } from '@/platform/utils/constants';

import {
  refreshAll,
  scheduleHide,
  setThumbsVisible,
  setTracksVisible,
  showBubble,
  showThumb,
  stampInteraction,
  states,
} from './scrollbarCore';
import { attachThumbDrag } from './scrollbarDrag';
import { getLength, getScrollPos } from './scrollbarGeometry';
import { attachTrackClick, jumpToPointer } from './scrollbarTrack';
import { BUBBLE_ARROW_SIZE } from './scrollbarTypes';
import { attachOverlayWheelForward } from './scrollbarWheel';

import type { ScrollbarState } from './scrollbarCore';
import type { ScrollbarOptions, ScrollbarScrollDetail } from './scrollbarTypes';
import type { CSSProperties } from 'vue';

/** overlay 挂载容器：显式指定优先，缺省回落到宿主父元素（见 options.overlayParent 注释） */
export const resolveOverlayParent = (host: HTMLElement, options: ScrollbarOptions): HTMLElement | null => {
  const target = typeof options.overlayParent === 'function' ? options.overlayParent() : options.overlayParent;
  return target ?? host.parentElement;
};

/** 创建各轴 overlay（拇指/轨道）并挂事件：轨道点击与长按跟随、overlay 悬停显隐、wheel 同参重派发到宿主。 */
export const createAxisOverlays = (state: ScrollbarState, parent: HTMLElement): void => {
  const makeEl = (cls: string) => {
    const el = document.createElement('div');
    el.className = cls;
    parent.appendChild(el);
    return el;
  };
  // 无修饰符且未指定 direction 时默认双轴（x+y）：各轴仅在确有溢出时由轴几何刷新隐藏，
  // 对齐原生滚动条「仅在有可滚内容时出现」的限制。
  for (const axis of state.axes) {
    // no-track 模式：不创建轨道 overlay，只保留拇指（轨道点击/长按跟随随之不可用）
    if (state.options.showTrack) {
      // 拇指在前、轨道在后：z-index 控制层叠（拇指在上），兄弟选择器 thumb:hover ~ track 依赖此顺序
      state.thumbs[axis] = makeEl(`v-scrollbar-thumb v-scrollbar-thumb--${axis}`);
      state.tracks[axis] = makeEl(`v-scrollbar-track v-scrollbar-track--${axis}`);
      // trackClick:'none'：轨道纯视觉，永久撤掉指针事件（可见类的 pointer-events:auto 不覆盖内联样式）
      if (state.options.trackClick === 'none') state.tracks[axis]!.style.pointerEvents = 'none';
      attachTrackClick(state, axis);
    } else state.thumbs[axis] = makeEl(`v-scrollbar-thumb v-scrollbar-thumb--${axis}`);

    attachThumbDrag(state, axis);

    // a11y（V11）：拇指承载 role=scrollbar + 键盘滚动（方向键/PageUp/Down/Home/End）。
    // aria-controls 需要宿主有 id 才有意义：宿主无 id 时生成一个并回填（空串等于未设，
    // AT 会认为控件不关联任何可滚区域——P1 审计 N 系）
    const hostEl = state.host;
    if (!hostEl.id) hostEl.id = `v-scrollbar-host-${Math.random().toString(36).slice(2, 8)}`;
    const thumbEl = state.thumbs[axis]!;
    thumbEl.setAttribute('role', 'scrollbar');
    thumbEl.setAttribute('aria-orientation', axis === 'y' ? 'vertical' : 'horizontal');
    thumbEl.setAttribute('aria-controls', hostEl.id);
    thumbEl.setAttribute('tabindex', '0');
    thumbEl.addEventListener('keydown', (e: KeyboardEvent) => {
      const { host } = state;
      const step = getLength(host, axis, 'client') * 0.1;
      let delta = 0;
      if (axis === 'y') {
        if (e.key === 'ArrowDown') delta = step;
        else if (e.key === 'ArrowUp') delta = -step;
        else if (e.key === 'PageDown') delta = getLength(host, 'y', 'client');
        else if (e.key === 'PageUp') delta = -getLength(host, 'y', 'client');
        else if (e.key === 'Home') delta = -Infinity;
        else if (e.key === 'End') delta = Infinity;
      } else if (e.key === 'ArrowRight') delta = step;
      else if (e.key === 'ArrowLeft') delta = -step;
      else if (e.key === 'Home') delta = -Infinity;
      else if (e.key === 'End') delta = Infinity;
      if (delta === 0) return;
      e.preventDefault();
      const max = Math.max(0, getLength(host, axis, 'scroll') - getLength(host, axis, 'client'));
      const cur = getScrollPos(host, axis);
      const next = delta === Infinity ? max : delta === -Infinity ? 0 : Math.min(max, Math.max(0, cur + delta));
      if (axis === 'y') host.scrollTop = next;
      else host.scrollLeft = next;
    });

    // overlay 是宿主的兄弟节点：指针落在轨道/拇指上时宿主已 mouseleave，
    // 需由 overlay 自身接管悬停状态，否则会误启动自动隐藏；轨道仅在这两种悬停下显示
    const overlay = state.thumbs[axis]!;
    const trackOverlay = state.tracks[axis];
    for (const el of [overlay, trackOverlay]) {
      if (!el) continue;
      el.addEventListener('mouseenter', () => {
        state.hovering = true;
        setTracksVisible(state, true);
        showThumb(state);
      });
      el.addEventListener('mouseleave', () => {
        state.hovering = false;
        setTracksVisible(state, false);
        if (state.dragAxis === null) scheduleHide(state);
      });
      attachOverlayWheelForward(state, axis, el);
    }
  }

  // 滚动气泡：全局单枚（只服务配置指定的轴，不是每轴一枚），但仍与拇指/轨道同为 overlay 兄弟节点，
  // 因此同样不随内容滚走、无需 scrollPos 补偿。
  // 所属轴必须真在启用轴内：否则 applyBubble 取不到该轴读数（会早退），气泡既不定位也不写文案，
  // 却在滚动时被 showBubble 加上可见类——一枚空气泡滞留在父元素左上角。显式写错轴时宁可不建。
  if (state.options.bubble.enabled && state.axes.includes(state.options.bubble.axis)) {
    const { axis, size } = state.options.bubble;
    // 档位类两档都写在注入样式里（各管一套度量），此处按解出的档位直接挂上，无需分支
    const bubble = makeEl(`v-scrollbar-bubble v-scrollbar-bubble--${axis} v-scrollbar-bubble--${size}`);
    // 纯视觉读数：同一信息消费端可由滚动位置得到，重复播报只会干扰读屏
    bubble.setAttribute('aria-hidden', 'true');
    // 读数节点：气泡本体保持 overflow:visible 供箭头探出，省略号与文本都落在它身上（见 renderBubbleText）
    const label = document.createElement('span');
    label.className = 'v-scrollbar-bubble-text';
    bubble.appendChild(label);
    state.bubbleLabel = label;
    // 翻页器：单元节点直接挂在读数节点下（结构见 makeBubbleCell）；未开 roll 时读数节点退回纯文本节点
    if (state.options.bubble.roll)
      state.bubbleRoller = {
        cells: [],
        nodes: [],
        nextKey: 0,
        lastChangeAt: Date.now(),
        pending: [],
        timer: null,
      };

    // 指向箭头：贴在气泡朝滚动条的那条边，随气泡一起被 showBubble/hideBubble 控制显隐
    const arrow = document.createElement('div');
    arrow.className = 'v-scrollbar-bubble-arrow';
    applyArrowStyle(arrow, buildBubbleArrowStyle(axis, BUBBLE_ARROW_SIZE[size]));
    bubble.appendChild(arrow);
    state.bubble = bubble;
  }
};

/**
 * 气泡指向箭头的样式：**复用 Popover/Tooltip 的浮层箭头逻辑**（buildFloatingArrowStyle——
 * 45° 旋转方块 + 裁掉插入面板内的那一半 + 只保留楔形两侧边框），保证三处箭头观感一致。
 *
 * 与那两处不同，气泡方位是恒定的（纵向滚动条的气泡恒在轨道左侧、横向的恒在轨道上方），不存在 flip，
 * 因此不需要 floating-ui 的 arrow middleware：用假 placement 表达「贴哪条边」即可——
 * 气泡在锚点左侧 → placement 'left' → 箭头贴气泡右缘（朝滚动条一侧），
 * 交叉轴居中偏移在创建时按边长直接写 calc（尺寸像素级已知，省掉一次测量与一整套中间件）。
 */
const buildBubbleArrowStyle = (axis: 'x' | 'y', size: number): CSSProperties => {
  const style = buildFloatingArrowStyle({
    placement: axis === 'y' ? 'left' : 'top',
    background: 'var(--bg-panel)',
    borderColor: 'var(--glass-border)',
    size,
    // 气泡自带 1px 边框，与 BasePopover 传同款修正，把箭头原点对齐回 border-box 边缘
    borderWidth: 1,
  });
  // 交叉轴居中：纵向气泡的箭头贴右缘靠 top 居中，横向气泡的箭头贴下缘靠 left 居中
  if (axis === 'y') style.top = `calc(50% - ${size / 2}px)`;
  else style.left = `calc(50% - ${size / 2}px)`;
  return style;
};

/** 把箭头样式对象写入元素：写法与 vTooltip 一致（-webkit- 前缀属性只能走 setProperty，其余按 camelCase 直赋） */
const applyArrowStyle = (el: HTMLElement, style: CSSProperties): void => {
  for (const [key, value] of Object.entries(style)) {
    if (value == null) continue;
    if (key === 'WebkitBackdropFilter') el.style.setProperty('-webkit-backdrop-filter', String(value));
    else (el.style as unknown as Record<string, string>)[key] = String(value);
  }
};

/** 宿主 scroll 监听：刷新几何 + 显示拇指 + 对外派发滚动明细（interactive 区分用户手势与程序化设位）。 */
export const attachHostScroll = (state: ScrollbarState): void => {
  // 宿主监听统一登记进 disposers：updated 重建路径会先 unmount 再 mount，
  // 若不摘除旧监听，同一宿主会累积多份 scroll/mouseenter/mouseleave（闭包持有旧 state）
  const onHostScroll = (): void => {
    refreshAll(state);
    showThumb(state);
    // 对外暴露滚动：位置 + 双轴进度 + 是否用户交互。覆盖原生 scroll、拇指拖拽、轨道点击跳转、
    // 滚轮转发（wheelScroll 通过修改 scrollTop/Left 同样触发原生 scroll）等全部滚动途径。
    // interactive 用于区分「用户滚动手势」与「布局钳位 / 程序化设位」：调整字号、内容增删、
    // scrollTo 等引发的滚动在此为 false，消费端据此过滤非用户触发的信号。
    const { host } = state;
    const maxTop = Math.max(0, host.scrollHeight - host.clientHeight);
    const maxLeft = Math.max(0, host.scrollWidth - host.clientWidth);
    const detail: ScrollbarScrollDetail = {
      scrollTop: host.scrollTop,
      scrollLeft: host.scrollLeft,
      maxScrollTop: maxTop,
      maxScrollLeft: maxLeft,
      progressY: maxTop > 0 ? host.scrollTop / maxTop : 0,
      progressX: maxLeft > 0 ? host.scrollLeft / maxLeft : 0,
      interactive: Date.now() - state.lastInteractionAt < SCROLL_INTERACTIVE_WINDOW_MS,
    };
    state.options.onScroll?.(detail);
    // 滚动气泡：所有滚动路径都汇聚到宿主 scroll 事件（原生滚动、拇指拖拽、轨道跳转/翻页、滚轮转发、
    // 程序化 scrollTo），故只需在此显形即可覆盖全部交互。
    // 但显形只认气泡所属轴：宿主双轴可滚时，滚另一轴并不会让读数变化，此刻浮现的是一份陈旧读数，
    // 看起来却像「跟着当前滚动在动」。非所属轴滚动时不显形也不重置倒计时——气泡按自己的节奏淡出。
    // onlyInteractive 时再过滤掉非手势滚动（布局钳位 / 程序化设位）。
    const { bubble } = state.options;
    if (bubble.enabled) {
      const axisPos = bubble.axis === 'y' ? detail.scrollTop : detail.scrollLeft;
      const moved = axisPos !== state.bubbleAxisPos;
      state.bubbleAxisPos = axisPos;
      if (moved && (!bubble.onlyInteractive || detail.interactive)) showBubble(state);
    }
  };
  // 所属轴基线：气泡「只认所属轴」的判据是位置有没有变，故先记一次当前值。
  // 取在这里而不是 buildState——updated 每次都以 buildState 造候选 state 做比较，
  // 在那条路径上读 scrollTop 会在 Vue patch 之后强制一次同步布局（乐谱预览这类大页代价可观）；
  // 挂载路径上紧接着就是 refreshAll 的量测，这里的读不额外造成回流。
  state.bubbleAxisPos = getScrollPos(state.host, state.options.bubble.axis);
  state.host.addEventListener('scroll', onHostScroll, { passive: true });
  state.disposers.push(() => state.host.removeEventListener('scroll', onHostScroll));
};

/** 宿主内的用户滚动手势埋点：pointerdown（拖动内容/选中）与 wheel 均视为用户发起。
 *  overlay 上的拖拽 / 轨道点击由各自的事件处理器另行打点（见 stampInteraction 注释）。 */
export const attachInteractionStamps = (state: ScrollbarState): void => {
  const { host } = state;
  const onPointerDown = (): void => stampInteraction(state);
  const onWheel = (): void => stampInteraction(state);
  host.addEventListener('pointerdown', onPointerDown, { passive: true });
  host.addEventListener('wheel', onWheel, { passive: true });
  state.disposers.push(() => host.removeEventListener('pointerdown', onPointerDown));
  state.disposers.push(() => host.removeEventListener('wheel', onWheel));
};

/**
 * 几何刷新的合帧调度（ResizeObserver / MutationObserver 两条观察者路径共用）。
 *
 * 观察者回调会在一帧内投递多次（MutationObserver 每个微任务检查点都会投递一批），逐次 refreshAll
 * 就是逐次读几何；合并到 rAF 后每帧最多算一次，且读数发生在布局已干净时，不会在 DOM 变更的中间态
 * 触发强制同步回流。scroll 事件本身规范上最多每帧一次，仍走同步 refreshAll（见 attachHostScroll），
 * 避免给滚动位置引入一帧延迟。
 */
export const scheduleRefresh = (state: ScrollbarState): void => {
  if (state.refreshRaf !== null) return;
  state.refreshRaf = requestAnimationFrame(() => {
    state.refreshRaf = null;
    // 期间已卸载（updated 重建 / 元素移除）：state 已失效，刷新句柄已随 unmount 取消，此处再兜一层
    if (states.get(state.host) !== state) return;
    refreshAll(state);
    // 长按轨道跟随期间，尺寸变化（如子元素增长/图片加载）需补发 jumpToPointer，
    // 否则指针静止时内容尺寸变化不会重算，跟随位置与鼠标脱节。
    if (state.trackPressAxis && state.trackPressPointer)
      jumpToPointer(state, state.trackPressAxis, state.trackPressPointer, 'smooth');
  });
};

/** 登记直接子元素进观察集（幂等：已在集合内的元素不重复 observe——observe 虽幂等，但每次调用都是浏览器侧登记） */
const registerObservedChild = (state: ScrollbarState, child: Element): void => {
  if (!state.resizeObserver || state.observedChildren.has(child)) return;
  state.observedChildren.add(child);
  state.resizeObserver.observe(child);
};

/** 尺寸观测：宿主与全部直接子元素任一尺寸变化都刷新几何；内容增删（MutationObserver）触发后需把新子元素补进观察集。 */
export const attachSizeObservers = (state: ScrollbarState): void => {
  const { host } = state;
  // 缺失环境降级为仅 scroll 驱动
  if (typeof ResizeObserver !== 'undefined') {
    state.resizeObserver = new ResizeObserver(() => scheduleRefresh(state));
    state.resizeObserver.observe(host);
    // 直接子元素逐个观察：子元素撑高不改变宿主自身盒子，只观察宿主会漏掉内容增长
    for (const child of host.children) registerObservedChild(state, child);
  }
  if (typeof MutationObserver !== 'undefined') {
    state.mutationObserver = new MutationObserver(mutations => {
      if (state.resizeObserver)
        for (const mutation of mutations) {
          // 被移除的子元素不再观察：ResizeObserver 不会因元素脱离 DOM 自动停止，
          // 高频增删列表若不显式 unobserve，会持续持有已移除节点的引用形成泄漏
          for (const node of mutation.removedNodes)
            if (node instanceof Element && state.observedChildren.delete(node)) state.resizeObserver.unobserve(node);

          // 只补观察本次新增的直接子元素。原来每次 DOM 变更都遍历 host.children 全量重观察：
          // observe 对已观察元素虽幂等，但千级列表（和弦库/谱面列表）+ 拖拽排序下，
          // 这条回调本身高频触发，全量重登记是 O(n) 次纯白跑
          for (const node of mutation.addedNodes)
            if (node instanceof Element && node.parentNode === host) registerObservedChild(state, node);
        }

      scheduleRefresh(state);
    });
    state.mutationObserver.observe(host, { childList: true, subtree: true, characterData: true });
  }
};

/** 悬停宿主即显示滚动条且常显（overlay 与宿主是兄弟节点，无法用 CSS :hover 表达）；离开后倒计时隐藏。 */
export const attachHoverVisibility = (state: ScrollbarState): void => {
  const { host } = state;
  const onHostMouseEnter = (): void => {
    state.hovering = true;
    refreshAll(state);
    showThumb(state);
  };
  const onHostMouseLeave = (): void => {
    state.hovering = false;
    if (state.dragAxis === null) scheduleHide(state);
  };
  host.addEventListener('mouseenter', onHostMouseEnter);
  host.addEventListener('mouseleave', onHostMouseLeave);
  state.disposers.push(() => {
    host.removeEventListener('mouseenter', onHostMouseEnter);
    host.removeEventListener('mouseleave', onHostMouseLeave);
  });
  if (state.options.autoHide === false) setThumbsVisible(state, true);
};
