/// <reference types="vite/client" />

import type { FocusBinding, FocusModifiers } from './directives/vFocus';
import type { GridNavBinding, GridNavModifiers } from './directives/vGridNav';
import type { MarqueeBinding, MarqueeModifiers } from './directives/vMarquee';
import type { ScrollCacheBinding } from './directives/vScrollCache';
import type { TooltipBinding, TooltipModifiers } from './directives/vTooltip';
import type { WheelScrollBinding, WheelScrollModifiers } from './directives/vWheelScroll';

// 由 vite.config.ts 的 define 注入的构建信息（打包时生成）
declare global {
  const __BUILD_INFO__: {
    /** UTC ISO 时间，例如 2026-08-22T12:34:56.789Z */
    time: string;
    /** 当前 git 提交短 SHA（非 git 环境为 unknown） */
    commit: string;
  };
}

import type { ComponentPublicInstance, VNode } from 'vue';

export type TypedDirective<Host = HTMLElement, Value = unknown, Modifiers extends string = string> =
  | {
      created?: (
        el: Host,
        binding: TypedDirectiveBinding<Value, Modifiers>,
        vnode: VNode<unknown, Host>,
        prevVNode: VNode<unknown, Host> | null
      ) => void;
      beforeMount?: (
        el: Host,
        binding: TypedDirectiveBinding<Value, Modifiers>,
        vnode: VNode<unknown, Host>,
        prevVNode: VNode<unknown, Host> | null
      ) => void;
      mounted?: (
        el: Host,
        binding: TypedDirectiveBinding<Value, Modifiers>,
        vnode: VNode<unknown, Host>,
        prevVNode: VNode<unknown, Host> | null
      ) => void;
      beforeUpdate?: (
        el: Host,
        binding: TypedDirectiveBinding<Value, Modifiers>,
        vnode: VNode<unknown, Host>,
        prevVNode: VNode<unknown, Host> | null
      ) => void;
      updated?: (
        el: Host,
        binding: TypedDirectiveBinding<Value, Modifiers>,
        vnode: VNode<unknown, Host>,
        prevVNode: VNode<unknown, Host> | null
      ) => void;
      beforeUnmount?: (
        el: Host,
        binding: TypedDirectiveBinding<Value, Modifiers>,
        vnode: VNode<unknown, Host>,
        prevVNode: VNode<unknown, Host> | null
      ) => void;
      unmounted?: (
        el: Host,
        binding: TypedDirectiveBinding<Value, Modifiers>,
        vnode: VNode<unknown, Host>,
        prevVNode: VNode<unknown, Host> | null
      ) => void;
      getSSRProps?: (
        binding: TypedDirectiveBinding<Value, Modifiers>,
        vnode: VNode<unknown, Host>
      ) => Record<string, unknown> | undefined;
      deep?: boolean;
    }
  | ((
      el: Host,
      binding: TypedDirectiveBinding<Value, Modifiers>,
      vnode: VNode<unknown, Host>,
      prevVNode: VNode<unknown, Host> | null
    ) => void);

export interface TypedDirectiveBinding<Value = unknown, Modifiers extends string = string> {
  instance: ComponentPublicInstance | null;
  value: Value;
  oldValue: Value | null;
  arg?: string;
  modifiers: { [K in Modifiers]?: boolean } & Record<string, boolean>;
  dir: unknown;
}

declare module '@vue/runtime-core' {
  export interface GlobalDirectives {
    vTooltip: TypedDirective<HTMLElement, TooltipBinding, TooltipModifiers>;
    vWheelScroll: TypedDirective<HTMLElement, WheelScrollBinding, WheelScrollModifiers>;
    vFocus: TypedDirective<HTMLElement, FocusBinding, FocusModifiers>;
    vScrollCache: TypedDirective<HTMLElement, ScrollCacheBinding, string>;
    vGridNav: TypedDirective<HTMLElement, GridNavBinding, GridNavModifiers>;
    vMarquee: TypedDirective<HTMLElement, MarqueeBinding, MarqueeModifiers>;
    vWave: TypedDirective<HTMLElement, unknown, string>;
  }

  export interface ComponentCustomDirectives {
    'vTooltip': TypedDirective<HTMLElement, TooltipBinding, TooltipModifiers>;
    'v-tooltip': TypedDirective<HTMLElement, TooltipBinding, TooltipModifiers>;
    'vWheelScroll': TypedDirective<HTMLElement, WheelScrollBinding, WheelScrollModifiers>;
    'v-wheel-scroll': TypedDirective<HTMLElement, WheelScrollBinding, WheelScrollModifiers>;
    'vFocus': TypedDirective<HTMLElement, FocusBinding, FocusModifiers>;
    'v-focus': TypedDirective<HTMLElement, FocusBinding, FocusModifiers>;
    'vWave': TypedDirective<HTMLElement, unknown, string>;
    'v-wave': TypedDirective<HTMLElement, unknown, string>;
    'vScrollCache': TypedDirective<HTMLElement, ScrollCacheBinding, string>;
    'v-scroll-cache': TypedDirective<HTMLElement, ScrollCacheBinding, string>;
    'vGridNav': TypedDirective<HTMLElement, GridNavBinding, GridNavModifiers>;
    'v-grid-nav': TypedDirective<HTMLElement, GridNavBinding, GridNavModifiers>;
    'vMarquee': TypedDirective<HTMLElement, MarqueeBinding, string>;
    'v-marquee': TypedDirective<HTMLElement, MarqueeBinding, string>;
  }
}

declare module 'vue' {
  export interface GlobalDirectives {
    vTooltip: TypedDirective<HTMLElement, TooltipBinding, TooltipModifiers>;
    vWheelScroll: TypedDirective<HTMLElement, WheelScrollBinding, WheelScrollModifiers>;
    vFocus: TypedDirective<HTMLElement, FocusBinding, FocusModifiers>;
    vScrollCache: TypedDirective<HTMLElement, ScrollCacheBinding, string>;
    vGridNav: TypedDirective<HTMLElement, GridNavBinding, GridNavModifiers>;
    vMarquee: TypedDirective<HTMLElement, MarqueeBinding, MarqueeModifiers>;
    vWave: TypedDirective<HTMLElement, unknown, string>;
  }

  export interface ComponentCustomDirectives {
    'vTooltip': TypedDirective<HTMLElement, TooltipBinding, TooltipModifiers>;
    'v-tooltip': TypedDirective<HTMLElement, TooltipBinding, TooltipModifiers>;
    'vWheelScroll': TypedDirective<HTMLElement, WheelScrollBinding, WheelScrollModifiers>;
    'v-wheel-scroll': TypedDirective<HTMLElement, WheelScrollBinding, WheelScrollModifiers>;
    'vFocus': TypedDirective<HTMLElement, FocusBinding, FocusModifiers>;
    'v-focus': TypedDirective<HTMLElement, FocusBinding, FocusModifiers>;
    'vWave': TypedDirective<HTMLElement, unknown, string>;
    'v-wave': TypedDirective<HTMLElement, unknown, string>;
    'vScrollCache': TypedDirective<HTMLElement, ScrollCacheBinding, string>;
    'v-scroll-cache': TypedDirective<HTMLElement, ScrollCacheBinding, string>;
    'vGridNav': TypedDirective<HTMLElement, GridNavBinding, GridNavModifiers>;
    'v-grid-nav': TypedDirective<HTMLElement, GridNavBinding, GridNavModifiers>;
    'vMarquee': TypedDirective<HTMLElement, MarqueeBinding, string>;
    'v-marquee': TypedDirective<HTMLElement, MarqueeBinding, string>;
  }
}
