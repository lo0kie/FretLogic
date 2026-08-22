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
  /** 打印警告时的前缀标签，便于区分是哪个组件触发的，例如 '[GlobalContextMenu]'。 */
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
   */
  const restoreFocusAfter = (closeFn: () => void) => {
    const elToFocus = triggerEl;
    closeFn();
    nextTick(() => {
      if (!elToFocus || !document.body.contains(elToFocus)) {
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
