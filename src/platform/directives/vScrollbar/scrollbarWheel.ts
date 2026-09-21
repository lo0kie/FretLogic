/**
 * 滚动条的滚轮链路：缓动滚动、宿主余量裁决、overlay 上的 wheel 重派发与兜底驱动。
 *
 * 从 vScrollbar.ts 抽出（原 954~995、1376~1506 行）。
 * 依赖方向：core ← wheel（drag 与 track 再依赖 wheel），wheel 不反向依赖它们，故无环。
 */

import { EDGE_LOCK_MS, isWheelScrollSeen } from '@/platform/directives/vWheelScroll';
import { clamp } from '@/platform/utils/common';
import { toPixelDelta } from '@/platform/utils/dom';

import type { ScrollbarState } from './scrollbarCore';

/** 取消进行中的滚轮缓动动画 */
export const cancelWheelAnim = (state: ScrollbarState): void => {
  if (state.wheelAnim !== null) {
    cancelAnimationFrame(state.wheelAnim.raf);
    state.wheelAnim = null;
  }
};

/**
 * 滚轮转发：目标位置累积 + rAF 每帧向目标渐近。
 * 不用 scrollBy smooth——连续滚轮事件会不断重启平滑动画互相打断，实际位移远小于原生。
 */
export const wheelScroll = (state: ScrollbarState, dx: number, dy: number): void => {
  const { host } = state;
  let anim = state.wheelAnim;
  if (anim === null) {
    anim = { top: host.scrollTop, left: host.scrollLeft, raf: 0 };
    state.wheelAnim = anim;
    const step = (): void => {
      const a = state.wheelAnim;
      if (!a) return;
      const maxTop = Math.max(0, host.scrollHeight - host.clientHeight);
      const maxLeft = Math.max(0, host.scrollWidth - host.clientWidth);
      a.top = clamp(a.top, 0, maxTop);
      a.left = clamp(a.left, 0, maxLeft);
      const dTop = a.top - host.scrollTop;
      const dLeft = a.left - host.scrollLeft;
      if (Math.abs(dTop) < 1 && Math.abs(dLeft) < 1) {
        host.scrollTop = a.top;
        host.scrollLeft = a.left;
        state.wheelAnim = null;
        return;
      }
      host.scrollTop += dTop * 0.35;
      host.scrollLeft += dLeft * 0.35;
      a.raf = requestAnimationFrame(step);
    };
    anim.raf = requestAnimationFrame(step);
  }
  anim.top += dy;
  anim.left += dx;
};

/**
 * 宿主本轴是否还能沿 delta 方向吃下这段位移（余量判据同 v-wheel-scroll 的 canScrollBy，留 1px 容差）。
 *
 * 判据存在的理由：overlay 是宿主的**兄弟**节点，真实事件的原生滚动链里根本没有宿主，
 * 那条链只会一路找到外层容器。故「宿主还能不能滚」必须由兜底自己判定，
 * 否则就会出现宿主与外层同时位移（在滚动条上滚 = 内外容器联动）。
 */
const canHostAbsorb = (state: ScrollbarState, axis: 'x' | 'y', delta: number): boolean => {
  const { host } = state;
  const cur = axis === 'y' ? host.scrollTop : host.scrollLeft;
  // 存在进行中的滚轮缓动时兼顾缓动目标：缓动是逐帧逼近的，回读值滞后于目标，
  // 只拿回读值判余量会在连滚末尾误判成「已到边界」、把最后几条事件让给外层。
  // 取 max/min 而非直接用目标：另一轴的缓动目标恒为创建时的快照（可能已过期），
  // 这样在本轴未被缓动时自动回落到实际位置，不会拿过期的快照判余量。
  const anim = state.wheelAnim;
  const animPos = anim ? (axis === 'y' ? anim.top : anim.left) : cur;
  const pos = delta > 0 ? Math.max(cur, animPos) : Math.min(cur, animPos);
  const max = axis === 'y' ? host.scrollHeight - host.clientHeight : host.scrollWidth - host.clientWidth;
  return (delta > 0 && pos < max - 1) || (delta < 0 && pos > 1);
};

/**
 * 宿主本轴是否被声明为「不把滚动链交给外层」（overscroll-behavior: contain / none）。
 *
 * 来源有二：v-wheel-scroll 的 applyOverscrollGuard 在宿主上内联写入的 contain，
 * 或宿主自带的 CSS（工具类 / 样式表）。读它是为了在「宿主已到边界」时复刻浏览器的裁决：
 * 在内容区上滚时 contain 的宿主触边也不会把位移漏给外层，在滚动条上滚必须同样如此，
 * 否则同一容器两个落点两种手感。
 */
const isHostOverscrollContained = (state: ScrollbarState, axis: 'x' | 'y'): boolean => {
  const style = getComputedStyle(state.host);
  const longhand = style.getPropertyValue(axis === 'y' ? 'overscroll-behavior-y' : 'overscroll-behavior-x').trim();
  if (longhand) return longhand === 'contain' || longhand === 'none';
  // 长手写法在部分环境取不到：回落读简写，按「先 x 后 y」的展开次序取本轴那一项
  const tokens = style.getPropertyValue('overscroll-behavior').trim().split(/\s+/);
  const value = (axis === 'y' ? (tokens[1] ?? tokens[0]) : tokens[0]) ?? '';
  return value === 'contain' || value === 'none';
};

/** overlay 的 wheel 转发：wheel 不会冒泡到宿主（兄弟节点），同参重派发到宿主元素由指令按策略消费；
 *  宿主侧**没有生效策略**时才由自身兜底驱动本轴（有策略而选择放行时不得二次驱动，见下）。 */
export const attachOverlayWheelForward = (state: ScrollbarState, axis: 'x' | 'y', el: HTMLElement): void => {
  // 三种归宿，按序判定：
  // ① 宿主侧消费（defaultPrevented）→ 把消费决定镜像回真实事件，抑制其默认滚动；
  // ② 宿主侧有生效策略但刻意放行（如 v-wheel-scroll 的 overscroll:'auto' 在边界处让位、
  //    或本轮已让位给外层）→ 结论就是「交给外层滚动链」，兜底不得再驱动本轴；
  // ③ 宿主侧无策略（未挂 v-wheel-scroll，或挂了但 disabled）→ 兜底接手驱动本轴，
  //    但**与原生滚动链二选一**：宿主本轴还能吃下位移就掐断原生链（否则宿主与外层同时位移，
  //    即「在滚动条上滚内外联动」）；宿主已到边界且是**新手势**时，才把这一轮交回原生链穿透到祖先
  //    （同一轮手势内由宿主独占，即单次滚动锁——与 v-wheel-scroll 的 edgeLock 同口径）。
  // 注意：真实事件不能在探测前无条件 preventDefault——② 需要让真实事件保留默认行为，
  // 浏览器才能对非受信合成事件无法执行的「原生滚动链」进行兜底（穿透到祖先滚动容器）。
  // ctrl/meta/alt 交还浏览器默认（缩放等组合键）；
  // 合成事件刻意 bubbles:false：只投递给宿主自身消费，不向上冒泡，
  // 避免宿主祖先上依赖 wheel 冒泡的委托（若存在）被这份转发事件二次处理。
  el.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const resent = new WheelEvent('wheel', {
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        deltaZ: e.deltaZ,
        deltaMode: e.deltaMode,
        shiftKey: e.shiftKey,
        bubbles: false,
        cancelable: true,
      });
      state.host.dispatchEvent(resent);
      if (resent.defaultPrevented) {
        // 宿主侧已消费：把消费决定镜像回真实事件，抑制其默认滚动
        e.preventDefault();
        return;
      }
      // 宿主侧没拦截，但可能正是「有策略、且策略选择放行」：让位给外层滚动是本轮结论，
      // 兜底不得再驱动本轴——否则宿主被兜底拖着动、外层同时也在滚（两者同时位移）。
      // 兜底只服务真的没人管的场景（宿主未挂 v-wheel-scroll，或挂了但 disabled）
      if (isWheelScrollSeen(resent)) return;
      // 宿主侧无策略：本轴由兜底代驱动（真实事件的原生滚动链到不了宿主——见下方裁决）。
      // deltaMode 归一化统一走 @/platform/utils/dom 的 toPixelDelta（与 v-wheel-scroll 同口径：
      // 行模式按真实行高、页模式按宿主该轴可视尺寸折算，不再用硬编码 40），
      // 滚动条所在轴决定驱动哪条轴：纵向滚动条→纵向、横向滚动条→横向（横向同时接纳鼠标滚轮与触控板横滑）。
      const raw = axis === 'y' ? e.deltaY : e.deltaX + e.deltaY;
      const fallbackDelta = toPixelDelta(e, raw, state.host, axis);
      // 滚动条所在轴决定驱动哪条轴：纵向滚动条→纵向、横向滚动条→横向，
      // 不再双向同时滚动（避免停在横向滚动条上时纵向内容被误带）。
      // 横向滚动条同时接纳鼠标滚轮（deltaY）与触控板横向滑动（deltaX），保证鼠标可用。
      //
      // ── 这一轮归谁：宿主独占 / 让给外层滚动链，必须二选一 ──
      // overlay 是宿主的兄弟节点，**宿主不在真实事件的祖先链上**：原生链从 overlay 出发一路向上
      // 只会找到外层容器，宿主这一轴压根不在链里（这正是兜底不得不存在的理由）。
      // 于是若不抑制默认行为，就会同时发生「兜底驱动宿主」+「原生链驱动外层」——
      // 表现为「在滚动条上滚，内外容器一起动」；而在内容区上滚时宿主是原生链的第一站、
      // 外层拿不到位移（锁是生效的），同一容器两个落点手感不一致。
      // 裁决口径对齐浏览器对宿主的原生裁决：本轴还能吃下这段位移 → 宿主独占（掐断原生链）；
      // 已到边界 → 交回原生链穿透到祖先；宿主若声明了 contain/none，则边界处也一并掐断。
      //
      // 边界处还多一道**单次滚动锁**（同 v-wheel-scroll 的 edgeLock，常量与判据共用）：
      // 同一轮连续手势内触边，继续由宿主独占（拦截但不再位移），只有「停手后重新开滚」的
      // 新手势才把位移交给外层——否则单次滚动尚未停手，外层就被同一批事件带着走了。
      // 让位之后本轮余下事件（含反向回滑）一律不回收，否则外层正滚着又被宿主抓回来。
      const now = performance.now();
      const lastAt = state.overlayWheelAt[axis];
      const continuing = lastAt !== null && now - lastAt < EDGE_LOCK_MS;
      state.overlayWheelAt[axis] = now;
      if (state.overlayWheelHandedOff[axis] && continuing) return;
      state.overlayWheelHandedOff[axis] = false;

      if (canHostAbsorb(state, axis, fallbackDelta)) {
        e.preventDefault();
        if (axis === 'y') wheelScroll(state, 0, fallbackDelta);
        else wheelScroll(state, fallbackDelta, 0);

        return;
      }

      // 宿主本轴已到边界：
      //  - 同一轮手势内 → 宿主继续独占（HOLD：拦截但不再位移），位移不漏给外层；
      //  - 新手势 → 让位：交回浏览器原生滚动链穿透到祖先，并登记本轮已让位；
      //  - 宿主声明了 contain/none → 连让位也不做，与在内容区上滚时浏览器对宿主的裁决一致。
      if (continuing || isHostOverscrollContained(state, axis)) {
        e.preventDefault();
        return;
      }
      state.overlayWheelHandedOff[axis] = true;
    },
    { passive: false }
  );
};
