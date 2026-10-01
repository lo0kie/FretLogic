/**
 * 浮动元件（BaseFab / BaseFloatingPill）共享的过渡事件转发：
 * 两者的 <Transition> 需要把 6 个过渡钩子逐一透传给调用方，事件签名与转发
 * 逻辑逐字相同，本模块为唯一来源。模板侧用 v-on="transitionEvents" 一次性
 * 绑定，与逐个 @hook 内联转发等价——事件名与元素载荷均不变。
 */

/** 过渡事件签名（<Transition> 六钩子的透传） */
export interface FloatingTransitionEmits {
  (e: 'before-enter', el: Element): void;
  (e: 'enter', el: Element): void;
  (e: 'after-enter', el: Element): void;
  (e: 'before-leave', el: Element): void;
  (e: 'leave', el: Element): void;
  (e: 'after-leave', el: Element): void;
}

/** 生成 <Transition> 的 v-on 绑定对象：逐钩子把元素参数原样转发给调用方 */
export function useTransitionEventRelay(emit: FloatingTransitionEmits) {
  return {
    onBeforeEnter: (el: Element) => emit('before-enter', el),
    onEnter: (el: Element) => emit('enter', el),
    onAfterEnter: (el: Element) => emit('after-enter', el),
    onBeforeLeave: (el: Element) => emit('before-leave', el),
    onLeave: (el: Element) => emit('leave', el),
    onAfterLeave: (el: Element) => emit('after-leave', el),
  };
}
