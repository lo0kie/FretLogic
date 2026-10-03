/**
 * v-as-button 指令：为任意「用 div 模拟按钮」的元素注入整套按钮 A11y 协议。
 *
 * 这类元素因 flex 排版 / 子元素交互限制无法使用原生 <button>，此前每个业务卡片都需手写拷贝
 * `role="button"`、`tabindex="0"`、Enter / Space 触发 click 并 `preventDefault` / `stopPropagation`。
 * 本指令将这些协议收敛为一处：
 * - 挂载时自动注入 `role="button"` 与 `tabindex="0"`（已有显式值则保留，避免覆盖业务自定义语义）；
 * - 在捕获阶段把 Enter / Space 键转为 `click` 派发（Space 同时阻止默认滚动），并阻止事件继续
 *   传播，避免重复触发或误触外层容器逻辑；
 * - 命中后依赖宿主自身的 `@click` 处理器完成业务动作，业务层无需再写任何键盘监听。
 *
 * 用法：<div v-as-button @click="handleClick" class="...">…</div>
 * 可选：<div v-as-button="{ disabled }" …>（disabled 为 true 时忽略按键转换）
 * 可选：<div v-as-button="{ active }" …>（active 为 false 时整套协议都不生效，见下）
 */
import { isObject } from '@/platform/utils/common';

import type { Directive, DirectiveBinding } from 'vue';

export interface AsButtonOptions {
  /** 禁用态：为 true 时忽略 Enter / Space 按键转换 */
  disabled?: boolean;
  /**
   * 是否启用整套协议，默认 true。为 false 时**既不注入** role / tabindex，也不接管按键。
   *
   * 与 `disabled` 是两件事：`disabled` 说的是「这是个按钮，但它现在不可用」（role 与 tabindex
   * 该留着，屏幕阅读器要能读出「不可用的按钮」）；`active: false` 说的是「它此刻根本不是一个按钮」
   * —— 那种状态下若无条件注入，纯展示元素会凭空多出一个 Tab 停靠点。
   * 供「只有部分状态才算按钮」的组件使用（BaseBadge 的 interactive / hoverClose 即此类：
   * 其余状态是纯展示徽标）。
   *
   * 运行时可翻转：`updated` 会跟着挂/摘按键监听，并**只撤自己写上去的** role / tabindex
   * （撤之前比对当前值是否仍等于自己写的那个，避免把调用方或 Vue 后来绑定的值一并抹掉）。
   */
  active?: boolean;
}

export type AsButtonBinding = boolean | AsButtonOptions | null | undefined;

const isDisabled = (value?: AsButtonBinding): boolean => {
  if (isObject(value)) return value.disabled === true;
  return false;
};

/** 是否启用整套协议：只有显式写 `active: false` 才算关（布尔 / 省略 / 其它形态都算开） */
const isActive = (value?: AsButtonBinding): boolean => !(isObject(value) && value.active === false);

/**
 * 元素 → 解析后的综合状态。**存在模块级 WeakMap 而非元素属性上**：往 HTMLElement 上挂
 * `__asButtonDisabled` 需要每处读写都断言出一个不存在的属性（旧写法 3 处 `as unknown as`），
 * 而 WeakMap 天然是「按元素存的私有状态」—— 键随元素回收，也不必在 unmounted 里手动清干净。
 * 同类先例见 vAutoWidth 的 stateMap。
 */
interface AsButtonState {
  disabled: boolean;
  active: boolean;
  /** 本指令自己写上去的 role / tabindex 值；撤用时只撤自己写的，不动调用方显式声明的 */
  ownRole: string | null;
  ownTabindex: string | null;
}

const stateMap = new WeakMap<HTMLElement, AsButtonState>();

/** 读取挂载/更新时解析好的综合禁用态（修饰符 disabled 或绑定对象 disabled 任一为真即禁用） */
const resolveDisabled = (el: HTMLElement): boolean => stateMap.get(el)?.disabled === true;

const KEYDOWN_HANDLER = 'data-as-button-handler';

/**
 * 捕获阶段按键转换：Enter / Space → click。
 * 只在捕获阶段监听可确保命中唯一的聚焦元素；preventDefault 阻止 Space 滚动，stopPropagation
 * 阻止事件继续冒泡到外层，避免业务 @click 被重复触发。
 */
const handleButtonKeydown = (e: KeyboardEvent) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  // 仅响应落在宿主自身上的按键：若未来宿主内嵌套了原生按钮/输入框等可聚焦子元素，
  // 子元素自身的 Enter / Space 语义不应被劫持为整个宿主的激活
  if (e.target !== e.currentTarget) return;
  const el = e.currentTarget as HTMLElement;
  if (resolveDisabled(el)) return;
  e.preventDefault();
  e.stopPropagation();
  el.click();
};

const attachKeydown = (el: HTMLElement) => {
  if (el.hasAttribute(KEYDOWN_HANDLER)) return;
  el.addEventListener('keydown', handleButtonKeydown, true);
  el.setAttribute(KEYDOWN_HANDLER, 'true');
};

const detachKeydown = (el: HTMLElement) => {
  if (!el.hasAttribute(KEYDOWN_HANDLER)) return;
  el.removeEventListener('keydown', handleButtonKeydown, true);
  el.removeAttribute(KEYDOWN_HANDLER);
};

/** 撤掉本指令注入的 role / tabindex（当前值已被别人改写就留着不动） */
const removeOwnA11y = (el: HTMLElement, state: AsButtonState) => {
  if (state.ownRole !== null && el.getAttribute('role') === state.ownRole) el.removeAttribute('role');
  if (state.ownTabindex !== null && el.getAttribute('tabindex') === state.ownTabindex) el.removeAttribute('tabindex');
  state.ownRole = null;
  state.ownTabindex = null;
};

/** 按当前状态同步 DOM 与监听：active 时补齐 A11y 协议，否则撤干净 */
const syncState = (el: HTMLElement, state: AsButtonState) => {
  if (!state.active) {
    detachKeydown(el);
    removeOwnA11y(el, state);
    return;
  }
  if (!el.getAttribute('role')) {
    el.setAttribute('role', 'button');
    state.ownRole = 'button';
  }
  if (!el.hasAttribute('tabindex')) {
    el.setAttribute('tabindex', '0');
    state.ownTabindex = '0';
  }
  // disabled 时补 aria-disabled：只忽略按键会让读屏用户以为它仍然可用
  if (state.disabled) el.setAttribute('aria-disabled', 'true');
  else if (el.getAttribute('aria-disabled') === 'true') el.removeAttribute('aria-disabled');
  attachKeydown(el);
};

/** 从 binding 解析状态（修饰符 .disabled 与绑定对象两处合并） */
const resolveState = (el: HTMLElement, binding: DirectiveBinding<AsButtonBinding>): AsButtonState => {
  const existing = stateMap.get(el);
  const state: AsButtonState = existing ?? { disabled: false, active: true, ownRole: null, ownTabindex: null };
  state.disabled = isDisabled(binding.value);
  state.active = isActive(binding.value);
  stateMap.set(el, state);
  return state;
};

export const vAsButton: Directive<HTMLElement, AsButtonBinding> = {
  mounted(el, binding) {
    syncState(el, resolveState(el, binding));
  },
  updated(el, binding) {
    syncState(el, resolveState(el, binding));
  },
  unmounted(el) {
    detachKeydown(el);
    // 必须连自己写入的 A11y 属性一起摘掉：元素被复用时残留的 role / tabindex 会让它
    // 看起来仍是按钮，却不再响应键盘
    const state = stateMap.get(el);
    if (state) removeOwnA11y(el, state);
    stateMap.delete(el);
  },
};
