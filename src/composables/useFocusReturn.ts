import { nextTick } from 'vue';

const FOCUSABLE_SELECTOR = '[tabindex], button, a[href], input, select, textarea';

const isFocusable = (el: HTMLElement): boolean => {
  if (el.tabIndex >= 0) return true;
  return ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName);
};

/**
 * 从触发源元素解析出真正可聚焦的目标。
 * 常见场景：触发源是一个 display:contents 或纯布局用的包装元素本身不可聚焦，
 * 真正可交互的内容在其子孙节点中（例如插槽渲染的卡片）。
 */
const resolveFocusable = (source: HTMLElement | null): HTMLElement | null => {
  if (!source) return null;
  if (isFocusable(source)) return source;
  return source.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
};

export interface UseFocusReturnOptions {
  /** 归还失败时是否在控制台打印原因，便于排查。默认 true。 */
  warnOnFailure?: boolean;
  /** 打印警告时的前缀标签，便于区分是哪个组件触发的，例如 '[ContextMenu]'。 */
  warnLabel?: string;
}

/**
 * 管理"打开浮层前记录触发元素 → 浮层关闭后把焦点还回去"的通用逻辑。
 * 适用于 Teleport 到 body、脱离原文档流位置的浮层组件（右键菜单、下拉菜单、Popover 等），
 * 这类场景下浏览器原生 Tab/焦点管理无法自动衔接，需要手动归还焦点。
 */
export function useFocusReturn(options: UseFocusReturnOptions = {}) {
  const { warnOnFailure = true, warnLabel = '[useFocusReturn]' } = options;

  let triggerEl: HTMLElement | null = null;

  const warn = (message: string, el: HTMLElement | null) => {
    if (warnOnFailure) console.warn(`${warnLabel} ${message}`, el);
  };

  /**
   * 打开浮层前调用，记录触发源。source 可以是事件的 currentTarget，
   * 也可以是一个不可聚焦的包装元素——内部会自动向下找到真正可聚焦的子元素。
   * 不传时退化为记录当前已聚焦的元素（适合键盘触发场景）。
   */
  const captureTrigger = (source?: HTMLElement | null) => {
    const raw = source ?? (document.activeElement as HTMLElement | null);
    triggerEl = resolveFocusable(raw);
  };

  /** 清空记录的触发源（例如浮层因为其它原因关闭且不需要归还焦点时）。 */
  const clearTrigger = () => {
    triggerEl = null;
  };

  /**
   * 关闭动作 + 归还焦点。closeFn 是实际关闭浮层的函数（如 isOpen.value = false），
   * 归还焦点放在 nextTick 之后执行，避免和 DOM/焦点状态的更新时序冲突。
   *
   * @param closeFn 实际关闭浮层的函数
   * @param shouldSkip 归还前的兜底判断：nextTick 之后、真正 focus() 之前调用，
   *   返回 true 则放弃归还焦点。用于处理"关闭动画播放期间，焦点已经被新打开的
   *   另一个浮层抢走"的场景——此时再抢回来反而会把新浮层顶掉。
   *   典型用法：() => !panelEl.contains(document.activeElement)，
   *   即"当前焦点已经不在本浮层内了，说明是被别的东西拿走的，不该再抢"。
   */
  const restoreFocusAfter = (closeFn: () => void, shouldSkip?: () => boolean) => {
    const elToFocus = triggerEl;
    closeFn();
    nextTick(() => {
      if (!elToFocus) return;
      if (shouldSkip?.()) {
        warn('焦点已被其它元素占用，放弃归还', elToFocus);
        return;
      }
      const active = document.activeElement as HTMLElement | null;
      // 如果当前焦点已经处于页面中另一个有效的可交互元素上（且既不是 trigger 本身，也不是 body），
      // 说明用户已经主动通过 Tab 或点击导航到了新元素，绝不能再抢回焦点！
      if (
        active &&
        active !== document.body &&
        active !== elToFocus &&
        !active.hasAttribute('inert') &&
        document.body.contains(active)
      ) {
        warn('用户已聚焦到新的页面元素，放弃抢回焦点', active);
        return;
      }
      if (!document.body.contains(elToFocus)) {
        warn('触发元素已不在文档中，无法归还焦点', elToFocus);
        return;
      }
      if (!isFocusable(elToFocus)) {
        warn('触发元素不是可聚焦元素，无法归还焦点', elToFocus);
        return;
      }
      elToFocus.focus();
    });
  };

  return {
    captureTrigger,
    clearTrigger,
    restoreFocusAfter,
  };
}

const PAGE_FOCUSABLE_SELECTOR =
  'button:not([disabled]):not([aria-disabled="true"]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';

export function getDocumentFocusableElements(root: Document | HTMLElement = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(PAGE_FOCUSABLE_SELECTOR)).filter(
    el => !el.closest('[data-floating-layer]') && el.offsetParent !== null && !el.hasAttribute('inert')
  );
}

export function focusNextInPageAfter(target: HTMLElement | null): boolean {
  if (!target) return false;
  const elements = getDocumentFocusableElements();
  const currentIndex = elements.indexOf(target);
  let nextEl: HTMLElement | undefined;

  if (currentIndex !== -1) {
    nextEl = elements[currentIndex + 1];
  } else {
    const targetIdx = elements.findIndex(el => {
      const pos = target.compareDocumentPosition(el);
      return (pos & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    });
    if (targetIdx !== -1) {
      nextEl = elements[targetIdx];
    }
  }

  if (nextEl) {
    nextEl.focus();
    return true;
  }
  return false;
}

export function focusPreviousInPageBefore(target: HTMLElement | null): boolean {
  if (!target) return false;
  const elements = getDocumentFocusableElements();
  const currentIndex = elements.indexOf(target);
  let prevEl: HTMLElement | undefined;

  if (currentIndex > 0) {
    prevEl = elements[currentIndex - 1];
  } else if (currentIndex === -1) {
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i]!;
      const pos = target.compareDocumentPosition(el);
      if ((pos & Node.DOCUMENT_POSITION_PRECEDING) !== 0) {
        prevEl = el;
        break;
      }
    }
  }

  if (prevEl) {
    prevEl.focus();
    return true;
  }
  return false;
}
