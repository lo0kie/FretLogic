/// <reference types="vite/client" />
import type { ChordNameBinding } from './domains/chord/directives/vChordName';
import type { ActionCardBinding } from './platform/directives/vActionCard';
import type { AutoHeightBinding } from './platform/directives/vAutoHeight';
import type { AutoWidthBinding, AutoWidthModifiers } from './platform/directives/vAutoWidth';
import type { EdgeFadeBinding, EdgeFadeModifiers } from './platform/directives/vEdgeFade';
import type { FocusBinding, FocusModifiers } from './platform/directives/vFocus';
import type { GridNavBinding, GridNavModifiers } from './platform/directives/vGridNav';
import type { MarqueeBinding, MarqueeModifiers } from './platform/directives/vMarquee';
import type { ScrollbarBinding, ScrollbarModifiers } from './platform/directives/vScrollbar';
import type { ScrollIntoViewBinding, ScrollIntoViewModifiers } from './platform/directives/vScrollIntoView';
import type { TooltipBinding, TooltipModifiers } from './platform/directives/vTooltip';
import type { WheelScrollBinding, WheelScrollModifiers } from './platform/directives/vWheelScroll';
import type { IVWaveDirectiveOptions } from 'v-wave';
import type { ComponentPublicInstance, VNode } from 'vue';

/** Vite 虚拟模块：颜色令牌 CSS（颜色单一来源在仓库根 tokens/，构建期由 culori 派生后注入） */
declare module 'virtual:color-tokens.css';

// 由 vite.config.ts 的 define 注入的构建信息（打包时生成）
declare global {
  const __BUILD_INFO__: {
    /** UTC ISO 时间，例如 2026-08-22T12:34:56.789Z */
    time: string;
    /** 当前 git 提交短 SHA（非 git 环境为 unknown） */
    commit: string;
  };

  /**
   * Worker 侧字体集（`WorkerGlobalScope.fonts`，即 `self.fonts`）。
   *
   * 为什么需要：DOM lib 把字体集挂在 `Document` 上（`document.fonts`），`Window` 没有；而渲染 Worker
   * 的 OffscreenCanvas 只认**自己环境**的 FontFaceSet，故 Worker 内必须读 `self.fonts`。本项目不引
   * webworker lib（会与 DOM 的同名声明冲突），故在此给全局对象补上该属性。
   *
   * 为何是 `var` 而非 `const`：只有 `var` / `function` 声明才会成为 `globalThis` 的属性（TS 对经
   * `globalThis` 访问 BlockScoped 全局变量直接报错），而本项必须经 `globalThis.fonts` 读取 ——
   * 主线程上该属性不存在，读取得 undefined，调用方据此回落到 `document.fonts`。
   */
  var fonts: FontFaceSet | undefined;

  /**
   * Safari 的厂商前缀 Web Audio 构造器。本仓不引 webkit 类型包，故在此声明。
   *
   * 声明为**非可选**：与 lib.dom 对 `AudioContext` 本身的处置一致（类型上恒在、运行时才可能缺失），
   * 消费方用 `window.AudioContext || window.webkitAudioContext` 兜底，因此不必再就地断言出这个属性。
   */
  var webkitAudioContext: typeof AudioContext;

  /**
   * File System Access API 的入口函数。lib.dom 收录了 `FileSystemFileHandle` 等句柄类型，
   * 却没有这个入口，故在此补声明。
   * 声明为**可选**：Firefox / Safari 上不存在该属性，消费方据此降级到动态 input（见 transfer.pickFile）。
   */
  var showOpenFilePicker:
    | ((config?: {
        multiple?: boolean;
        types?: { description?: string; accept: Record<string, string[]> }[];
      }) => Promise<FileSystemFileHandle[]>)
    | undefined;

  /** v-wheel-scroll 指令派发的自定义事件（扩展原生元素事件映射，供 addEventListener 类型推断） */
  interface HTMLElementEventMap {
    'wheel-scroll': CustomEvent<{ scrollLeft: number; progress: number }>;
    'wheel-scroll-edge': CustomEvent<{ edge: 'left' | 'right' }>;
  }
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
    vActionCard: TypedDirective<HTMLElement, ActionCardBinding, string>;
    vWheelScroll: TypedDirective<HTMLElement, WheelScrollBinding, WheelScrollModifiers>;
    vFocus: TypedDirective<HTMLElement, FocusBinding, FocusModifiers>;
    vScrollIntoView: TypedDirective<HTMLElement, ScrollIntoViewBinding, ScrollIntoViewModifiers>;
    vGridNav: TypedDirective<HTMLElement, GridNavBinding, GridNavModifiers>;
    vMarquee: TypedDirective<HTMLElement, MarqueeBinding, MarqueeModifiers>;
    vEdgeFade: TypedDirective<HTMLElement, EdgeFadeBinding, EdgeFadeModifiers>;
    vChordName: TypedDirective<HTMLElement, ChordNameBinding, string>;
    vScrollbar: TypedDirective<HTMLElement, ScrollbarBinding, ScrollbarModifiers>;
    vAutoWidth: TypedDirective<HTMLElement, AutoWidthBinding, AutoWidthModifiers>;
    vAutoHeight: TypedDirective<HTMLElement, AutoHeightBinding, string>;
    vWave: TypedDirective<HTMLElement, WaveDirectiveValue, string>;
  }

  export interface ComponentCustomDirectives {
    'vTooltip': TypedDirective<HTMLElement, TooltipBinding, TooltipModifiers>;
    'v-tooltip': TypedDirective<HTMLElement, TooltipBinding, TooltipModifiers>;
    'vActionCard': TypedDirective<HTMLElement, ActionCardBinding, string>;
    'v-action-card': TypedDirective<HTMLElement, ActionCardBinding, string>;
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
    'vEdgeFade': TypedDirective<HTMLElement, EdgeFadeBinding, string>;
    'v-edge-fade': TypedDirective<HTMLElement, EdgeFadeBinding, EdgeFadeModifiers>;
    'vChordName': TypedDirective<HTMLElement, ChordNameBinding, string>;
    'v-chord-name': TypedDirective<HTMLElement, ChordNameBinding, string>;
    'vScrollbar': TypedDirective<HTMLElement, ScrollbarBinding, ScrollbarModifiers>;
    'v-scrollbar': TypedDirective<HTMLElement, ScrollbarBinding, ScrollbarModifiers>;
    'vAutoWidth': TypedDirective<HTMLElement, AutoWidthBinding, AutoWidthModifiers>;
    'v-auto-width': TypedDirective<HTMLElement, AutoWidthBinding, AutoWidthModifiers>;
    'vAutoHeight': TypedDirective<HTMLElement, AutoHeightBinding, string>;
    'v-auto-height': TypedDirective<HTMLElement, AutoHeightBinding, string>;
  }
}

declare module 'vue' {
  export interface GlobalDirectives {
    vTooltip: TypedDirective<HTMLElement, TooltipBinding, TooltipModifiers>;
    vActionCard: TypedDirective<HTMLElement, ActionCardBinding, string>;
    vWheelScroll: TypedDirective<HTMLElement, WheelScrollBinding, WheelScrollModifiers>;
    vFocus: TypedDirective<HTMLElement, FocusBinding, FocusModifiers>;
    vScrollIntoView: TypedDirective<HTMLElement, ScrollIntoViewBinding, ScrollIntoViewModifiers>;
    vGridNav: TypedDirective<HTMLElement, GridNavBinding, GridNavModifiers>;
    vMarquee: TypedDirective<HTMLElement, MarqueeBinding, MarqueeModifiers>;
    vEdgeFade: TypedDirective<HTMLElement, EdgeFadeBinding, EdgeFadeModifiers>;
    vChordName: TypedDirective<HTMLElement, ChordNameBinding, string>;
    vScrollbar: TypedDirective<HTMLElement, ScrollbarBinding, ScrollbarModifiers>;
    vAutoWidth: TypedDirective<HTMLElement, AutoWidthBinding, AutoWidthModifiers>;
    vAutoHeight: TypedDirective<HTMLElement, AutoHeightBinding, string>;
    vWave: TypedDirective<HTMLElement, WaveDirectiveValue, string>;
  }

  export interface ComponentCustomDirectives {
    'vTooltip': TypedDirective<HTMLElement, TooltipBinding, TooltipModifiers>;
    'v-tooltip': TypedDirective<HTMLElement, TooltipBinding, TooltipModifiers>;
    'vActionCard': TypedDirective<HTMLElement, ActionCardBinding, string>;
    'v-action-card': TypedDirective<HTMLElement, ActionCardBinding, string>;
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
    'vEdgeFade': TypedDirective<HTMLElement, EdgeFadeBinding, string>;
    'v-edge-fade': TypedDirective<HTMLElement, EdgeFadeBinding, EdgeFadeModifiers>;
    'vChordName': TypedDirective<HTMLElement, ChordNameBinding, string>;
    'v-chord-name': TypedDirective<HTMLElement, ChordNameBinding, string>;
    'vScrollbar': TypedDirective<HTMLElement, ScrollbarBinding, ScrollbarModifiers>;
    'v-scrollbar': TypedDirective<HTMLElement, ScrollbarBinding, ScrollbarModifiers>;
    'vAutoWidth': TypedDirective<HTMLElement, AutoWidthBinding, AutoWidthModifiers>;
    'v-auto-width': TypedDirective<HTMLElement, AutoWidthBinding, AutoWidthModifiers>;
    'vAutoHeight': TypedDirective<HTMLElement, AutoHeightBinding, string>;
    'v-auto-height': TypedDirective<HTMLElement, AutoHeightBinding, string>;
  }
}
