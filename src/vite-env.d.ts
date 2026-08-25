/// <reference types="vite/client" />

import type { Directive } from 'vue';
import type { FocusBinding, FocusModifiers } from './directives/vFocus';
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

declare module '@vue/runtime-core' {
  export interface ComponentCustomDirectives {
    'vTooltip': Directive<HTMLElement, TooltipBinding, TooltipModifiers>;
    'v-tooltip': Directive<HTMLElement, TooltipBinding, TooltipModifiers>;
    'vWheelScroll': Directive<HTMLElement, WheelScrollBinding, WheelScrollModifiers>;
    'v-wheel-scroll': Directive<HTMLElement, WheelScrollBinding, WheelScrollModifiers>;
    'vFocus': Directive<HTMLElement, FocusBinding, FocusModifiers>;
    'v-focus': Directive<HTMLElement, FocusBinding, FocusModifiers>;
    'vWave': Directive<HTMLElement, unknown>;
    'v-wave': Directive<HTMLElement, unknown>;
  }
}

declare module 'vue' {
  export interface ComponentCustomDirectives {
    'vTooltip': Directive<HTMLElement, TooltipBinding, TooltipModifiers>;
    'v-tooltip': Directive<HTMLElement, TooltipBinding, TooltipModifiers>;
    'vWheelScroll': Directive<HTMLElement, WheelScrollBinding, WheelScrollModifiers>;
    'v-wheel-scroll': Directive<HTMLElement, WheelScrollBinding, WheelScrollModifiers>;
    'vFocus': Directive<HTMLElement, FocusBinding, FocusModifiers>;
    'v-focus': Directive<HTMLElement, FocusBinding, FocusModifiers>;
    'vWave': Directive<HTMLElement, unknown>;
    'v-wave': Directive<HTMLElement, unknown>;
  }
}
