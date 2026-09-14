/**
 * v-wheel-scroll 指令：横向滚轮劫持滚动（触控板/鼠标滚轮自适应）。
 * 位移按真实滚动距离 1:1 映射：先按 WheelEvent.deltaMode 把滚轮增量换算为像素
 * （行/页单位乘容器行高、可视高度），再乘方向与倍率；不做单次位移上限钳制。
 * 支持速度倍率（含 .double 翻倍修饰符）、平滑惯性缓动、方向反转与边界穿透策略（contain/auto）。
 *
 * 重要：所有程序化写入一律经 setScrollLeft()，显式指定 behavior:'instant'。
 * 若容器带 CSS `scroll-behavior: smooth`（如本项目内 class="scroll-smooth" 的横滚条），
 * 普通 scrollLeft 赋值不会同步生效——回读仍是动画中的旧值，
 * 会造成「位移不按真实距离映射」且「倍率被动画吞掉看不出差别」。
 */
import type { Directive } from 'vue';

/**
 * 指令修饰符：smooth（平滑惯性）/ reverse（反向）/ prevent / stop / contain / auto（边界穿透策略）
 * / double（位移翻倍）/ disabled（静态禁用，动态禁用请用绑定值 { disabled }）。
 *
 * 字面量联合用于模板编辑器补全提示；末尾 `(string & Record<never, never>)` 保留宽松兼容——
 * Vue 传入的 modifiers 本质是任意字符串键，且该交叉类型带索引签名，
 * 可安全赋值给内部使用的 Record<string, boolean> 参数（与其他指令同一写法）。
 */
export type WheelScrollModifiers =
  | 'smooth'
  | 'reverse'
  | 'prevent'
  | 'stop'
  | 'contain'
  | 'auto'
  | 'double'
  | 'disabled'
  | (string & Record<never, never>);

export interface WheelScrollOptions {
  /** 滚动灵敏度/倍率，默认 1 */
  speed?: number;
  /** 是否启用平滑惯性滚动动画，默认 false（使用 .smooth 开启） */
  smooth?: boolean;
  /** 是否反转滚动方向 */
  reverse?: boolean;
  /** 是否禁用滚轮劫持 */
  disabled?: boolean;
  /** 是否阻止默认事件，默认 true */
  prevent?: boolean;
  /** 是否阻止事件冒泡，默认 false */
  stop?: boolean;
  /** 到达边界时的穿透策略：'contain' 始终拦截 | 'auto' 边界放行纵向滚动 */
  overscroll?: 'contain' | 'auto';
  /**
   * 滚动回调：progress 为当前横向滚动进度 0~1。
   * 注意：smooth 模式下缓动动画的每一帧都会触发本回调，其 e 始终是触发本轮滚动的那个原始 WheelEvent
   *（非逐帧事件），如果有逐帧计算需求请只依赖 progress，勿用 e.deltaX 等推断当前帧。
   */
  onScroll?: (e: WheelEvent, progress: number) => void;
  /** 贴边回调：内容横向滚到最左/最右时触发（与 wheel-scroll-edge 事件同源） */
  onEdge?: (edge: 'left' | 'right') => void;
}

export type WheelScrollBinding = number | boolean | WheelScrollOptions | undefined;

/** 归一化指令配置：绑定值支持速度倍率/开关/选项对象，修饰符叠加并补齐默认值。 */
const normalize = (value: WheelScrollBinding, modifiers?: Record<string, boolean>): WheelScrollOptions => {
  let opts: WheelScrollOptions = {};
  if (typeof value === 'number') {
    opts.speed = value;
  } else if (typeof value === 'boolean') {
    opts.disabled = !value;
  } else if (value && typeof value === 'object') {
    opts = { ...value };
  }

  if (modifiers) {
    if (modifiers['smooth'] !== undefined) opts.smooth = Boolean(modifiers['smooth']);
    if (modifiers['reverse'] !== undefined) opts.reverse = Boolean(modifiers['reverse']);
    if (modifiers['prevent'] !== undefined) opts.prevent = Boolean(modifiers['prevent']);
    if (modifiers['stop'] !== undefined) opts.stop = Boolean(modifiers['stop']);
    if (modifiers['contain']) opts.overscroll = 'contain';
    if (modifiers['auto']) opts.overscroll = 'auto';
    // 静态修饰符 .disabled（编译期固定，动态禁用请用绑定值 { disabled }）
    if (modifiers['disabled']) opts.disabled = true;
  }

  opts.speed = opts.speed ?? 1;
  // .double：滚动位移翻倍。叠加在最终倍率上（含绑定值 speed），
  // 故 speed=1.5 + .double 得 3；与 .smooth / .reverse 正交，可自由组合
  if (modifiers?.['double']) opts.speed = (opts.speed ?? 1) * 2;
  opts.prevent = opts.prevent ?? true;
  opts.overscroll = opts.overscroll ?? 'contain';
  return opts;
};

interface WheelScrollHandler {
  opts: WheelScrollOptions;
  onWheel: (e: WheelEvent) => void;
  onPointerDown: () => void;
}

interface SmoothScrollState {
  target: number;
  rafId: number | null;
}

const handlerMap = new WeakMap<HTMLElement, WheelScrollHandler>();
const smoothStateMap = new WeakMap<HTMLElement, SmoothScrollState>();

/** 行单位（deltaMode=1）换算的行高基准：line-height 为 normal/auto 取不到时，
 *  回退为「字号 × 1.2」，与浏览器默认行盒比例一致 */
const LINE_HEIGHT_FALLBACK_RATIO = 1.2;

/**
 * 把一次滚轮事件在主轴上应产生的位移换算为像素（即真实滚动距离）。
 *
 * WheelEvent.deltaMode 有三种单位：0=像素 / 1=行 / 2=页。只有像素单位可直接当距离用；
 * 行与页必须按容器实际行高、可视高度换算——否则 Firefox（默认行单位，一格约 3 行）
 * 的增量会被当成 3px 处理，横向位移与原生纵向滚动手感完全脱节。
 *
 * 主轴分量识别：触控板原生横滑优先取 deltaX，普通鼠标纵向滚轮取 deltaY。
 */
const resolveWheelDeltaPx = (e: WheelEvent, el: HTMLElement): number => {
  const raw = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY !== 0 ? e.deltaY : e.deltaX;
  if (raw === 0) return 0;

  if (e.deltaMode === 1) {
    const style = getComputedStyle(el);
    const lineHeight = parseFloat(style.lineHeight);
    const fallback = (parseFloat(style.fontSize) || 16) * LINE_HEIGHT_FALLBACK_RATIO;
    return raw * (Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : fallback);
  }
  if (e.deltaMode === 2) return raw * el.clientHeight;
  return raw;
};

/**
 * 提交横向滚动位置（指令内唯一写入出口）。
 *
 * 必须显式传 behavior:'instant'：'auto' 会继承容器的 CSS `scroll-behavior`，
 * 一旦容器带 scroll-smooth，赋值被浏览器转成动画，el.scrollLeft 不会同步更新。
 * 后果有二：① 连续滚轮事件的「累加位移」每轮都从动画中的滞后位置起算，位移与真实距离脱节；
 * ② 缓动循环帧内回读值与写入前相同，被误判为「已到边界无法位移」而立刻收尾，
 * smooth 模式退化成每个事件只挪一小步。'instant' 强制瞬时到位，绕开 CSS 动画，
 * 使「像素位移 × 倍率」成为确定结果（自带 rAF 缓动也才能正确插值）。
 */
const setScrollLeft = (el: HTMLElement, value: number) => {
  el.scrollTo({ left: value, behavior: 'instant' });
};

/** 取消元素上未完成的平滑滚动动画帧。 */
const cancelSmoothScroll = (el: HTMLElement) => {
  const state = smoothStateMap.get(el);
  if (state?.rafId !== null && state?.rafId !== undefined) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }
};

/**
 * 基于 requestAnimationFrame 的动量平滑缓动滚动
 * 每次滚轮事件累加目标位移，在每一帧通过 lerp 插值逼近目标位置，
 * 解决浏览器原生 smooth 在高频滚轮连续触发时被频繁打断和卡顿的问题。
 */
const performSmoothScroll = (el: HTMLElement, scrollAmount: number, maxScrollLeft: number, onProgress?: () => void) => {
  let state = smoothStateMap.get(el);
  if (!state) {
    state = { target: el.scrollLeft, rafId: null };
    smoothStateMap.set(el, state);
  } else if (state.rafId === null) {
    // 若上一轮缓动已彻底停止，scrollLeft 可能已被外部点击或拖动改变，需以当前 DOM 实际位置重置基准
    state.target = el.scrollLeft;
  }

  // 累加位移并限制在合法滚动区间
  state.target = Math.max(0, Math.min(maxScrollLeft, state.target + scrollAmount));

  if (state.rafId !== null) return;

  /** 单帧缓动循环：向目标位置 lerp 逼近，差值 ≤1px 或位移停滞时立即收尾停止。 */
  const animate = () => {
    if (!state) return;
    const current = el.scrollLeft;
    const diff = state.target - current;

    // 当差值小于等于 1px 时直接就位并结束 rAF，防止 DOM 整数像素截断导致差值停在 2~4px 陷入无限死循环
    if (Math.abs(diff) <= 1) {
      setScrollLeft(el, state.target);
      state.rafId = null;
      onProgress?.();
      return;
    }

    // 保证单帧步长在整数像素级别至少有 1px 变化，避免子像素被浏览器截断舍弃
    const rawStep = diff * 0.2;
    const step = Math.abs(rawStep) < 1 ? Math.sign(rawStep) : rawStep;
    setScrollLeft(el, current + step);

    // 若受边界约束未能产生任何位移，立即停止防止死循环
    if (el.scrollLeft === current) {
      state.rafId = null;
      onProgress?.();
      return;
    }

    onProgress?.();
    state.rafId = requestAnimationFrame(animate);
  };

  state.rafId = requestAnimationFrame(animate);
};

export const vWheelScroll: Directive<HTMLElement, WheelScrollBinding, WheelScrollModifiers> = {
  mounted(el, binding) {
    const opts = normalize(binding.value, binding.modifiers);

    const handler: WheelScrollHandler = {
      opts,
      onPointerDown: () => cancelSmoothScroll(el),
      onWheel: (e: WheelEvent) => {
        if (handler.opts.disabled) return;
        // 组合键放行：ctrl/meta/alt + 滚轮是浏览器缩放等原生手势，交还默认行为，不劫持、不 preventDefault
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        const maxScrollLeft = el.scrollWidth - el.clientWidth;
        if (maxScrollLeft <= 1) return;

        // 真实距离映射：deltaMode 归一化为像素后，再乘方向与倍率（.double / 绑定值 speed）。
        // 此处不做单次位移上限钳制——钳制会把大 delta 压成「可视宽度 60%」，
        // 使位移与真实滚动距离脱节，倍率（尤其 .double）也会被一并削平而看不出差别。
        const deltaPx = resolveWheelDeltaPx(e, el);
        if (deltaPx === 0) return;

        const multiplier = (handler.opts.reverse ? -1 : 1) * (handler.opts.speed ?? 1);
        const scrollAmount = deltaPx * multiplier;

        const canScrollMore =
          (scrollAmount > 0 && el.scrollLeft < maxScrollLeft - 1) || (scrollAmount < 0 && el.scrollLeft > 1);

        // 边界穿透策略 'auto'：已抵达横向边界时彻底让位——既不拦截也不再横向滚动，
        // 交由页面纵向滚动处理。否则会出现「横向到底 + 纵向同时滚动」的拉扯感（尤其触控板惯性滑动期间）
        if (handler.opts.overscroll === 'auto' && !canScrollMore) return;

        const shouldPrevent = handler.opts.prevent && (handler.opts.overscroll === 'contain' || canScrollMore);

        if (shouldPrevent) {
          e.preventDefault();
        }

        if (handler.opts.stop) {
          e.stopPropagation();
        }

        const notifyScroll = () => {
          const currentProgress = maxScrollLeft > 0 ? Math.min(1, Math.max(0, el.scrollLeft / maxScrollLeft)) : 0;

          if (handler.opts.onScroll) {
            handler.opts.onScroll(e, currentProgress);
          }

          el.dispatchEvent(
            new CustomEvent('wheel-scroll', {
              detail: { scrollLeft: el.scrollLeft, progress: currentProgress },
              bubbles: false,
            })
          );

          if (el.scrollLeft <= 0) {
            el.dispatchEvent(new CustomEvent('wheel-scroll-edge', { detail: { edge: 'left' }, bubbles: false }));
            handler.opts.onEdge?.('left');
          } else if (el.scrollLeft >= maxScrollLeft - 1) {
            el.dispatchEvent(new CustomEvent('wheel-scroll-edge', { detail: { edge: 'right' }, bubbles: false }));
            handler.opts.onEdge?.('right');
          }
        };

        if (handler.opts.smooth) {
          performSmoothScroll(el, scrollAmount, maxScrollLeft, notifyScroll);
        } else {
          cancelSmoothScroll(el);
          // 瞬时写入（见 setScrollLeft）：保证单次滚轮位移 = 真实像素距离 × 倍率
          setScrollLeft(el, el.scrollLeft + scrollAmount);
          notifyScroll();
        }
      },
    };

    handlerMap.set(el, handler);
    el.addEventListener('wheel', handler.onWheel, { passive: false });
    el.addEventListener('pointerdown', handler.onPointerDown, { passive: true });
  },
  updated(el, binding) {
    const handler = handlerMap.get(el);
    if (!handler) return;
    const next = normalize(binding.value, binding.modifiers);
    // 中途被禁用或退出平滑模式时掐断未完成的缓动，避免动画继续跑完产生幽灵滚动
    if (next.disabled || !next.smooth) cancelSmoothScroll(el);
    handler.opts = next;
  },
  unmounted(el) {
    cancelSmoothScroll(el);
    smoothStateMap.delete(el);
    const handler = handlerMap.get(el);
    if (handler) {
      el.removeEventListener('wheel', handler.onWheel);
      el.removeEventListener('pointerdown', handler.onPointerDown);
      handlerMap.delete(el);
    }
  },
};
