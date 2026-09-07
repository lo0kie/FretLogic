import {
  MARQUEE_DEFAULT_FADE_WIDTH,
  MARQUEE_FADE_TRANSITION_MS,
  MARQUEE_FAST_SPEED_MULTIPLIER,
  MARQUEE_MIN_DURATION_CONTINUOUS_MS,
  MARQUEE_MIN_DURATION_PINGPONG_MS,
  MARQUEE_RESET_DURATION_MS,
  MARQUEE_RESET_EASING,
} from '@/platform/utils/constants';

import type { Directive } from 'vue';

export interface MarqueeOptions {
  /** 触发模式：hover 悬停/聚焦时滚动，always 常驻轮播，none 永不滚动 */
  mode?: 'hover' | 'always' | 'none';
  /** 循环模式：pingpong 来回摆动 | continuous 单向首尾无缝循环 */
  loopMode?: 'pingpong' | 'continuous';
  /** 连续无缝循环时的首尾间距（单位 px） */
  gap?: number;
  /** 滚动速度，单位 px/秒（与 duration 二选一，优先级低于 duration） */
  speed?: number;
  /** 单程滚动时长，单位毫秒（设置后忽略 speed） */
  duration?: number;
  /** 首次开始前的延迟，单位毫秒 */
  delay?: number;
  /** 滚动方向 */
  direction?: 'left' | 'right';
  /** 是否在两端短暂停顿（仅在 pingpong 模式下生效） */
  pauseOnEdges?: boolean;
  /** 单次滚动结束、反向前的停留时长，单位毫秒（仅在 pauseOnEdges 时生效） */
  pauseDuration?: number;
  /** 是否在两端添加羽化渐变遮罩，可指定渐变宽度（px） */
  fade?: boolean | number;
  /** 生命周期回调 */
  onStart?: () => void;
  onEnd?: () => void;
  onOverflowChange?: (overflowing: boolean) => void;
}

export type MarqueeBinding = MarqueeOptions | undefined;

export type MarqueeModifiers =
  | 'hover'
  | 'always'
  | 'none'
  | 'left'
  | 'right'
  | 'no-pause'
  | 'fast'
  | 'continuous'
  | 'pingpong'
  | 'fade'
  | (string & Record<never, never>);

const DEFAULTS: Required<Omit<MarqueeOptions, 'onStart' | 'onEnd' | 'onOverflowChange'>> &
  Pick<MarqueeOptions, 'onStart' | 'onEnd' | 'onOverflowChange'> = {
  mode: 'hover',
  loopMode: 'pingpong',
  gap: 24,
  speed: 50,
  duration: undefined as unknown as number,
  delay: 0,
  direction: 'left',
  pauseOnEdges: true,
  pauseDuration: 1000,
  fade: false,
  onStart: undefined,
  onEnd: undefined,
  onOverflowChange: undefined,
};

interface MarqueeState {
  el: HTMLElement;
  inner: HTMLSpanElement;
  options: typeof DEFAULTS;
  overflowing: boolean;
  hovered: boolean;
  focused: boolean;
  reducedMotion: boolean;
  wasActive: boolean;
  sig: string | null;
  animation: Animation | null;
  /** 停用后的平滑复位动画（进行中时阻止重复触发与循环重启） */
  resetAnim: Animation | null;
  /** 动画激活期间的逐帧遮罩同步循环（rAF id，0 表示未运行） */
  maskRaf: number;
  /** 遮罩状态签名（羽化量 "start|end" 或 null=未启用）：相同则跳过重复样式写入 */
  lastFade: string | null;
  observer: ResizeObserver;
  mql: MediaQueryList;
  cleanups: (() => void)[];
}

const STATES = new WeakMap<HTMLElement, MarqueeState>();

/** 合并绑定值与修饰符得到完整配置：修饰符（hover/always/left/fade 等）优先级高于绑定值。 */
function resolveOptions(binding: MarqueeBinding, modifiers?: Record<string, boolean>): typeof DEFAULTS {
  const base: MarqueeOptions = binding && typeof binding === 'object' ? { ...binding } : {};

  if (modifiers) {
    if (modifiers['hover']) base.mode = 'hover';
    if (modifiers['always']) base.mode = 'always';
    if (modifiers['none']) base.mode = 'none';
    if (modifiers['left']) base.direction = 'left';
    if (modifiers['right']) base.direction = 'right';
    if (modifiers['no-pause']) base.pauseOnEdges = false;
    if (modifiers['fast']) base.speed = DEFAULTS.speed * MARQUEE_FAST_SPEED_MULTIPLIER;
    if (modifiers['continuous']) base.loopMode = 'continuous';
    if (modifiers['pingpong']) base.loopMode = 'pingpong';
    if (modifiers['fade']) base.fade = true;
  }

  return { ...DEFAULTS, ...base };
}

/** 在宿主元素上派发不冒泡的 CustomEvent，并同步调用绑定值里的回调。 */
function emit<T = unknown>(el: HTMLElement, name: string, detail?: T, cb?: (value: T) => void): void {
  el.dispatchEvent(new CustomEvent(name, { detail, bubbles: false }));
  cb?.(detail as T);
}

/** 判定当前是否应处于滚动状态：always 常滚，hover 模式需悬停或聚焦，none 永不滚动。 */
function shouldAnimate(state: MarqueeState): boolean {
  if (state.options.mode === 'none') return false;
  if (state.options.mode === 'always') return true;
  return state.hovered || state.focused;
}

/**
 * 按配置在两端应用羽化渐变遮罩；未开启或未溢出时清除遮罩。
 * 遮罩方向跟随滚动位置，语义与 useScrollEdgeFades 一致——边缘贴住内容时不加渐隐：
 * - 动画进行中：由 maskLoop 按动画相位逐帧计算（起点/终点贴边侧不渐隐）；
 * - 静止复位态：direction 'left' 停在起点（左缘贴内容）→ 仅右端渐隐；
 *   direction 'right' 停在终点（右缘贴内容）→ 仅左端渐隐。
 *
 * 渐隐量由两个注册自定义属性（@property <number>）驱动渐变端点透明度，
 * 注册属性可参与 CSS transition——贴边/离开贴边时羽化以 MARQUEE_FADE_TRANSITION_MS 平滑过渡，
 * 而非整段 mask-image 字符串瞬变（渐变图片本身不可插值）。
 */
function applyFadeMask(el: HTMLElement, state: MarqueeState): void {
  const { fade, direction } = state.options;
  if (!fade || !state.overflowing) {
    // 未启用羽化或内容未溢出：彻底清除遮罩与羽化量（溢出消失时同步回收）
    if (state.lastFade !== null) {
      state.lastFade = null;
      el.style.maskImage = '';
      el.style.webkitMaskImage = '';
      el.style.removeProperty('--marquee-fade-start');
      el.style.removeProperty('--marquee-fade-end');
      el.style.transition = '';
    }
    return;
  }
  ensureFadeTransitionStyle();
  if (state.lastFade === null) {
    // 首次启用：铺常驻遮罩模板（端点透明度由自定义属性控制，全程黑 = 无羽化效果）
    const fadeWidth = typeof fade === 'number' ? fade : MARQUEE_DEFAULT_FADE_WIDTH;
    const mask = FADE_MASK_TEMPLATE(fadeWidth);
    el.style.maskImage = mask;
    el.style.webkitMaskImage = mask;
    el.style.transition = `--marquee-fade-start ${MARQUEE_FADE_TRANSITION_MS}ms ease, --marquee-fade-end ${MARQUEE_FADE_TRANSITION_MS}ms ease`;
  }
  const active = state.overflowing && !state.reducedMotion && shouldAnimate(state);
  let start: number;
  let end: number;
  if (!active) {
    // 静止复位态：贴内容一侧不渐隐
    start = direction === 'left' ? 0 : 1;
    end = direction === 'left' ? 1 : 0;
  } else {
    // 动画中：双端渐隐兜底，逐帧循环会按相位精确覆盖
    start = 1;
    end = 1;
  }
  setFade(state, start, end);
}

/** 遮罩模板：两端点透明度分别由 --marquee-fade-start/end（0=不渐隐，1=全羽化）驱动 */
const FADE_MASK_TEMPLATE = (w: number) =>
  `linear-gradient(to right, rgb(0 0 0 / calc(1 - var(--marquee-fade-start))), rgb(0 0 0) ${w}px, rgb(0 0 0) calc(100% - ${w}px), rgb(0 0 0 / calc(1 - var(--marquee-fade-end))))`;

/** 写入两端羽化量（0~1），与上次相同则跳过重复写入 */
function setFade(state: MarqueeState, start: number, end: number): void {
  const sig = `${start}|${end}`;
  if (state.lastFade === sig) return;
  state.lastFade = sig;
  state.el.style.setProperty('--marquee-fade-start', String(start));
  state.el.style.setProperty('--marquee-fade-end', String(end));
}

/** 一次性注入 @property 注册规则（注册后的自定义属性才能参与 transition） */
function ensureFadeTransitionStyle(): void {
  if (typeof document === 'undefined' || document.getElementById('v-marquee-fade-props')) return;
  const style = document.createElement('style');
  style.id = 'v-marquee-fade-props';
  style.textContent =
    `@property --marquee-fade-start{syntax:'<number>';inherits:false;initial-value:0;}` +
    `@property --marquee-fade-end{syntax:'<number>';inherits:false;initial-value:0;}`;
  document.head.appendChild(style);
}

/** 贴边判定容差（px）：内容与边缘间距小于该值视为贴边，不渐隐 */
const FLUSH_EPS_PX = 1;

/**
 * 由动画当前时间计算内容位移偏移（0 = 起点贴边，dist = 终点贴边）。
 * pingpong：第一段由静止位滚向远端 → 远端停顿 → 返回 → 静止位停顿；
 * continuous：单向循环，offset 在 [0, travelDist) 内循环。
 */
function sampleOffset(state: MarqueeState, dist: number): number {
  const anim = state.animation;
  if (!anim) return state.options.direction === 'left' ? 0 : dist;
  const { direction, gap } = state.options;
  const t = Number(anim.currentTime ?? 0);
  if (state.options.loopMode === 'continuous') {
    const travel = inner_scrollWidth(state) + gap;
    const moveMs = anim.effect?.getTiming().duration;
    const dur = typeof moveMs === 'number' ? moveMs : 0;
    if (dur <= 0) return 0;
    const frac = (t % dur) / dur;
    return direction === 'left' ? travel * frac : travel * (1 - frac);
  }
  // pingpong：与 update() 的时间轴分段一致
  const speed = state.options.speed;
  const duration = state.options.duration;
  const moveMs = duration != null ? duration : Math.max(MARQUEE_MIN_DURATION_PINGPONG_MS, (dist / speed) * 1000);
  const pauseMs = state.options.pauseOnEdges ? Math.max(0, state.options.pauseDuration) : 0;
  const total = 2 * moveMs + 2 * pauseMs;
  const phase = total > 0 ? t % total : 0;
  let fracToFar: number;
  if (phase < moveMs) fracToFar = phase / moveMs;
  else if (phase < moveMs + pauseMs) fracToFar = 1;
  else if (phase < 2 * moveMs + pauseMs) fracToFar = 1 - (phase - moveMs - pauseMs) / moveMs;
  else fracToFar = 0;
  // 'left'：静止位 offset=0 → 远端 dist；'right'：静止位 offset=dist → 远端 0
  return direction === 'left' ? dist * fracToFar : dist * (1 - fracToFar);
}

/** 读取 inner 内容宽度（隔离采样函数内的 DOM 访问） */
function inner_scrollWidth(state: MarqueeState): number {
  return state.inner.scrollWidth;
}

/** 动画激活期间逐帧同步遮罩：起点贴边 → 仅右端羽化；终点贴边 → 仅左端羽化；区间内 → 双端 */
function startMaskLoop(state: MarqueeState, dist: number): void {
  if (state.maskRaf !== 0) return;
  const step = (): void => {
    state.maskRaf = 0;
    if (!state.animation) return;
    const offset = sampleOffset(state, dist);
    if (offset <= FLUSH_EPS_PX) {
      setFade(state, 0, 1); // 起点贴边：左缘不渐隐
    } else if (offset >= dist - FLUSH_EPS_PX) {
      setFade(state, 1, 0); // 终点贴边：右缘不渐隐
    } else {
      setFade(state, 1, 1);
    }
    state.maskRaf = requestAnimationFrame(step);
  };
  state.maskRaf = requestAnimationFrame(step);
}

/** 停止逐帧遮罩循环 */
function stopMaskLoop(state: MarqueeState): void {
  if (state.maskRaf !== 0) {
    cancelAnimationFrame(state.maskRaf);
    state.maskRaf = 0;
  }
}

/** 测量内容是否溢出（宽度差 > 1px），溢出状态变化时派发事件，并联动遮罩与动画刷新。 */
function measure(el: HTMLElement): void {
  const state = STATES.get(el);
  if (!state) return;
  const { inner, options } = state;

  const dist = Math.max(0, inner.scrollWidth - el.clientWidth);
  const overflowing = dist > 1;

  if (overflowing !== state.overflowing) {
    state.overflowing = overflowing;
    emit(el, 'marquee-overflow-change', overflowing, options.onOverflowChange);
  }

  applyFadeMask(el, state);
  update(el);
}

/** 核心：根据溢出/激活状态启停 Web Animations；continuous 与 pingpong 各自构造关键帧，签名未变时复用动画。 */
function update(el: HTMLElement): void {
  const state = STATES.get(el);
  if (!state) return;
  const { inner, options, overflowing } = state;

  const active = overflowing && !state.reducedMotion && shouldAnimate(state);

  // 激活/静止切换时同步遮罩方向（激活=双端，静止=贴内容侧不渐隐）
  applyFadeMask(el, state);

  if (!active) {
    stopMaskLoop(state);
    state.sig = null;
    if (state.animation) {
      // 先取样当前滚动位置，cancel 后元素会瞬间回落到 inline 静止位
      const current = getComputedStyle(inner).transform;
      state.animation.cancel();
      state.animation = null;
      if (!state.reducedMotion && current !== 'none') {
        // 从当前位置平滑滚回起始位，避免移出瞬间的硬切
        const restTransform =
          options.direction === 'right'
            ? `translateX(-${Math.max(0, inner.scrollWidth - el.clientWidth)}px)`
            : 'translateX(0px)';
        const reset = inner.animate([{ transform: current }, { transform: restTransform }], {
          duration: MARQUEE_RESET_DURATION_MS,
          easing: MARQUEE_RESET_EASING,
        });
        reset.onfinish = () => {
          // 期间可能已被再次激活并取消，仅当仍是本次复位动画时才落定静止位
          if (state.resetAnim === reset) {
            state.resetAnim = null;
            inner.style.transform = restTransform;
          }
        };
        state.resetAnim = reset;
        inner.style.animation = '';
        // 提前return前补发 end 事件，保持生命周期回调语义与直落路径一致
        if (state.wasActive) emit(el, 'marquee-end', undefined, options.onEnd);
        state.wasActive = false;
        return;
      }
    }
    if (state.resetAnim) return; // 复位动画进行中，让其自然结束
    inner.style.animation = '';
    inner.style.transform =
      options.direction === 'right'
        ? `translateX(-${Math.max(0, inner.scrollWidth - el.clientWidth)}px)`
        : 'translateX(0px)';
  } else {
    // 重新激活：立即结束尚未完成的复位动画并落定到静止位，循环从头开始
    if (state.resetAnim) {
      state.resetAnim.cancel();
      state.resetAnim = null;
      inner.style.transform =
        options.direction === 'right'
          ? `translateX(-${Math.max(0, inner.scrollWidth - el.clientWidth)}px)`
          : 'translateX(0px)';
    }
    const dist = inner.scrollWidth - el.clientWidth;
    const isContinuous = options.loopMode === 'continuous';
    // 逐帧遮罩同步所需的全程位移：continuous 为内容宽+gap，pingpong 为溢出距离
    let maskDist = dist;

    if (isContinuous) {
      const travelDist = inner.scrollWidth + options.gap;
      maskDist = travelDist;
      const moveMs =
        options.duration != null
          ? options.duration
          : Math.max(MARQUEE_MIN_DURATION_CONTINUOUS_MS, (travelDist / options.speed) * 1000);
      const frames =
        options.direction === 'right'
          ? [
              { offset: 0, transform: `translateX(-${travelDist}px)` },
              { offset: 1, transform: 'translateX(0px)' },
            ]
          : [
              { offset: 0, transform: 'translateX(0px)' },
              { offset: 1, transform: `translateX(-${travelDist}px)` },
            ];

      const sig = `continuous|${travelDist}|${moveMs}|${options.direction}`;
      if (state.sig !== sig) {
        if (state.animation) state.animation.cancel();
        state.animation = inner.animate(frames, {
          duration: moveMs,
          iterations: Infinity,
          easing: 'linear',
          delay: Math.max(0, options.delay),
        });
        state.sig = sig;
      }
    } else {
      // Ping-pong 往返摆动模式
      const moveMs =
        options.duration != null
          ? options.duration
          : Math.max(MARQUEE_MIN_DURATION_PINGPONG_MS, (dist / options.speed) * 1000);
      const pauseMs = options.pauseOnEdges ? Math.max(0, options.pauseDuration) : 0;
      const total = 2 * moveMs + 2 * pauseMs;
      const moveFrac = moveMs / total;
      const pauseFrac = pauseMs / total;

      const frames =
        options.direction === 'right'
          ? [
              { offset: 0, transform: `translateX(-${dist}px)` },
              { offset: moveFrac, transform: 'translateX(0px)' },
              { offset: moveFrac + pauseFrac, transform: 'translateX(0px)' },
              { offset: 2 * moveFrac + pauseFrac, transform: `translateX(-${dist}px)` },
              { offset: 1, transform: `translateX(-${dist}px)` },
            ]
          : [
              { offset: 0, transform: 'translateX(0px)' },
              { offset: moveFrac, transform: `translateX(-${dist}px)` },
              { offset: moveFrac + pauseFrac, transform: `translateX(-${dist}px)` },
              { offset: 2 * moveFrac + pauseFrac, transform: 'translateX(0px)' },
              { offset: 1, transform: 'translateX(0px)' },
            ];

      const sig = `pingpong|${dist}|${moveMs}|${pauseMs}|${options.direction}`;
      if (state.sig !== sig) {
        if (state.animation) state.animation.cancel();
        state.animation = inner.animate(frames, {
          duration: total,
          iterations: Infinity,
          easing: 'linear',
          delay: Math.max(0, options.delay),
        });
        state.sig = sig;
      }
    }

    // 动画激活期间逐帧同步遮罩：起点/终点贴边的一侧不渐隐
    startMaskLoop(state, maskDist);
  }

  if (active && !state.wasActive) emit(el, 'marquee-start', undefined, options.onStart);
  if (!active && state.wasActive) emit(el, 'marquee-end', undefined, options.onEnd);
  state.wasActive = active;
}

export const vMarquee: Directive<HTMLElement, MarqueeBinding, MarqueeModifiers> = {
  mounted(el, binding) {
    const options = resolveOptions(binding.value, binding.modifiers);

    el.classList.add('marquee-viewport');

    const inner = document.createElement('span');
    inner.className = 'marquee-inner';
    // 将插槽内容收集进 inner
    while (el.firstChild) inner.appendChild(el.firstChild);
    el.appendChild(inner);

    const state: MarqueeState = {
      el,
      inner,
      options,
      overflowing: false,
      hovered: false,
      focused: false,
      reducedMotion: false,
      wasActive: false,
      sig: null,
      animation: null,
      resetAnim: null,
      maskRaf: 0,
      lastFade: null,
      observer: undefined as unknown as ResizeObserver,
      mql: undefined as unknown as MediaQueryList,
      cleanups: [],
    };
    STATES.set(el, state);

    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    state.mql = mql;
    const onMql = () => {
      state.reducedMotion = mql.matches;
      update(el);
    };
    mql.addEventListener('change', onMql);
    state.reducedMotion = mql.matches;

    const onEnter = () => {
      state.hovered = true;
      update(el);
    };
    const onLeave = () => {
      state.hovered = false;
      update(el);
    };
    const onFocusIn = () => {
      state.focused = true;
      update(el);
    };
    const onFocusOut = () => {
      state.focused = false;
      update(el);
    };
    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mouseleave', onLeave);
    el.addEventListener('focusin', onFocusIn);
    el.addEventListener('focusout', onFocusOut);

    // 重点：同时监听容器 el 与内部内容 inner，确保内部文本变化时也能立即触发测量
    const observer = new ResizeObserver(() => measure(el));
    observer.observe(el);
    observer.observe(inner);
    state.observer = observer;

    state.cleanups.push(() => {
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mouseleave', onLeave);
      el.removeEventListener('focusin', onFocusIn);
      el.removeEventListener('focusout', onFocusOut);
      mql.removeEventListener('change', onMql);
      observer.disconnect();
      stopMaskLoop(state);
      state.animation?.cancel();
      state.resetAnim?.cancel();
    });

    measure(el);
  },

  updated(el, binding) {
    const state = STATES.get(el);
    if (!state) return;

    // 1. 同步最新的 binding 配置与修饰符
    state.options = resolveOptions(binding.value, binding.modifiers);

    // 2. 将 Vue 动态更新到 el 下的新子节点平滑收拢进 inner
    Array.from(el.childNodes).forEach(node => {
      if (node !== state.inner) state.inner.appendChild(node);
    });

    measure(el);
  },

  unmounted(el) {
    const state = STATES.get(el);
    if (!state) return;
    state.cleanups.forEach(fn => fn());
    STATES.delete(el);
  },
};
