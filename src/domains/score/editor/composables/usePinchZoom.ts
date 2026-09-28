import { tryOnScopeDispose, useEventListener } from '@vueuse/core';

import { clamp } from '@/platform/utils/common';

import type { Ref } from 'vue';

/**
 * 手势缩放（双指捏合 / 触控板捏合 / Ctrl+滚轮）：把「手势位移」换算成百分比读数交给调用方。
 *
 * 只做换算、不持有值 —— 现值与新值由调用方经 `getValue` / `setValue` 提供，故本函数不依赖
 * 任何 store，可用在任意需要手势缩放的面板上（排列和弦区是当前唯一调用方）。
 *
 * 三条路径汇成同一套换算：
 * - **触摸双指捏合**：两指落下即开启会话，按两指间距相对起点的比值缩放；
 * - **触控板捏合**：浏览器把它投递成带 `ctrlKey` 的 wheel，按 `deltaY` 换算（同预览区的做法）；
 * - **鼠标 Ctrl+滚轮**：与上一条同路。
 *
 * ⚠️ 触摸端还须由调用方在容器上声明 `touch-action: pan-x pan-y`：它禁掉**浏览器自己的**
 * 页面级捏合缩放，双指手势才轮到本函数处理。默认的 `auto` 下浏览器先接管这次手势、随后补发
 * `pointercancel`，我们这边只看到一次被取消的触摸 —— 此时再 `preventDefault` 已经晚了。
 * 保留 `pan-x pan-y` 而不是 `none`：单指滚动要照常可用，两者不冲突。
 *
 * ⚠️ 写入按帧合帧：手势事件一帧可能来好几发（滚轮尤甚），而每一笔写入都要宿主重渲染、浏览器
 * 重排重绘（容器级 `zoom` 的代价），逐发写等于把重排重绘也做成逐发。故只在帧末把**最新读数**
 * 写一次 —— 事件里的 `preventDefault` 仍是同步的，只有写入被推迟。
 */
export interface PinchZoomOptions {
  /** 百分比下限（%） */
  min: number;
  /** 百分比上限（%） */
  max: number;
  /** 读当前百分比：只在会话开启时读一次，作为本次会话的基准 */
  getValue: () => number;
  /** 写新百分比：手势进行中**至多每帧一次**（本函数已合帧），调用方负责持久化节流 */
  setValue: (value: number) => void;
  /** Ctrl+滚轮 / 触控板捏合的灵敏度（每像素 deltaY 对应的百分比变化） */
  wheelSensitivity: number;
  /** 开启捏合会话的最小两指间距(px)：间距趋零会让比值爆炸，且多半是误触 */
  minPinchSpan: number;
  /**
   * 捏合会话真正开始时（第二根手指落下）回调一次。
   *
   * 用于让调用方撤掉同一手势下**已经登记**的其它意图：两指落下时，第一根手指可能正压在某个
   * 可拖动元素上、已经起了长按计时，不撤掉就会在捏合途中起拖、松手时把它丢到别处。
   */
  onGestureStart?: () => void;
}

/** 两指间距(px)：取触摸列表前两个点，与哪根手指先落下无关 */
const touchSpan = (touches: TouchList): number =>
  Math.hypot(touches[0]!.clientX - touches[1]!.clientX, touches[0]!.clientY - touches[1]!.clientY);

/** 两个触摸点的 identifier（顺序无关的排序对）：用来识别「会话里的两指被换掉了」 */
const touchIds = (touches: TouchList): [number, number] => {
  const a = touches[0]!.identifier;
  const b = touches[1]!.identifier;
  return a <= b ? [a, b] : [b, a];
};

export function usePinchZoom(target: Ref<HTMLElement | null>, options: PinchZoomOptions): void {
  /**
   * 捏合会话状态。以「起点两指的 identifier」为会话标志（null 即无会话），而不是一个布尔量：
   * 触摸端的 `touchend` / `touchcancel` 并非总会到达（切走应用、浏览器接管手势都可能吞掉它），
   * 一个只会被这两个事件复位的布尔量一旦漏复位，就会**永久**把后续单指滚动也一起 preventDefault
   * —— 那种坏法（歌词再也滑不动）比手势本身失灵严重得多。带 identifier 后每次 touchmove 都能
   * 自己判定会话是否仍然有效。
   */
  let startIds: [number, number] | null = null;
  /** 会话基准：起点两指间距，以及当时的百分比 */
  let startSpan = 0;
  let startValue = 0;

  /**
   * 帧末写入用的待写读数（null = 本帧没有待写值）与 rAF 句柄。
   *
   * 只留**最新**一笔：手势是连续位移，同帧内的中间读数没有意义，末值即正确值。
   * 读取方一律走 currentValue —— 若改读 store，同帧内的第二发就会从**还没写进去**的旧值起算，
   * 多发的位移会被整段丢掉（捏合变慢、滚轮打滑）。
   */
  let pendingValue: number | null = null;
  let flushRafId: number | null = null;

  const flush = () => {
    flushRafId = null;
    if (pendingValue === null) return;
    const value = pendingValue;
    pendingValue = null;
    options.setValue(value);
  };

  const scheduleValue = (value: number) => {
    pendingValue = value;
    flushRafId ??= requestAnimationFrame(flush);
  };

  /** 当前读数：本帧已排队但还没写进去的那笔优先 —— 它比 store 里的值新 */
  const currentValue = () => pendingValue ?? options.getValue();

  const beginPinch = (touches: TouchList) => {
    startIds = touchIds(touches);
    startSpan = touchSpan(touches);
    startValue = currentValue();
  };

  useEventListener(
    target,
    'touchstart',
    (e: TouchEvent) => {
      // 只认「恰好两指」：多指（三指及以上）既不开启也不打断已有会话，避免手势中途换基准
      if (startIds !== null || e.touches.length !== 2) return;
      if (touchSpan(e.touches) < options.minPinchSpan) return;
      beginPinch(e.touches);
      options.onGestureStart?.();
      e.preventDefault();
    },
    { passive: false }
  );

  useEventListener(
    target,
    'touchmove',
    (e: TouchEvent) => {
      if (startIds === null) return;
      // 不足两指：会话结束，把剩下的手势交回浏览器（滚动照常）。也兜住漏掉的 touchend
      if (e.touches.length !== 2) {
        startIds = null;
        return;
      }
      const ids = touchIds(e.touches);
      // 两指被换掉（抬起一指又补上、或 touchend 被吞掉后重新落下）：以当前间距为新基准重开，
      // 否则会拿旧基准算出一个与手不符的比值（读数当场跳一下）
      if (ids[0] !== startIds[0] || ids[1] !== startIds[1]) {
        beginPinch(e.touches);
        e.preventDefault();
        return;
      }
      // 必须拦：不拦则浏览器把这次双指移动当成滚动接管（起滚后即派发 pointercancel）
      e.preventDefault();
      const factor = touchSpan(e.touches) / startSpan;
      scheduleValue(clamp(Math.round(startValue * factor), options.min, options.max));
    },
    { passive: false }
  );

  /** 会话结束：清掉起点标识，后续 touchmove 据此把剩下的手势交回浏览器 */
  const endPinch = () => {
    startIds = null;
  };

  useEventListener(target, 'touchend', endPinch);
  useEventListener(target, 'touchcancel', endPinch);

  useEventListener(
    target,
    'wheel',
    (e: WheelEvent) => {
      // 无修饰键的滚轮是滚动，不接；带 ctrl（触控板捏合在浏览器里就是它）或 meta 才是缩放意图
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      scheduleValue(clamp(currentValue() - e.deltaY * options.wheelSensitivity, options.min, options.max));
    },
    { passive: false }
  );

  /**
   * 作用域销毁前把最后一笔落定：pending 是唯一还没写进去的读数，丢掉就等于手势最后一小段白做
   *（滚轮尤其明显 —— 松手/切走时那一发往往还在排队）。
   */
  tryOnScopeDispose(() => {
    if (flushRafId !== null) cancelAnimationFrame(flushRafId);
    flush();
  });
}
