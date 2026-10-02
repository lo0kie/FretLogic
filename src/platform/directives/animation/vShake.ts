/**
 * v-shake 指令：**被拒绝的交互**抖一下 —— UI 交互反馈里唯一还空着的一格。
 *
 * 【它补的是哪一格】这个项目里的交互动画已经有：悬停（CSS `hover:*`）、按压（`active:scale-*`）、
 * 点击涟漪（`v-wave`）、进出场（`transitions.scss`）。缺的是「操作不成立」时的即时反馈 ——
 * 现在只有全局提示（toast），而提示离被拒的那个控件很远，用户还得自己回头找是哪一处。
 * 本指令把反馈落到**控件本身**：抖一下，视线不用移动。
 *
 * 【为什么用 JS 动画库而不是 CSS keyframes】抖动的形态是**衰减振荡**（幅度逐次减半、必然收在
 * 原位），且必须满足三件事：① 可重复触发 —— 连点被拒的动作要重起，不是排队等上一段走完；
 * ② 可打断 —— 中途换令牌就从当前状态收干净再重起，不能留下半截偏移；③ 收口必须精确回到宿主
 * 原有的内联 transform。这三件事用 CSS 类名切换要做「摘类 → 强制重排 → 挂类」那套把戏，且
 * 卸载时没人替你还原；交给 anime.js 只需 cancel + 一次 onComplete。
 *
 * 【触发契约】绑定值是**令牌**：值每变一次抖一次，值本身无意义（计数器 / 时间戳 / 字符串都行）。
 * 调用方在「操作被拒」的那一刻把令牌换掉即可 —— 不需要复位、不需要守卫、不需要清标志。
 * 挂载**不抖**（进页面不是一次被拒）；令牌非法（null / undefined / NaN / 空串）一律忽略。
 *
 * 用法：
 *   <div v-shake="rejectTick" />                                  // 裸令牌：默认幅度与时长
 *   <div v-shake="{ token: rejectTick, amplitude: 4 }" />          // 小控件收窄幅度
 *   <div v-shake="{ token: `${name}:${rejectCount}` }" />          // 字符串令牌亦可
 *
 * 写入面：只动 `el.style.transform`，起抖前保存宿主原有的内联 transform、收口与卸载时还原。
 * 刻意写 `transform` 而不是 `translate` —— 后者是 Tailwind `translate-x-*` / `hover:-translate-y-px`
 * 用的属性，写它会顶掉宿主已有的位移；`transform` 与那些独立属性（`translate` / `scale` / `rotate`）
 * 是相加的，故宿主自带 `active:scale-95` 之类不受影响。
 * 唯一的代价：宿主若用**内联** `transform` 做别的事（静态旋转等），抖动那 400ms 内会被顶掉。
 *
 * 备注：减弱动效（prefers-reduced-motion）下**不抖** —— 抖动本身就是运动，没有等效的静态替身；
 * 反馈不该因此消失，故这类调用点必须同时给出文字提示（toast / 表单 help / `aria-invalid`），
 * 本指令只负责那一下视觉确认。
 */
import { animate } from 'animejs';

import { isNumber, isObject, isString } from '@/platform/utils/common';
import { EASE_STANDARD } from '@/platform/utils/constants';
import { compileEasing, prefersReducedMotion } from '@/platform/utils/motion';

import type { JSAnimation } from 'animejs';
import type { Directive, DirectiveBinding } from 'vue';

export interface ShakeOptions {
  /** 触发令牌：值每变一次抖一次（必填） */
  token: number | string;
  /** 首段偏移幅度（px），默认 6。后续各段按 0.66 / 0.33 递减 */
  amplitude?: number;
  /** 整段时长（ms），默认 400。非正数 / 非有限数一律回落默认档 */
  duration?: number;
}

export type ShakeBinding = number | string | ShakeOptions | null | undefined;

/** 整段时长（ms）：一次「被拒」的确认要快，超过半秒就从反馈变成等待 */
const SHAKE_DURATION_MS = 400;
/** 首段幅度（px）：足以让视线捕捉到，又不会把相邻元素带得晃 */
const SHAKE_AMPLITUDE_PX = 6;

/** 默认曲线（与其余动画指令同源：曲线定义只有 constants.ts 一处，这里只做「字符串 → 函数」的编译） */
const SHAKE_EASE = compileEasing(EASE_STANDARD) ?? 'linear';

/**
 * 衰减振荡的关键帧：左右各三段、幅度 1 → 0.66 → 0.33 → 0，必然收在原位。
 * 段数刻意是偶数且首尾为 0：奇偶不对称会让收口前的最后一段偏在一侧，观感像「没回正」。
 */
const buildKeyframes = (amplitude: number): number[] => [
  0,
  -amplitude,
  amplitude,
  -amplitude * 0.66,
  amplitude * 0.66,
  -amplitude * 0.33,
  amplitude * 0.33,
  0,
];

/** 归一化后的配置 */
interface ShakeSettings {
  amplitude: number;
  duration: number;
}

/**
 * 元素 → 状态。**存在模块级 WeakMap 而非元素属性上**（同类先例见 vAutoWidth 的 stateMap）：
 * 键随元素回收，不必在 unmounted 里手动清干净。
 *
 * `savedTransform` 以 `null` 作「当前没有在途抖动」的哨兵：宿主原本就没有内联 transform 时
 * 存的是空串，空串是合法值，不能拿它当哨兵。
 */
interface ShakeState {
  /** 最近一次看到的令牌：用来滤掉「Vue 每次重渲染都走到 updated」的空转抖动 */
  token: number | string | null;
  settings: ShakeSettings;
  anim: JSAnimation | null;
  /** 起抖前的内联 transform（收口 / 打断 / 卸载时还原） */
  savedTransform: string | null;
}

const stateMap = new WeakMap<HTMLElement, ShakeState>();

/** 取令牌：非法（null / undefined / NaN / 非有限数 / 空串）返回 null，调用方按「忽略本次」处理 */
const resolveToken = (value: ShakeBinding): number | string | null => {
  const raw = isObject(value) ? value.token : value;
  if (isString(raw) && raw !== '') return raw;
  if (isNumber(raw) && Number.isFinite(raw)) return raw;
  return null;
};

/** 归一化绑定值为一份配置（裸令牌走默认档） */
const resolveSettings = (value: ShakeBinding): ShakeSettings => {
  const opts = isObject(value) ? value : null;
  const amplitude =
    opts && isNumber(opts.amplitude) && Number.isFinite(opts.amplitude) && opts.amplitude > 0
      ? opts.amplitude
      : SHAKE_AMPLITUDE_PX;
  const duration =
    opts && isNumber(opts.duration) && Number.isFinite(opts.duration) && opts.duration > 0
      ? opts.duration
      : SHAKE_DURATION_MS;
  return { amplitude, duration };
};

/** 停掉在途抖动并还原宿主原有的内联 transform（`cancel` 只停表，不负责回位） */
const stopShake = (el: HTMLElement, state: ShakeState): void => {
  state.anim?.cancel();
  state.anim = null;
  if (state.savedTransform !== null) {
    el.style.transform = state.savedTransform;
    state.savedTransform = null;
  }
};

/** 抖一次：先收干净上一段（打断时也不留半截偏移），再从 0 起 */
const runShake = (el: HTMLElement, state: ShakeState, settings: ShakeSettings): void => {
  stopShake(el, state);

  // 减弱动效：不抖。没有等效的静态替身，反馈由调用方的文字提示承担
  if (prefersReducedMotion()) return;

  const offset = { x: 0 };
  state.savedTransform = el.style.transform;

  state.anim = animate(offset, {
    x: buildKeyframes(settings.amplitude),
    duration: settings.duration,
    ease: SHAKE_EASE,
    onUpdate: () => {
      el.style.transform = `translateX(${offset.x}px)`;
    },
    onComplete: () => {
      // 末帧理论上是 0，但仍按保存值还原 —— 宿主原本的 transform 是空串还是别的值，只有它知道
      state.anim = null;
      el.style.transform = state.savedTransform ?? '';
      state.savedTransform = null;
    },
  });
};

export const vShake: Directive<HTMLElement, ShakeBinding> = {
  mounted(el: HTMLElement, binding: DirectiveBinding<ShakeBinding>) {
    stateMap.set(el, {
      token: resolveToken(binding.value),
      settings: resolveSettings(binding.value),
      anim: null,
      savedTransform: null,
    });
  },

  updated(el: HTMLElement, binding: DirectiveBinding<ShakeBinding>) {
    const state = stateMap.get(el);
    if (!state) return;

    state.settings = resolveSettings(binding.value);

    const token = resolveToken(binding.value);
    // 令牌非法：忽略本次，也不改记录（否则「合法 → 非法 → 同一个合法值」会白抖一次）
    if (token === null) return;
    // 同令牌：Vue 每次重渲染都会走到这里，无事可做
    if (token === state.token) return;
    state.token = token;

    runShake(el, state, state.settings);
  },

  unmounted(el: HTMLElement) {
    const state = stateMap.get(el);
    if (state) stopShake(el, state);
    stateMap.delete(el);
  },
};
