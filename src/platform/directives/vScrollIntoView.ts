import { nextTick } from 'vue';

import type { Directive, DirectiveBinding } from 'vue';

/**
 * v-scroll-into-view 指令：元素激活或挂载时自动平滑/即时滚入视口。
 * 支持布尔值、配置对象（{ active, direction, block, inline, behavior, delay, once }）
 * 与修饰符（.x/.horizontal, .y/.vertical, .center, .nearest, .smooth, .immediate, .once/.mountOnly）。
 * 适用于多指法卡片、乐谱卡片、和弦分组卡片等列表项激活时的自动居中/视口定位。
 */

export type ScrollIntoViewModifiers =
  | 'x'
  | 'y'
  | 'horizontal'
  | 'vertical'
  | 'center'
  | 'nearest'
  | 'start'
  | 'end'
  | 'smooth'
  | 'immediate'
  | 'once'
  | 'mountOnly'
  | 'keepAlive'
  | (string & Record<never, never>);

export interface ScrollIntoViewOptions {
  /** 是否激活滚动，默认 true */
  active?: boolean;
  /** 限制滚动方向：'x' 仅横向 | 'y' 仅纵向 | 'both' 双向（默认） */
  direction?: 'x' | 'y' | 'both';
  /** 垂直对齐方式，默认 'nearest' */
  block?: ScrollLogicalPosition;
  /** 水平对齐方式，默认 'nearest' */
  inline?: ScrollLogicalPosition;
  /** 滚动动画模式：挂载时默认 'auto'，更新时默认 'smooth' */
  behavior?: ScrollBehavior;
  /** 是否仅在初次挂载时触发，后续激活态更新不重复触发 */
  once?: boolean;
  /** 是否在宿主组件被 KeepAlive 缓存后重新激活时再次滚动（需显式 .keep-alive 修饰符开启） */
  keepAlive?: boolean;
  /** 延迟触发时间（毫秒），如需等待折叠过渡动画完成时使用 */
  delay?: number;
}

export type ScrollIntoViewBinding = boolean | ScrollIntoViewOptions | null | undefined;

const isActive = (val: ScrollIntoViewBinding): boolean => {
  if (typeof val === 'boolean') return val;
  if (val && typeof val === 'object') return val.active !== false;
  return false;
};

const getScrollContainer = (el: HTMLElement, direction: 'x' | 'y'): HTMLElement | null => {
  let parent = el.parentElement;
  while (parent && parent !== document.body && parent !== document.documentElement) {
    const style = window.getComputedStyle(parent);
    const overflow = direction === 'x' ? style.overflowX : style.overflowY;
    if (overflow === 'auto' || overflow === 'scroll') {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
};

const normalizeOptions = (
  bindingValue: ScrollIntoViewBinding,
  modifiers?: Record<string, boolean>
): ScrollIntoViewOptions => {
  let opts: ScrollIntoViewOptions = {};
  if (typeof bindingValue === 'boolean') {
    opts.active = bindingValue;
  } else if (bindingValue && typeof bindingValue === 'object') {
    opts = { ...bindingValue };
  } else {
    opts.active = false;
  }

  if (modifiers) {
    if (modifiers['x'] || modifiers['horizontal']) {
      opts.direction = 'x';
    } else if (modifiers['y'] || modifiers['vertical']) {
      opts.direction = 'y';
    }

    if (modifiers['once'] || modifiers['mountOnly'] || modifiers['mount_only']) {
      opts.once = true;
    }

    // KeepAlive 缓存激活后再次滚动需显式 .keep-alive 修饰符开启，不作默认行为。
    // 注意 Vue 的 binding.modifiers 保留修饰符字面键（.keep-alive → 'keep-alive'，不 camelize）
    if (modifiers['keep-alive'] || modifiers['keepAlive'] || modifiers['keep_alive']) {
      opts.keepAlive = true;
    }

    if (modifiers['center']) {
      if (opts.direction === 'x') {
        opts.inline = 'center';
        opts.block = 'nearest';
      } else if (opts.direction === 'y') {
        opts.block = 'center';
        opts.inline = 'nearest';
      } else {
        opts.inline = 'center';
        opts.block = 'center';
      }
    }
    if (modifiers['nearest']) {
      opts.block = opts.block ?? 'nearest';
      opts.inline = opts.inline ?? 'nearest';
    }
    if (modifiers['start']) {
      if (opts.direction === 'x') opts.inline = 'start';
      else opts.block = 'start';
    }
    if (modifiers['end']) {
      if (opts.direction === 'x') opts.inline = 'end';
      else opts.block = 'end';
    }
    if (modifiers['smooth']) {
      opts.behavior = 'smooth';
    }
    if (modifiers['immediate']) {
      opts.behavior = 'auto';
    }
  }

  opts.direction = opts.direction ?? 'both';
  opts.block = opts.block ?? 'nearest';
  opts.inline = opts.inline ?? 'nearest';
  return opts;
};

const executeScroll = (el: HTMLElement, opts: ScrollIntoViewOptions, isMount: boolean) => {
  if (!opts.active) return;

  const doScroll = () => {
    if (!el.isConnected) return;
    const behavior = opts.behavior ?? (isMount ? 'auto' : 'smooth');

    // 纯横向模式：直接在最近的横向滚动容器内按 scrollLeft 滚动，绝不冒泡触发外层纵向视口跳动
    if (opts.direction === 'x') {
      const container = getScrollContainer(el, 'x');
      if (container) {
        const elRect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        let scrollTarget = container.scrollLeft;
        if (opts.inline === 'center') {
          const cardCenter = elRect.left + elRect.width / 2;
          const containerCenter = containerRect.left + containerRect.width / 2;
          scrollTarget += cardCenter - containerCenter;
        } else if (opts.inline === 'start') {
          scrollTarget += elRect.left - containerRect.left;
        } else if (opts.inline === 'end') {
          scrollTarget += elRect.right - containerRect.right;
        } else {
          if (elRect.left < containerRect.left) {
            scrollTarget += elRect.left - containerRect.left;
          } else if (elRect.right > containerRect.right) {
            scrollTarget += elRect.right - containerRect.right;
          }
        }

        const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
        container.scrollTo({
          left: Math.max(0, Math.min(maxScroll, scrollTarget)),
          behavior,
        });
        return;
      }
    }

    // 默认或纵向对齐
    el.scrollIntoView({
      block: opts.direction === 'x' ? 'nearest' : opts.block,
      inline: opts.direction === 'y' ? 'nearest' : opts.inline,
      behavior,
    });
  };

  if (opts.delay && opts.delay > 0) {
    window.setTimeout(doScroll, opts.delay);
  } else {
    nextTick(() => {
      requestAnimationFrame(doScroll);
    });
  }
};

// Vue 内部生命周期钩子槽位：activated 存放在组件实例的 `a` 数组（LifecycleHooks.ACTIVATED），
// KeepAlive 缓存激活时会调用该数组。指令本身无法注册 onActivated（仅 setup 可用），故借助
// KeepAlive 直接子组件实例的 activated 钩子数组感知「组件被缓存后重新激活」。此为 Vue 运行时
// 的稳定内部结构，升级 Vue 时需回归校验；若结构变更，退化为仅 mounted/updated 触发。

type HookableInstance = {
  parent: HookableInstance | null;
  vnode?: { type?: { __isKeepAlive?: boolean } };
  a?: (() => void)[];
};

// 元素 → 已注册的 keepalive 激活回调，避免重复注册并便于卸载时移除。
// bindingRef 用可变容器持有指令绑定的引用：mounted 时闭包进 callback 的 binding 对象此后不会被
// Vue 更新（updated 传入的是全新对象），故用容器承接、每次 updated 时回写最新 binding，保证激活回调取到实时状态。
type ActivatedRegistration = {
  instance: HookableInstance;
  callback: () => void;
  bindingRef: { current: DirectiveBinding<ScrollIntoViewBinding, ScrollIntoViewModifiers> };
};
const activatedRegistrations = new WeakMap<HTMLElement, ActivatedRegistration>();

/** 沿父链向上找到「父级是 KeepAlive」的组件实例：该实例被缓存激活时其 activated 钩子会被调用 */
const findKeepAliveHost = (instance: HookableInstance | null | undefined): HookableInstance | null => {
  let current = instance;
  while (current && current.parent) {
    const parentType = current.parent.vnode?.type as { __isKeepAlive?: boolean } | undefined;
    if (parentType?.__isKeepAlive) {
      return current;
    }
    current = current.parent;
  }
  return null;
};

/** 非 once 模式下，把「激活时按最新指令值重新滚动」回调挂到 keepalive 直接子组件的 activated 队列 */
const registerKeepAliveActivation = (
  el: HTMLElement,
  binding: DirectiveBinding<ScrollIntoViewBinding, ScrollIntoViewModifiers>
) => {
  if (activatedRegistrations.has(el)) return;

  const opts = normalizeOptions(binding.value, binding.modifiers);
  // 仅显式指定 .keep-alive 且非 once 时，才注册 KeepAlive 激活回调；其余场景保持仅 mounted/updated 触发
  if (opts.once || !opts.keepAlive) return;

  const host = (el as unknown as { __vueParentComponent?: HookableInstance }).__vueParentComponent;
  const target = findKeepAliveHost(host);
  if (!target) return;

  // 用可变容器持有 binding：mounted 后 binding 对象自此不再更新，updated 传入的是全新对象。
  // callback 每次执行都经容器读取当前值，从而捕获到实时激活态而非挂载时的陈旧状态。
  const bindingRef: ActivatedRegistration['bindingRef'] = { current: binding };

  const callback = () => {
    const latest = normalizeOptions(bindingRef.current.value, bindingRef.current.modifiers);
    // KeepAlive 缓存激活时不做平滑滚动，直接定位到目标，避免每次切回都出现滚动动画。
    // 注意：这里不能提前用 el.isConnected 短路——激活回调可能早于 KeepAlive 把子树
    // 从 storage 移回文档就跑，而 executeScroll 内部已用 requestAnimationFrame 延迟到
    // 插入完成后执行，并由 doScroll 自带的 isConnected 防御误判，交给它决定即可。
    executeScroll(el, { ...latest, behavior: 'auto' }, false);
  };
  if (!Array.isArray(target.a)) {
    target.a = [callback];
  } else {
    target.a.push(callback);
  }
  activatedRegistrations.set(el, { instance: target, callback, bindingRef });
};

const unregisterKeepAliveActivation = (el: HTMLElement) => {
  const registration = activatedRegistrations.get(el);
  if (!registration) return;
  const hooks = registration.instance.a;
  if (Array.isArray(hooks)) {
    const index = hooks.indexOf(registration.callback);
    if (index > -1) hooks.splice(index, 1);
  }
  activatedRegistrations.delete(el);
};

export const vScrollIntoView: Directive<HTMLElement, ScrollIntoViewBinding, ScrollIntoViewModifiers> = {
  mounted(el, binding) {
    if (isActive(binding.value)) {
      const opts = normalizeOptions(binding.value, binding.modifiers);
      executeScroll(el, opts, true);
    }
    registerKeepAliveActivation(el, binding);
  },
  updated(el, binding) {
    // 把最新 binding 回写进可变更容器，同步 KeepAlive 激活回调读取的绑定态（场景：会话中首次点选
    // 某项时 mounted 捕获的是 active:false 旧对象，updated 传入新对象，若不回写则激活回调读到陈旧态。）
    const registration = activatedRegistrations.get(el);
    if (registration) {
      registration.bindingRef.current = binding;
    }

    const opts = normalizeOptions(binding.value, binding.modifiers);
    if (opts.once) return;

    const currentActive = isActive(binding.value);
    const previousActive = isActive(binding.oldValue);

    if (currentActive && !previousActive) {
      executeScroll(el, opts, false);
    }
  },
  unmounted(el) {
    unregisterKeepAliveActivation(el);
  },
};
