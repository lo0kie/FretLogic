/// <reference types="vite/client" />

import type { TooltipBinding } from './directives/vTooltip';

// 由 vite.config.ts 的 define 注入的构建信息（打包时生成）
declare global {
  const __BUILD_INFO__: {
    /** UTC ISO 时间，例如 2026-08-22T12:34:56.789Z */
    time: string;
    /** 当前 git 提交短 SHA（非 git 环境为 unknown） */
    commit: string;
  };
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;

  export default component;
}

declare module 'vue' {
  interface GlobalDirectives {
    vTooltip: Directive<HTMLElement, TooltipBinding>;
  }
}
