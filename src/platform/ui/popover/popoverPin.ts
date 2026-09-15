import { inject } from 'vue';

import type { InjectionKey } from 'vue';

/** BasePopover 面板内容钉住自身的注入键：调用后浮层进入钉住态（hover 移出不再自动关闭，点外部/Esc 仍可关闭） */
export const POPOVER_PIN_KEY: InjectionKey<() => void> = Symbol('popover-pin');

/**
 * 面板内容在发生明确交互（如展开折叠分组）后调用，钉住宿主浮层；
 * 不在 BasePopover 面板内（或宿主非 hover 触发）时为空操作。
 */
export const usePopoverPin = (): (() => void) => inject(POPOVER_PIN_KEY, () => {});
