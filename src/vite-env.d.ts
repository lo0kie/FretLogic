/// <reference types="vite/client" />
import type { ComponentPublicInstance, VNode } from 'vue';

import type { IVWaveDirectiveOptions } from 'v-wave';

import type { ChordNameBinding } from './domains/chord/directives/vChordName.ts';
import type { AutoHeightBinding } from './platform/directives/vAutoHeight.ts';
import type { AutoWidthBinding, AutoWidthModifiers } from './platform/directives/vAutoWidth.ts';
import type { FocusBinding, FocusModifiers } from './platform/directives/vFocus.ts';
import type { GridNavBinding, GridNavModifiers } from './platform/directives/vGridNav.ts';
import type { MarqueeBinding, MarqueeModifiers } from './platform/directives/vMarquee.ts';
import type { ScrollIntoViewBinding, ScrollIntoViewModifiers } from './platform/directives/vScrollIntoView.ts';
import type { TooltipBinding, TooltipModifiers } from './platform/directives/vTooltip.ts';
import type { WheelScrollBinding, WheelScrollModifiers } from './platform/directives/vWheelScroll.ts';

// 由 vite.config.ts 的 define 注入的构建信息（打包时生成）
declare global {
  const __BUILD_INFO__: {
    /** UTC ISO 时间，例如 2026-08-22T12:34:56.789Z */
    time: string;
    /** 当前 git 提交短 SHA（非 git 环境为 unknown） */
    commit: string;
  };
}

/** v-wave 指令（material ripple）的绑定值：涟漪选项，可按需覆盖任意字段，空对象 / 裸指令均合法 */
export type WaveDirectiveValue = Partial<IVWaveDirectiveOptions>;

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
    vScrollIntoView: TypedDirective<HTMLElement, ScrollIntoViewBinding, ScrollIntoViewModifiers>;
    vGridNav: TypedDirective<HTMLElement, GridNavBinding, GridNavModifiers>;
    vMarquee: TypedDirective<HTMLElement, MarqueeBinding, MarqueeModifiers>;
    vChordName: TypedDirective<HTMLElement, ChordNameBinding, string>;
    vAutoWidth: TypedDirective<HTMLElement, AutoWidthBinding, AutoWidthModifiers>;
    vAutoHeight: TypedDirective<HTMLElement, AutoHeightBinding, string>;
    vWave: TypedDirective<HTMLElement, WaveDirectiveValue, string>;
  }

  export interface ComponentCustomDirectives {
    'vTooltip': TypedDirective<HTMLElement, TooltipBinding, TooltipModifiers>;
    'v-tooltip': TypedDirective<HTMLElement, TooltipBinding, TooltipModifiers>;
    'vWheelScroll': TypedDirective<HTMLElement, WheelScrollBinding, WheelScrollModifiers>;
    'v-wheel-scroll': TypedDirective<HTMLElement, WheelScrollBinding, WheelScrollModifiers>;
    'vFocus': TypedDirective<HTMLElement, FocusBinding, FocusModifiers>;
    'v-focus': TypedDirective<HTMLElement, FocusBinding, FocusModifiers>;
    'vWave': TypedDirective<HTMLElement, WaveDirectiveValue, string>;
    'v-wave': TypedDirective<HTMLElement, WaveDirectiveValue, string>;
    'vScrollIntoView': TypedDirective<HTMLElement, ScrollIntoViewBinding, ScrollIntoViewModifiers>;
    'v-scroll-into-view': TypedDirective<HTMLElement, ScrollIntoViewBinding, ScrollIntoViewModifiers>;
    'vGridNav': TypedDirective<HTMLElement, GridNavBinding, GridNavModifiers>;
    'v-grid-nav': TypedDirective<HTMLElement, GridNavBinding, GridNavModifiers>;
    'vMarquee': TypedDirective<HTMLElement, MarqueeBinding, string>;
    'v-marquee': TypedDirective<HTMLElement, MarqueeBinding, string>;
    'vChordName': TypedDirective<HTMLElement, ChordNameBinding, string>;
    'v-chord-name': TypedDirective<HTMLElement, ChordNameBinding, string>;
    'vAutoWidth': TypedDirective<HTMLElement, AutoWidthBinding, AutoWidthModifiers>;
    'v-auto-width': TypedDirective<HTMLElement, AutoWidthBinding, AutoWidthModifiers>;
    'vAutoHeight': TypedDirective<HTMLElement, AutoHeightBinding, string>;
    'v-auto-height': TypedDirective<HTMLElement, AutoHeightBinding, string>;
  }
}

declare module 'vue' {
  export interface GlobalDirectives {
    vTooltip: TypedDirective<HTMLElement, TooltipBinding, TooltipModifiers>;
    vWheelScroll: TypedDirective<HTMLElement, WheelScrollBinding, WheelScrollModifiers>;
    vFocus: TypedDirective<HTMLElement, FocusBinding, FocusModifiers>;
    vScrollIntoView: TypedDirective<HTMLElement, ScrollIntoViewBinding, ScrollIntoViewModifiers>;
    vGridNav: TypedDirective<HTMLElement, GridNavBinding, GridNavModifiers>;
    vMarquee: TypedDirective<HTMLElement, MarqueeBinding, MarqueeModifiers>;
    vChordName: TypedDirective<HTMLElement, ChordNameBinding, string>;
    vAutoWidth: TypedDirective<HTMLElement, AutoWidthBinding, AutoWidthModifiers>;
    vAutoHeight: TypedDirective<HTMLElement, AutoHeightBinding, string>;
    vWave: TypedDirective<HTMLElement, WaveDirectiveValue, string>;
  }

  export interface ComponentCustomDirectives {
    'vTooltip': TypedDirective<HTMLElement, TooltipBinding, TooltipModifiers>;
    'v-tooltip': TypedDirective<HTMLElement, TooltipBinding, TooltipModifiers>;
    'vWheelScroll': TypedDirective<HTMLElement, WheelScrollBinding, WheelScrollModifiers>;
    'v-wheel-scroll': TypedDirective<HTMLElement, WheelScrollBinding, WheelScrollModifiers>;
    'vFocus': TypedDirective<HTMLElement, FocusBinding, FocusModifiers>;
    'v-focus': TypedDirective<HTMLElement, FocusBinding, FocusModifiers>;
    'vWave': TypedDirective<HTMLElement, WaveDirectiveValue, string>;
    'v-wave': TypedDirective<HTMLElement, WaveDirectiveValue, string>;
    'vScrollIntoView': TypedDirective<HTMLElement, ScrollIntoViewBinding, ScrollIntoViewModifiers>;
    'v-scroll-into-view': TypedDirective<HTMLElement, ScrollIntoViewBinding, ScrollIntoViewModifiers>;
    'vGridNav': TypedDirective<HTMLElement, GridNavBinding, GridNavModifiers>;
    'v-grid-nav': TypedDirective<HTMLElement, GridNavBinding, GridNavModifiers>;
    'vMarquee': TypedDirective<HTMLElement, MarqueeBinding, string>;
    'v-marquee': TypedDirective<HTMLElement, MarqueeBinding, string>;
    'vChordName': TypedDirective<HTMLElement, ChordNameBinding, string>;
    'v-chord-name': TypedDirective<HTMLElement, ChordNameBinding, string>;
    'vAutoWidth': TypedDirective<HTMLElement, AutoWidthBinding, AutoWidthModifiers>;
    'v-auto-width': TypedDirective<HTMLElement, AutoWidthBinding, AutoWidthModifiers>;
    'vAutoHeight': TypedDirective<HTMLElement, AutoHeightBinding, string>;
    'v-auto-height': TypedDirective<HTMLElement, AutoHeightBinding, string>;
  }
}
