/**
 * v-draw 指令：把 SVG 线条**描边画出**（anime.js 的 `svg.createDrawable`），用于元件出场。
 *
 * 【为什么用 JS 动画库】`createDrawable` 先把每条线的长度量成 `stroke-dasharray` + `dashoffset`，
 * 再逐帧推 offset。CSS 那条路要求**长度已知且固定**，而这里的线长由几何与品数派生（换和弦、改品数、
 * 改缩放都会变），等于得把同一套「量长度 → 写 dash → 推 offset」手写一遍。描边本身仍是属性动画，
 * 开销集中在出场那一瞬。
 *
 * ⚠️ 收口必须**摘掉内联的 dash 属性**：`createDrawable` 把量出来的长度写死在元素上，而本项目的
 * 指板线会随品数 / 缩放改长度 —— 留着旧 dasharray，线会被裁成半截。这不是「样式没清干净」，
 * 是功能性回归，故 `onComplete` 里逐个摘（属性与内联样式两条路都摘，anime 写在哪条上都覆盖）。
 *
 * 【契约】
 * - `selector`：要描边的元素（相对宿主查询）；省略即宿主自身。查不到元素则什么都不做。
 * - `gap`：相邻线条的错峰（ms），0 = 同时画。
 * - `once`：给一个**名字**，同一会话内同名只播一次（切走再切回不重播）。省略则每次挂载都播。
 * - 减弱动效（prefers-reduced-motion）下**不播过程**：dash 属性根本没写上去，线本来就是完整的。
 *
 * 用法：<div v-draw="{ selector: '.fretboard-string-line', gap: 40, once: 'workbench' }">…</div>
 */
import { animate, createDrawable, stagger } from 'animejs';

import { isNumber, isObject, isString } from '@/platform/utils/common';
import { EASE_STANDARD } from '@/platform/utils/constants';
import { compileEasing, prefersReducedMotion } from '@/platform/utils/motion';

import type { JSAnimation } from 'animejs';
import type { Directive, DirectiveBinding } from 'vue';

export interface DrawOptions {
  /** 要描边的元素（相对宿主的选择器），省略即宿主自身 */
  selector?: string;
  /** 整段时长（ms），默认 520 */
  duration?: number;
  /** 相邻线条之间的错峰（ms），默认 0（同时画） */
  gap?: number;
  /** 会话内唯一的名字：给了就只播一次 */
  once?: string;
}

export type DrawBinding = boolean | DrawOptions | null | undefined;

/** 整段时长（ms）：出场描边要看得见，但不能拖住后续交互 */
const DRAW_DURATION_MS = 520;

/** 默认曲线（与其余动画指令同源：曲线定义只有 constants.ts 一处） */
const DRAW_EASE = compileEasing(EASE_STANDARD) ?? 'linear';

/** 已播过的 `once` 名字（会话级）：指令宿主每次挂载都是新节点，只能按名字记 */
const playedOnce = new Set<string>();

/** 归一化后的配置 */
interface DrawSettings {
  selector: string;
  duration: number;
  gap: number;
  once: string;
}

const resolveSettings = (value: DrawBinding): DrawSettings => {
  const opts = isObject(value) ? value : null;
  return {
    selector: opts && isString(opts.selector) ? opts.selector : '',
    duration:
      opts && isNumber(opts.duration) && Number.isFinite(opts.duration) && opts.duration > 0
        ? opts.duration
        : DRAW_DURATION_MS,
    gap: opts && isNumber(opts.gap) && Number.isFinite(opts.gap) && opts.gap > 0 ? opts.gap : 0,
    once: opts && isString(opts.once) ? opts.once : '',
  };
};

/** 摘掉 createDrawable 写上去的 dash（属性与内联样式都摘，见文件头那条警告） */
const clearDash = (el: Element): void => {
  el.removeAttribute('stroke-dasharray');
  el.removeAttribute('stroke-dashoffset');
  const styled = el as SVGElement;
  styled.style.removeProperty('stroke-dasharray');
  styled.style.removeProperty('stroke-dashoffset');
};

/**
 * 在途描边动画（按宿主记）：卸载时要取消它并摘掉 dash。
 *
 * 为什么要记：`animate()` 的句柄此前被直接丢弃，于是元素卸载后补间仍逐帧往**已脱离文档的子树**
 * 写 `stroke-dashoffset`，`onComplete` 的「收口」也落在死节点上。真正的代价不是白算几帧，
 * 而是宿主被复用 / 重挂载时旧 dash 残留 —— 线被裁成半截（见文件头那条警告）。
 */
const activeAnims = new WeakMap<HTMLElement, { anim: JSAnimation; targets: Element[] }>();

const playDraw = (el: HTMLElement, settings: DrawSettings): void => {
  const targets = settings.selector ? Array.from(el.querySelectorAll(settings.selector)) : [el];
  if (targets.length === 0) return;

  // 减弱动效：不播过程。dash 属性压根没写上去，线保持完整 —— 没有「静态替身」这回事，
  // 描边过程本身就是运动
  if (prefersReducedMotion()) return;

  const drawables = createDrawable(targets);
  const anim = animate(drawables, {
    draw: ['0 0', '0 1'],
    duration: settings.duration,
    delay: stagger(settings.gap),
    ease: DRAW_EASE,
    onComplete: () => {
      targets.forEach(clearDash);
      activeAnims.delete(el);
    },
  });
  activeAnims.set(el, { anim, targets });
};

export const vDraw: Directive<HTMLElement, DrawBinding> = {
  mounted(el: HTMLElement, binding: DirectiveBinding<DrawBinding>) {
    const settings = resolveSettings(binding.value);
    if (settings.once) {
      if (playedOnce.has(settings.once)) return;
      playedOnce.add(settings.once);
    }
    playDraw(el, settings);
  },

  unmounted(el: HTMLElement) {
    // 取消在途补间并**就地收口**：dash 是 createDrawable 按当时线长写死的，元素离开文档后
    // 没人会再摘它，宿主一旦被复用就是「线被裁半截」的功能性回归
    const active = activeAnims.get(el);
    if (!active) return;
    active.anim.cancel();
    active.targets.forEach(clearDash);
    activeAnims.delete(el);
  },
};
