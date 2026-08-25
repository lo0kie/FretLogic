import { nextTick, type Directive } from 'vue';

export type FocusModifiers = 'select' | 'delay' | (string & Record<never, never>);

export interface FocusOptions {
  select?: boolean;
  delay?: number | boolean;
  disabled?: boolean;
}

export type FocusBinding = boolean | FocusOptions | undefined;

const FOCUSABLE_SELECTOR =
  'input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

const findFocusTarget = (el: HTMLElement): HTMLElement | null => {
  if (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.hasAttribute('contenteditable') ||
    (el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1')
  ) {
    return el;
  }
  return el.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
};

const executeFocus = (el: HTMLElement, modifiers?: Record<string, boolean>, options?: FocusOptions) => {
  const target = findFocusTarget(el);
  if (!target) return;

  const shouldSelect = Boolean(modifiers?.select || options?.select);
  target.focus();

  if (shouldSelect) {
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      target.select();
    } else if (target.isContentEditable) {
      const range = document.createRange();
      range.selectNodeContents(target);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }
};

const triggerFocusWithTiming = (el: HTMLElement, modifiers?: Record<string, boolean>, options?: FocusOptions) => {
  const hasDelay = Boolean(modifiers?.delay || options?.delay);
  const delayMs = typeof options?.delay === 'number' ? options.delay : hasDelay ? 60 : 0;

  if (delayMs > 0) {
    setTimeout(() => executeFocus(el, modifiers, options), delayMs);
  } else {
    nextTick(() => executeFocus(el, modifiers, options));
  }
};

const isConfigObject = (val: unknown): val is FocusOptions => typeof val === 'object' && val !== null;

export const vFocus: Directive<HTMLElement, FocusBinding, FocusModifiers> = {
  mounted(el, binding) {
    if (binding.value === false) return;
    const opts = isConfigObject(binding.value) ? binding.value : undefined;
    if (opts?.disabled) return;

    triggerFocusWithTiming(el, binding.modifiers, opts);
  },
  updated(el, binding) {
    const isNowActive = binding.value === true || (isConfigObject(binding.value) && !binding.value.disabled);
    const wasActive = binding.oldValue === true || (isConfigObject(binding.oldValue) && !binding.oldValue.disabled);

    // 仅在值从 falsy 转为 truthy 时再次触发聚焦
    if (isNowActive && !wasActive) {
      const opts = isConfigObject(binding.value) ? binding.value : undefined;
      triggerFocusWithTiming(el, binding.modifiers, opts);
    }
  },
};
