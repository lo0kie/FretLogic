import { nextTick, type Directive } from 'vue';

export type FocusModifiers =
  'select' | 'delay' | 'start' | 'end' | 'all' | 'preventScroll' | 'prevent_scroll' | (string & Record<never, never>);

export interface FocusOptions {
  select?: boolean;
  cursor?: 'start' | 'end' | 'all';
  delay?: number | boolean;
  disabled?: boolean;
  preventScroll?: boolean;
}

export type FocusBinding = boolean | FocusOptions | null | undefined;

const timerMap = new WeakMap<HTMLElement, number>();

const FOCUSABLE_SELECTOR =
  'input:not([disabled]), textarea:not([disabled]), button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

const findFocusTarget = (el: HTMLElement): HTMLElement | null => {
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLButtonElement ||
    el instanceof HTMLSelectElement ||
    el.isContentEditable ||
    (el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1')
  ) {
    if ('disabled' in el && Boolean((el as HTMLButtonElement).disabled)) {
      return null;
    }
    return el;
  }
  return el.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
};

const executeFocus = (el: HTMLElement, modifiers?: Record<string, boolean>, options?: FocusOptions) => {
  const target = findFocusTarget(el);
  if (!target) return;

  const preventScroll = Boolean(
    modifiers?.['preventScroll'] || modifiers?.['prevent_scroll'] || options?.preventScroll
  );
  target.focus({ preventScroll });

  const cursorMode: 'start' | 'end' | 'all' | undefined =
    options?.cursor ||
    (modifiers?.['start']
      ? 'start'
      : modifiers?.['end']
        ? 'end'
        : modifiers?.['select'] || modifiers?.['all'] || options?.select
          ? 'all'
          : undefined);

  if (cursorMode) {
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      if (cursorMode === 'start') {
        target.setSelectionRange(0, 0);
      } else if (cursorMode === 'end') {
        const len = target.value.length;
        target.setSelectionRange(len, len);
      } else if (cursorMode === 'all') {
        target.select();
      }
    } else if (target.isContentEditable) {
      const selection = window.getSelection();
      if (!selection) return;
      const range = document.createRange();
      if (cursorMode === 'start') {
        range.selectNodeContents(target);
        range.collapse(true);
      } else if (cursorMode === 'end') {
        range.selectNodeContents(target);
        range.collapse(false);
      } else if (cursorMode === 'all') {
        range.selectNodeContents(target);
      }
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }
};

const triggerFocusWithTiming = (el: HTMLElement, modifiers?: Record<string, boolean>, options?: FocusOptions) => {
  // 清理既有定时器
  const oldTimer = timerMap.get(el);
  if (oldTimer) {
    clearTimeout(oldTimer);
    timerMap.delete(el);
  }

  const hasDelay = Boolean(modifiers?.['delay'] || options?.delay);
  const delayMs = typeof options?.delay === 'number' ? options.delay : hasDelay ? 60 : 0;

  if (delayMs > 0) {
    const timer = window.setTimeout(() => {
      timerMap.delete(el);
      executeFocus(el, modifiers, options);
    }, delayMs);
    timerMap.set(el, timer);
  } else {
    nextTick(() => executeFocus(el, modifiers, options));
  }
};

const isConfigObject = (val: unknown): val is FocusOptions => typeof val === 'object' && val !== null;

const resolveIsActive = (val: FocusBinding): boolean => {
  if (val === undefined) return true; // v-focus 默认激活
  if (val === false) return false;
  if (val === true) return true;
  if (isConfigObject(val)) return !val.disabled;
  return Boolean(val);
};

export const vFocus: Directive<HTMLElement, FocusBinding, FocusModifiers> = {
  mounted(el, binding) {
    if (!resolveIsActive(binding.value)) return;
    const opts = isConfigObject(binding.value) ? binding.value : undefined;
    triggerFocusWithTiming(el, binding.modifiers, opts);
  },
  updated(el, binding) {
    const isNowActive = resolveIsActive(binding.value);
    const wasActive = resolveIsActive(binding.oldValue);

    // 仅在值从 falsy 转为 truthy 时再次触发聚焦
    if (isNowActive && !wasActive) {
      const opts = isConfigObject(binding.value) ? binding.value : undefined;
      triggerFocusWithTiming(el, binding.modifiers, opts);
    }
  },
  unmounted(el) {
    const timer = timerMap.get(el);
    if (timer) {
      clearTimeout(timer);
      timerMap.delete(el);
    }
  },
};
