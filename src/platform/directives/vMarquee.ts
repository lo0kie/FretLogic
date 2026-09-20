import {
  MARQUEE_DEFAULT_FADE_WIDTH,
  MARQUEE_FADE_TRANSITION_MS,
  MARQUEE_FAST_SPEED_MULTIPLIER,
  MARQUEE_MIN_DURATION_CONTINUOUS_MS,
  MARQUEE_MIN_DURATION_PINGPONG_MS,
  MARQUEE_RESET_DURATION_MS,
  MARQUEE_RESET_EASING,
} from '@/platform/utils/constants';
import { buildEdgeFadeMask, ensureFadeProperties, fadeTransition } from '@/platform/utils/fadeMask';

import type { Directive } from 'vue';

import './vMarquee.scss';

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
  /** 是否只滚动一次：溢出时播放单个循环后停在终帧，不再无限循环（默认 false）。配合 mode:'always' 常用于一次性提示（如 toast） */
  once?: boolean;
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
  | 'once'
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
  once: false,
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
  /** 单次播放（once）是否已播完：播完后停在终帧、不再重启 */
  playedOnce: boolean;
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
    if (modifiers['once']) base.once = true;
  }

  return { ...DEFAULTS, ...base };
}

/**
 * 配置是否与上次等价（逐字段比较，含回调引用）。
 *
 * 不能按对象引用比：宿主模板里写 `v-marquee="{ mode: 'always' }"` 时每次渲染都会产生新字面量，
 * 引用比较恒为「已变化」，守卫等于没加。逐字段比才能让「配置没动」的常规更新走快路径。
 */
const OPTION_KEYS = Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[];
const isSameOptions = (a: typeof DEFAULTS, b: typeof DEFAULTS): boolean => OPTION_KEYS.every(key => a[key] === b[key]);

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
 * 遮罩方向跟随滚动位置，语义与 vEdgeFade 一致——边缘贴住内容时不加渐隐：
 * - 动画进行中：由 maskLoop 按动画相位逐帧计算（起点/终点贴边侧不渐隐）；
 * - 静止复位态：direction 'left' 停在起点（左缘贴内容）→ 仅右端渐隐；
 *   direction 'right' 停在终点（右缘贴内容）→ 仅左端渐隐。
 *
 * 渐隐量由两个注册自定义属性（@property <number>，--fade-start/--fade-end，注册规则见
 * platform/utils/fadeMask.ts）驱动渐变端点透明度，注册属性可参与 CSS transition——
 * 贴边/离开贴边时羽化以 MARQUEE_FADE_TRANSITION_MS 平滑过渡，
 * 而非整段 mask-image 字符串瞬变（渐变图片本身不可插值）。
 */
function applyFadeMask(el: HTMLElement, state: MarqueeState): void {
  const { fade, direction } = state.options;
  if (!fade || !state.overflowing) {
    // 未启用羽化或内容未溢出：彻底清除遮罩与羽化量（溢出消失时同步回收）
    if (state.lastFade !== null) {
      state.lastFade = null;
      el.style.maskImage = '';
      el.style.setProperty('-webkit-mask-image', '');
      el.style.removeProperty('--fade-start');
      el.style.removeProperty('--fade-end');
      el.style.transition = '';
    }
    return;
  }
  ensureFadeProperties();
  if (state.lastFade === null) {
    // 首次启用：铺常驻遮罩模板（端点透明度由自定义属性控制，全程黑 = 无羽化效果）
    const fadeWidth = typeof fade === 'number' ? fade : MARQUEE_DEFAULT_FADE_WIDTH;
    const mask = buildEdgeFadeMask('x', fadeWidth);
    el.style.maskImage = mask;
    el.style.setProperty('-webkit-mask-image', mask);
    el.style.transition = fadeTransition(MARQUEE_FADE_TRANSITION_MS);
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

/** 写入两端羽化量（0~1）到共享注册属性，与上次相同则跳过重复写入 */
function setFade(state: MarqueeState, start: number, end: number): void {
  const sig = `${start}|${end}`;
  if (state.lastFade === sig) return;
  state.lastFade = sig;
  state.el.style.setProperty('--fade-start', String(start));
  state.el.style.setProperty('--fade-end', String(end));
}

/** 贴边判定容差（px）：内容与边缘间距小于该值视为贴边，不渐隐 */
const FLUSH_EPS_PX = 1;

/**
 * 由动画当前时间计算内容位移偏移（0 = 起点贴边，dist = 终点贴边）。
 * pingpong：第一段由静止位滚向远端 → 远端停顿 → 返回 → 静止位停顿；
 * continuous：单向循环，offset 在 [0, travel) 内循环。
 *
 * `dist` / `travel` 均由调用方预先算好传入，**本函数不读任何布局属性**：它唯一的调用者是逐帧
 * 遮罩循环，若在这里读 inner.scrollWidth，就等于每帧强制一次样式/布局重算；而这两个量在一次
 * 动画期间是不变的（transform 不改变 scrollWidth，内容变化另由 ResizeObserver 触发 update 重算）。
 */
function sampleOffset(state: MarqueeState, dist: number, travel: number): number {
  const anim = state.animation;
  if (!anim) return state.options.direction === 'left' ? 0 : dist;
  const { direction } = state.options;
  const t = Number(anim.currentTime ?? 0);
  if (state.options.loopMode === 'continuous') {
    const moveMs = anim.effect?.getTiming().duration;
    const dur = typeof moveMs === 'number' ? moveMs : 0;
    if (dur <= 0) return 0;
    const frac = (t % dur) / dur;
    return direction === 'left' ? travel * frac : travel * (1 - frac);
  }
  // pingpong：与 update() 的时间轴分段一致
  const speed = state.options.speed;
  const duration = state.options.duration;
  // duration 下限取 1ms（与 startPingpong 同口径）：否则 duration:0 时 total=0、相位除零得出 NaN
  const moveMs =
    duration != null ? Math.max(1, duration) : Math.max(MARQUEE_MIN_DURATION_PINGPONG_MS, (dist / speed) * 1000);
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

/**
 * 动画激活期间逐帧同步遮罩：起点贴边 → 仅右端羽化；终点贴边 → 仅左端羽化；区间内 → 双端。
 *
 * `dist` / `travel` 由 update 一次算好传入（那里本就要读布局），循环内只做纯计算 + 写 CSS
 * 自定义属性，不读任何布局属性——这是本循环能稳稳跑在每帧预算内的前提。
 */
function startMaskLoop(state: MarqueeState, dist: number, travel: number): void {
  if (state.maskRaf !== 0) return;
  const step = (): void => {
    state.maskRaf = 0;
    if (!state.animation) return;
    const offset = sampleOffset(state, dist, travel);
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

/** 静止位 transform：向右滚动的内容静止在「尾部可见」位，否则归零 */
function restTransform(el: HTMLElement, state: MarqueeState): string {
  const { inner, options } = state;
  return options.direction === 'right'
    ? `translateX(-${Math.max(0, inner.scrollWidth - el.clientWidth)}px)`
    : 'translateX(0px)';
}

/** 停止滚动：取消进行中的循环动画，从当前位置平滑滚回静止位（避免移出瞬间硬切）。 */
function deactivateMarquee(el: HTMLElement, state: MarqueeState): void {
  const { inner, options } = state;
  stopMaskLoop(state);
  state.sig = null;
  if (state.animation) {
    // 先取样当前滚动位置，cancel 后元素会瞬间回落到 inline 静止位
    const current = getComputedStyle(inner).transform;
    state.animation.cancel();
    state.animation = null;
    if (!state.reducedMotion && current !== 'none') {
      // 从当前位置平滑滚回起始位，避免移出瞬间的硬切
      const target = restTransform(el, state);
      const reset = inner.animate([{ transform: current }, { transform: target }], {
        duration: MARQUEE_RESET_DURATION_MS,
        easing: MARQUEE_RESET_EASING,
      });
      reset.onfinish = () => {
        // 期间可能已被再次激活并取消，仅当仍是本次复位动画时才落定静止位
        if (state.resetAnim === reset) {
          state.resetAnim = null;
          inner.style.transform = target;
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
  inner.style.transform = restTransform(el, state);
}

/** 单次播放（once）结束回调：标记已播放、停逐帧遮罩、派发 end。终帧由 fill:'forwards' 保持，不重置不重启。 */
function attachOnceFinish(state: MarqueeState, el: HTMLElement): void {
  const anim = state.animation;
  if (!anim) return;
  anim.onfinish = () => {
    // 期间若被新动画取代（once 关闭后重新进入），以 state.animation 为准，忽略本次回调
    if (state.animation !== anim) return;
    state.playedOnce = true;
    stopMaskLoop(state);
    emit(el, 'marquee-end', undefined, state.options.onEnd);
    state.wasActive = false;
  };
}

/** continuous 无缝循环模式：全程位移 = 内容宽 + gap，线性匀速。once 时只播一轮并停在终帧。 */
function startContinuous(_el: HTMLElement, state: MarqueeState): void {
  const { inner, options } = state;
  const travelDist = inner.scrollWidth + options.gap;
  const moveMs =
    options.duration != null
      ? Math.max(1, options.duration) // duration:0 → 0 时长动画，下限取 1ms
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

  const sig = `continuous|${travelDist}|${moveMs}|${options.direction}|${options.once ? 1 : 0}`;
  if (state.sig !== sig) {
    if (state.animation) state.animation.cancel();
    state.animation = inner.animate(frames, {
      duration: moveMs,
      iterations: options.once ? 1 : Infinity,
      easing: 'linear',
      delay: Math.max(0, options.delay),
      fill: options.once ? 'forwards' : 'none',
    });
    if (options.once) attachOnceFinish(state, _el);
    state.sig = sig;
  }
}

/** ping-pong 往返摆动模式：去-停-回-停 四段关键帧，边缘可停留。 */
function startPingpong(el: HTMLElement, state: MarqueeState): void {
  const { inner, options } = state;
  const dist = inner.scrollWidth - el.clientWidth;
  const moveMs =
    options.duration != null
      ? Math.max(1, options.duration) // duration:0 → total=0 → moveFrac=0/0=NaN 关键帧，下限取 1ms
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

  const sig = `pingpong|${dist}|${moveMs}|${pauseMs}|${options.direction}|${options.once ? 1 : 0}`;
  if (state.sig !== sig) {
    if (state.animation) state.animation.cancel();
    state.animation = inner.animate(frames, {
      duration: total,
      iterations: options.once ? 1 : Infinity,
      easing: 'linear',
      delay: Math.max(0, options.delay),
      fill: options.once ? 'forwards' : 'none',
    });
    if (options.once) attachOnceFinish(state, el);
    state.sig = sig;
  }
}

/** 核心：根据溢出/激活状态启停 Web Animations；continuous 与 pingpong 各自构造关键帧，签名未变时复用动画。 */
function update(el: HTMLElement): void {
  const state = STATES.get(el);
  if (!state) return;
  const { inner, options, overflowing } = state;

  const active = overflowing && !state.reducedMotion && shouldAnimate(state);

  // once 关闭后允许重新进入播放（复位单次标记，使后续可再次播一轮）
  if (!options.once) state.playedOnce = false;

  // 单次播放模式：首轮播完后停在终帧，不再重启、不重置（避免归位跳变）。
  // 内容不再溢出时退化为常规静态，正常回到静止位。
  if (options.once && state.playedOnce) {
    if (!overflowing) {
      deactivateMarquee(el, state);
    } else {
      stopMaskLoop(state);
      // 静态羽化跟随静止位：贴内容一侧不渐隐
      setFade(state, options.direction === 'left' ? 0 : 1, options.direction === 'left' ? 1 : 0);
      state.wasActive = false;
    }
    return;
  }

  // 激活/静止切换时同步遮罩方向（激活=双端，静止=贴内容侧不渐隐）
  applyFadeMask(el, state);

  if (!active) {
    deactivateMarquee(el, state);
  } else {
    // 重新激活：立即结束尚未完成的复位动画并落定到静止位，循环从头开始
    if (state.resetAnim) {
      state.resetAnim.cancel();
      state.resetAnim = null;
      inner.style.transform = restTransform(el, state);
    }
    // 逐帧遮罩同步所需的两个位移量在此一次算好：本函数是事件驱动的同步路径，本来就要读布局，
    // 让遮罩循环逐帧复用这两个数即可（循环内不再碰布局属性）。
    // continuous：全程位移 = 内容宽 + gap；pingpong：位移 = 溢出距离
    const contentWidth = inner.scrollWidth;
    const travelDist = contentWidth + options.gap;
    let maskDist = contentWidth - el.clientWidth;

    if (options.loopMode === 'continuous') {
      maskDist = travelDist;
      startContinuous(el, state);
    } else {
      startPingpong(el, state);
    }

    // 动画激活期间逐帧同步遮罩：起点/终点贴边的一侧不渐隐
    startMaskLoop(state, maskDist, travelDist);
  }

  if (active && !state.wasActive) emit(el, 'marquee-start', undefined, options.onStart);
  if (!active && state.wasActive) emit(el, 'marquee-end', undefined, options.onEnd);
  state.wasActive = active;
}

/* ---- 共享的「外部变化」监听 ----
   本指令挂在**列表的每一项**上（乐谱卡标题、和弦卡标题、分组标题…），整库渲染就是数百个实例。
   原先每元素各建一个 ResizeObserver、各注册一个 matchMedia 监听 —— 它们之间没有任何隔离需求，
   却让挂载/卸载成本随列表长度线性增长（过滤时数百个元素同时卸载，等于同时 disconnect 数百个
   观察者）。收敛为模块级单例 + 注册表后，实例数从「每元素一个」降为「全局一个」，
   语义完全不变：仍然是「el 或 inner 尺寸变化 → measure(el)」，尺寸与文本变化依旧不会漏帧。 */
const RO_OWNERS = new Map<Element, HTMLElement>();
let sharedObserver: ResizeObserver | null = null;

/** 共享测量观察者（惰性创建：模块求值期未必存在 ResizeObserver） */
const getSharedObserver = (): ResizeObserver =>
  (sharedObserver ??= new ResizeObserver(entries => {
    for (const entry of entries) {
      const owner = RO_OWNERS.get(entry.target);
      if (owner) measure(owner);
    }
  }));

/** 已登记、需要在系统「减弱动态效果」偏好变化时回落重算的状态集合 */
const MQL_STATES = new Set<MarqueeState>();
let reducedMotionMql: MediaQueryList | null = null;

/** 共享的 prefers-reduced-motion 监听（惰性创建：模块求值期未必存在 window.matchMedia） */
const getReducedMotionMql = (): MediaQueryList => {
  if (reducedMotionMql) return reducedMotionMql;
  const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  mql.addEventListener('change', () => {
    for (const state of MQL_STATES) {
      state.reducedMotion = mql.matches;
      update(state.el);
    }
  });
  reducedMotionMql = mql;
  return mql;
};

export const vMarquee: Directive<HTMLElement, MarqueeBinding, MarqueeModifiers> = {
  mounted(el, binding) {
    const options = resolveOptions(binding.value, binding.modifiers);

    el.classList.add('marquee-viewport');
    // 文字不换行由指令负责注入：跑马灯的测量（scrollWidth 对比 clientWidth）以单行内容为前提，
    // 宿主不必手动补 whitespace-nowrap
    el.style.whiteSpace = 'nowrap';

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
      playedOnce: false,
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

    const mql = getReducedMotionMql();
    state.mql = mql;
    // 变更监听由模块级共享监听统一驱动（见 getReducedMotionMql），这里只把自身登记进集合
    MQL_STATES.add(state);
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

    // 重点：同时监听容器 el 与内部内容 inner，确保内部文本变化时也能立即触发测量。
    // 观察者取模块级共享实例（各元素之间无隔离需求），实例数不随列表长度增长
    const observer = getSharedObserver();
    RO_OWNERS.set(el, el);
    RO_OWNERS.set(inner, el);
    observer.observe(el);
    observer.observe(inner);
    state.observer = observer;

    state.cleanups.push(() => {
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mouseleave', onLeave);
      el.removeEventListener('focusin', onFocusIn);
      el.removeEventListener('focusout', onFocusOut);
      MQL_STATES.delete(state);
      // 共享观察者不能 disconnect：只摘掉本元素自己的两个观测目标
      observer.unobserve(el);
      observer.unobserve(inner);
      RO_OWNERS.delete(el);
      RO_OWNERS.delete(inner);
      stopMaskLoop(state);
      state.animation?.cancel();
      state.resetAnim?.cancel();
    });

    // 首次测量延到帧末：本指令挂在**列表的每一项**上（和弦卡标题、乐谱卡标题…），展开一个
    // 大分组时一帧内会有几十个新元素 mounted。同步测量是在「刚插入 DOM、布局已失效」的当口
    // 逐个读 inner.scrollWidth / el.clientWidth —— 每读一次就是一次全量重排，几十项就是几十次
    // （典型 layout thrashing），开合大分组时那点轻微延迟主要来自这里。
    // 延到 rAF 后，同帧挂载的条目在同一批回调里测量：第一次读算完布局，后续读都落在干净布局上
    // （measure 写入的是 mask 端点 / transform / animation，都不使布局失效），一帧只重排一次。
    // 实际首测通常由共享 ResizeObserver 的初始回调先完成——它本就发生在布局之后，同样安全
    const firstMeasureRaf = requestAnimationFrame(() => measure(el));
    state.cleanups.push(() => cancelAnimationFrame(firstMeasureRaf));
  },

  updated(el, binding) {
    const state = STATES.get(el);
    if (!state) return;

    // 1. 同步最新的 binding 配置与修饰符
    const nextOptions = resolveOptions(binding.value, binding.modifiers);
    const optionsChanged = !isSameOptions(state.options, nextOptions);
    state.options = nextOptions;

    // 2. 将 Vue 动态更新到 el 下的新子节点平滑收拢进 inner。
    //    常态下 el 只有 inner 一个子节点（挂载时已把原内容搬进 inner，之后 Vue patch 的是 inner
    //    里的那些节点），故先判后搬，省下每次更新的 childNodes 遍历与数组分配
    const hasStrayChildren = el.firstChild !== state.inner || el.childNodes.length !== 1;
    if (hasStrayChildren) {
      Array.from(el.childNodes).forEach(node => {
        if (node !== state.inner) state.inner.appendChild(node);
      });
    }

    // 3. 只在配置或子树结构真的变了才重测。
    //    measure 会读 inner.scrollWidth / el.clientWidth —— 两者都是「写后必重排」的强制同步布局，
    //    而本指令挂在**列表的每一项**上（侧栏乐谱卡标题、和弦卡标题、分组标题…）。无条件重测会把
    //    「一次列表更新」放大成 N 次强制布局：侧栏过滤/排序时数百张卡片同时 updated，每次读都因
    //    上一项刚被 patch 而布局失效，于是逐项触发全量重排 —— 那阵掉帧主要来自这里。
    //    纯尺寸 / 文本变化由 mounted 注册的 ResizeObserver 覆盖（它同时观察 el 与 inner，回调在
    //    layout 之后、paint 之前触发，不会漏帧），这里无需重复兜底。
    if (optionsChanged || hasStrayChildren) measure(el);
  },

  unmounted(el) {
    const state = STATES.get(el);
    if (!state) return;
    state.cleanups.forEach(fn => fn());
    STATES.delete(el);
  },
};
